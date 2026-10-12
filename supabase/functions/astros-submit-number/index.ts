import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { classify, confirmed, normalize, type Row } from './core.ts';
import { canonicalPhone } from './phone.ts';
import { scanRows } from './scan.ts';
import {receiptMatches,reconciliationDecision,jobResponse,type ServiceJob} from './reconcile.ts';
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
  if(!r.ok){if(method!=='GET'&&[400,401,403,404,405,413,415,422].includes(r.status))throw new WriteRejected('O Baserow recusou a gravação.');throw Error('O Baserow não confirmou a operação.');}
  return await r.json();
 }
 throw Error('O Baserow não respondeu corretamente.');
}
async function allRows(){
 return scanRows(page=>baserow(`${PATH}?size=200&page=${page}`));
}
class WriteRejected extends Error {}
async function markerField(){
 const fields=await baserow('/api/database/fields/table/511/');
 if(!Array.isArray(fields))throw Error('O rastreamento dos envios ainda está em configuração.');
 const matching=fields.filter(f=>f.name==='astros_solicitacao_id'&&['text','long_text'].includes(f.type));
 if(matching.length!==1||!Number.isSafeInteger(matching[0].id))throw Error('O rastreamento dos envios ainda está em configuração.');
 return `field_${matching[0].id}`;
}
async function workerAuthorized(req:Request){
 const expected=Deno.env.get('ASTROS_RECONCILE_SECRET')||'';const actual=req.headers.get('x-astros-worker-secret')||'';
 if(expected.length<48||actual.length!==expected.length)return false;
 const a=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(expected)));const b=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(actual)));
 let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]!^b[i]!;return diff===0;
}
async function requireAutomation(){
 const secret=Deno.env.get('ASTROS_RECONCILE_SECRET')||'';
 if(secret.length<48)throw Error('A conferência automática ainda está em configuração.');
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)));const hash=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
 const {data,error}=await db.rpc('astros_reconcile_ready',{worker_hash:hash});if(error||data!==true)throw Error('A conferência automática ainda está em configuração.');
}
async function finishJob(job:ServiceJob,state:string){
 const response=jobResponse(job,state);const {data,error}=await db.rpc('astros_finish_service_v2',{request_id:job.id,lease:job.lease_key,final_state:state,response});
 if(error)throw Error('Não foi possível confirmar o resultado.');return data||response;
}
async function reconcile(jobId:string|null=null){
 const {data:job,error}=await db.rpc('astros_claim_service',{job_id:jobId});
 if(error)throw Error('A conferência automática ainda está em configuração.');if(!job)return {success:true,checked:0,message:'Nenhum envio disponível para conferência neste momento.'};
 let decision:'completed'|'failed'|'processing'|'review';
 if(['prepared','rejected'].includes(job.remote_phase))decision='failed';
 else{try{decision=reconciliationDecision(job,await allRows());}catch{decision=job.check_attempts>=12?'review':'processing';}}
 const result=await finishJob(job,decision);return {success:true,checked:1,state:result.state};
}
Deno.serve(async req=>{
 if(req.method!=='POST')return json({success:false,message:'Método não permitido.'},405);
 let job:ServiceJob|undefined;let dispatched=false;let requestId='';let context:any;let stage='session';const started=Date.now();
 try{
  if(new URL(req.url).searchParams.get('worker')==='1'){
   if(!await workerAuthorized(req))return json({success:false,message:'Conferência não autorizada.'},401);
   const {error:pingError}=await db.rpc('astros_service_worker_ping');if(pingError)throw Error('A conferência automática ainda está em configuração.');
   return json(await reconcile());
  }
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
  const {data:{user},error:authError}=await db.auth.getUser(token);
  if(authError||!user?.email||!user.email_confirmed_at)return json({success:false,message:'Sua sessão expirou ou o e-mail não foi confirmado.'},401);
  const body=await req.json();
  if(body.action==='admin-reconcile'){
   const input=z.object({action:z.literal('admin-reconcile'),requestId:z.string().uuid()}).strict().parse(body);
   const {data:admin}=await db.from('painel_de_desbanimento').select('tipo_usuario').eq('id',user.id).single();
   if(admin?.tipo_usuario!=='admin')return json({success:false,message:'Acesso administrativo não autorizado.'},403);
   return json(await reconcile(input.requestId));
  }
  const raw=schema.parse(body);let custom;
  if(raw.country.startsWith('custom:')){
   const {data,error}=await db.from('astros_custom_countries').select('id,ddi').eq('id',raw.country.slice(7)).maybeSingle();
   if(error||!data)throw Error('Este país adicional não está disponível. Atualize a lista e selecione outro país.');custom=data;
  }
  const input={...raw,number:canonicalPhone(raw.number,raw.country,custom)};requestId=input.requestId;
  const {data:old,error:oldError}=await db.from('astros_service_jobs').select('*').eq('id',requestId).maybeSingle();
  if(oldError)throw Error('O controle de solicitações ainda não está disponível.');
  if(old){
   if(old.user_id!==user.id||old.number!==input.number)throw Error('Referência divergente.');
   return json(old.protocol_version===2?jobResponse(old,old.state):old.result||{success:false,state:old.state,message:'Este envio antigo precisa de conferência pela equipe.'});
  }
  stage='profile-and-price';
  const [{data:profile,error:profileError},{data:config,error:configError}]=await Promise.all([
   db.from('painel_de_desbanimento').select('id,nome,recarga').eq('id',user.id).single(),
   db.from('astros_payment_settings').select('service_price_cents').eq('id',true).single(),
  ]);
  if(profileError||!profile)throw Error('Conta não encontrada.');if(configError)throw Error('Não foi possível consultar a taxa do serviço.');
  stage='baserow-lookup';
  const plan=classify(await allRows(),input.number,user.email,Number(config.service_price_cents),input.country);
  context={success:true,number:input.number,kind:plan.kind,costCents:plan.costCents,targetStatus:plan.targetStatus};
  if(plan.costCents>0&&(!Number.isFinite(Number(profile.recarga??0))||Math.round(Number(profile.recarga??0)*100)<plan.costCents))throw Error(`Saldo insuficiente para enviar este número. A taxa é ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(plan.costCents/100)}. Adicione saldo para continuar.`);
  if(input.action==='quote')return json({...context,state:'quoted',message:'Número e saldo conferidos.'});
  if(input.expectedCents!==plan.costCents)throw Error('O valor ou a situação do número mudou. Consulte novamente antes de confirmar.');
  await requireAutomation();const marker=await markerField();const intent={email:user.email,country:input.country,number:input.number,targetStatus:plan.targetStatus,markerField:marker};
  stage='balance-reservation';
  const {data:reservation,error:reserveError}=await db.rpc('astros_start_service_v2',{request_id:requestId,client_id:user.id,phone:input.number,service_kind:plan.kind,expected_cents:plan.costCents,target:plan.targetStatus,intent});
  if(reserveError)return json({success:false,message:String(reserveError.message||'').includes('Saldo insuficiente')?'Saldo insuficiente. Adicione saldo para continuar.':'Não foi possível confirmar a reserva. Confira o histórico antes de tentar com a mesma referência.'});
  if(!reservation?.execute)return json(reservation||{success:false,message:'Não foi possível confirmar a reserva.'});
  job={id:requestId,user_id:user.id,number:input.number,kind:plan.kind,amount_cents:plan.costCents,target_status:plan.targetStatus,state:'processing',protocol_version:2,remote_phase:'prepared',remote_intent:intent,lease_key:reservation.leaseKey,check_attempts:0};
  stage='baserow-recheck';const fresh=classify(await allRows(),input.number,user.email,Number(config.service_price_cents),input.country);
  if(fresh.row?.id!==plan.row?.id||fresh.row?.field_4831?.value!==plan.row?.field_4831?.value||fresh.kind!==plan.kind)return json(await finishJob(job,'failed'));
  const observations=plan.kind==='resend'?String(fresh.row?.field_4784||''):(input.country==='BR'?'nacional':'internacional');
  const stamp=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'medium'}).format(new Date());
  const fields={field_4784:observations,field_4831:plan.kind==='resend'?2520:2521,[marker]:requestId};
  const {data:dispatch,error:dispatchError}=await db.rpc('astros_dispatch_service',{request_id:requestId,lease:job.lease_key});
  if(dispatchError||dispatch!==true)throw Error('A conferência já está em andamento.');
  job.remote_phase='dispatching';dispatched=true;stage='baserow-write';
  const written:Row=plan.row?await baserow(`${PATH}${plan.row.id}/`,fields,'PATCH'):await baserow(PATH,{...fields,field_4740:profile.nome,field_4741:input.number,field_4773:user.email,field_4827:stamp},'POST');
  if(!receiptMatches(written,job))throw Error('A gravação precisa de conferência.');
  stage='baserow-readback';const readBack:Row=await baserow(`${PATH}${written.id}/`);if(!receiptMatches(readBack,job))throw Error('A gravação precisa de conferência.');
  stage='finish-history';return json(await finishJob(job,'completed'));
 }catch(error){
  if(error instanceof Error&&['TypeError','AbortError','TimeoutError'].includes(error.name))console.warn('astros_submit_transport_failure',{stage,elapsedMs:Date.now()-started,reserved:!!job,code:error.name});
  if(job){
   try{
    if(error instanceof WriteRejected){const response=jobResponse(job,'failed');const {data,error:refuseError}=await db.rpc('astros_refuse_service',{request_id:job.id,lease:job.lease_key,response});if(!refuseError)return json(data||response);}
    else if(!dispatched)return json(await finishJob(job,'failed'));
    return json(await finishJob(job,'processing'));
   }catch{return json(jobResponse(job,'processing'));}
  }
  return json({success:false,message:error instanceof z.ZodError?'Dados da solicitação inválidos.':error instanceof Error&&/^(Saldo insuficiente|Este país|Selecione|Confira o número|Este número|O status|A taxa|O envio|O controle|O rastreamento|A conferência|Conta não|Não foi possível consultar|O valor|Referência|A base|O Baserow|O endereço)/.test(error.message)?error.message:'Não foi possível consultar o serviço. Tente novamente em alguns instantes.'},400);
 }
});
