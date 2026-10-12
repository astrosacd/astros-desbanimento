import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { classify, confirmed, normalize, type Row } from './core.ts';
import { canonicalPhone } from './phone.ts';
import { scanRows } from './scan.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const BASE='https://baserow.astroscomunicacaodigital.com';
const PATH='/api/database/rows/table/511/';
const schema=z.object({number:z.string().trim().max(40).regex(/^[+\d\s().-]+$/),country:z.string().regex(/^([A-Z]{2}|custom:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i).default('BR'),requestId:z.string().uuid(),action:z.enum(['quote','submit']),expectedCents:z.number().int().min(0).max(1000000).optional()}).strict();
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
// GET redirects may only add/remove the endpoint's trailing slash. Never redirect writes.
async function baserow(path:string,body?:unknown,method='GET'){
 const token=Deno.env.get('ASTROS_BASEROW_WRITE_TOKEN');
 if(!token)throw Error('O envio ainda está em configuração.');
 let url=new URL(path,BASE);
 for(let attempt=0;attempt<4;attempt++){
  const r=await fetch(url,{method,headers:{Authorization:`Token ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'manual',signal:AbortSignal.timeout(15000)});
  if([301,302,303,307,308].includes(r.status)){
   const next=new URL(r.headers.get('location')||'',url);
   if(method!=='GET'||next.origin!==BASE||next.pathname.replace(/\/$/,'')!==url.pathname.replace(/\/$/,'')||next.search!==url.search)throw Error('O endereço do Baserow precisa de conferência.');
   url=next;continue;
  }
  if(!r.ok)throw Error('O Baserow não confirmou a operação.');
  return await r.json();
 }
 throw Error('O Baserow não respondeu corretamente.');
}
async function allRows(){
 return scanRows(page=>baserow(`${PATH}?size=200&page=${page}`));
}
Deno.serve(async req=>{
 if(req.method!=='POST')return json({success:false,message:'Método não permitido.'},405);
 let reserved=false;let requestId='';let context:any;let stage='session';const started=Date.now();
 try{
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
  const {data:{user},error:authError}=await db.auth.getUser(token);
  if(authError||!user?.email||!user.email_confirmed_at)return json({success:false,message:'Sua sessão expirou ou o e-mail não foi confirmado.'},401);
  const raw=schema.parse(await req.json());let custom;
  if(raw.country.startsWith('custom:')){
   const {data,error}=await db.from('astros_custom_countries').select('id,ddi').eq('id',raw.country.slice(7)).maybeSingle();
   if(error||!data)throw Error('Este país adicional não está disponível. Atualize a lista e selecione outro país.');
   custom=data;
  }
  const input={...raw,number:canonicalPhone(raw.number,raw.country,custom)};requestId=input.requestId;
  const {data:old,error:oldError}=await db.from('astros_service_jobs').select('user_id,number,state,result').eq('id',requestId).maybeSingle();
  if(oldError)throw Error('O controle de solicitações ainda não está disponível.');
  if(old){
   if(old.user_id!==user.id||old.number!==input.number)throw Error('Referência divergente.');
   return json(old.result||{success:false,state:old.state,message:'Este envio está em andamento ou aguardando conferência. Consulte o histórico ou o suporte.'});
  }
  stage='profile-and-price';
  const [{data:profile,error:profileError},{data:config,error:configError}]=await Promise.all([
   db.from('painel_de_desbanimento').select('id,nome,recarga').eq('id',user.id).single(),
   db.from('astros_payment_settings').select('service_price_cents').eq('id',true).single(),
  ]);
  if(profileError||!profile)throw Error('Conta não encontrada.');
  if(configError)throw Error('Não foi possível consultar a taxa do serviço.');
  stage='baserow-lookup';
  const plan=classify(await allRows(),input.number,user.email,Number(config.service_price_cents),input.country);
  context={success:true,number:input.number,kind:plan.kind,costCents:plan.costCents,targetStatus:plan.targetStatus};
  if(plan.costCents>0&&(!Number.isFinite(Number(profile.recarga??0))||Math.round(Number(profile.recarga??0)*100)<plan.costCents))throw Error(`Saldo insuficiente para enviar este número. A taxa é ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(plan.costCents/100)}. Adicione saldo para continuar.`);
  if(input.action==='quote')return json({...context,state:'quoted',message:plan.costCents?'Confira a taxa antes de confirmar.':'Este reenvio não desconta saldo.'});
  if(input.expectedCents!==plan.costCents)throw Error('O valor ou a situação do número mudou. Consulte novamente antes de confirmar.');
  stage='balance-reservation';
  const {data:reservation,error:reserveError}=await db.rpc('astros_start_service',{request_id:requestId,client_id:user.id,phone:input.number,service_kind:plan.kind,expected_cents:plan.costCents,target:plan.targetStatus});
  // An unknown RPC outcome must never proceed to Baserow or use a new reference.
  if(reserveError)return json({success:false,message:String(reserveError.message||'').includes('Saldo insuficiente')?'Saldo insuficiente. Adicione saldo para continuar.':String(reserveError.message||'').includes('Taxa não configurada')?'A taxa do serviço ainda não foi configurada.':'Não foi possível confirmar a reserva. Confira o saldo e o histórico antes de tentar novamente com a mesma referência.'});
  if(!reservation?.execute)return json(reservation||{success:false,message:'Não foi possível confirmar a reserva.'});
  reserved=true;
  // Recheck after locking/reserving, before performing any external write.
  stage='baserow-recheck';
  const fresh=classify(await allRows(),input.number,user.email,Number(config.service_price_cents),input.country);
  if(fresh.row?.id!==plan.row?.id||fresh.row?.field_4831?.value!==plan.row?.field_4831?.value||fresh.kind!==plan.kind){
   const response={...context,success:false,state:'failed',message:'A situação do número mudou. Nenhum envio foi feito e a taxa foi devolvida. Consulte novamente.'};
   const {error}=await db.rpc('astros_finish_service',{request_id:requestId,final_state:'failed',response});
   if(error)throw Error('Não foi possível confirmar a devolução.');
   return json(response);
  }
  const observations=plan.kind==='resend'?String(fresh.row?.field_4784||''):(input.country==='BR'?'nacional':'internacional');
  const stamp=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'medium'}).format(new Date());
  const fields={field_4784:observations,field_4831:plan.kind==='resend'?2520:2521};
  stage='baserow-write';
  const written:Row=plan.row
   ?await baserow(`${PATH}${plan.row.id}/`,fields,'PATCH')
   :await baserow(PATH,{...fields,field_4740:profile.nome,field_4741:input.number,field_4773:user.email,field_4827:stamp},'POST');
  if(!confirmed(written,input.number,user.email,plan.targetStatus,observations,input.country))throw Error('A gravação precisa de conferência.');
  // Read back the saved row: a successful HTTP response alone is not enough.
  stage='baserow-readback';
  const readBack:Row=await baserow(`${PATH}${written.id}/`);
  if(!confirmed(readBack,input.number,user.email,plan.targetStatus,observations,input.country))throw Error('A gravação precisa de conferência.');
  const response={...context,state:'completed',message:plan.costCents?'Solicitação enviada. A taxa foi descontada do saldo.':'Reenvio solicitado sem desconto no saldo.'};
  stage='finish-history';
  const {error:finishError}=await db.rpc('astros_finish_service',{request_id:requestId,final_state:'completed',response});
  if(finishError)throw Error('Não foi possível confirmar o histórico.');
  return json(response);
 }catch(error){
  if(error instanceof Error&&['TypeError','AbortError','TimeoutError'].includes(error.name))console.warn('astros_submit_transport_failure',{stage,elapsedMs:Date.now()-started,reserved,code:error.name});
  if(reserved){
   const response={...context,success:false,state:'review',message:'O envio precisa de conferência pelo suporte. Não envie outra solicitação para este número. Consulte o histórico.'};
   await db.rpc('astros_finish_service',{request_id:requestId,final_state:'review',response}).catch(()=>undefined);
   return json(response);
  }
  return json({success:false,message:error instanceof z.ZodError?'Dados da solicitação inválidos.':error instanceof Error&&/^(Saldo insuficiente|Este país|Selecione|Confira o número|Este número|O status|A taxa|O envio|O controle|Conta não|Não foi possível consultar|O valor|Referência|A base|O Baserow|O endereço)/.test(error.message)?error.message:'Não foi possível consultar o serviço. Tente novamente em alguns instantes.'},400);
 }
});
