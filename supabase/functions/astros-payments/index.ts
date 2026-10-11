import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!;
const db=createClient(SUPABASE_URL,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const APP='https://desbanimento-de-numeros.lovable.app';
const notify=`${SUPABASE_URL}/functions/v1/astros-payments?webhook=1`;
function json(body: unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
async function settings(){const {data,error}=await db.from('astros_payment_settings').select('*').eq('id',true).single();if(error||!data)throw Error('Execute primeiro o SQL de pagamentos no Supabase.');return data;}
async function mp(path:string,token:string,body?:unknown,key?:string){
 const r=await fetch(`https://api.mercadopago.com${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(key?{'X-Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(25000)});
 if(!r.ok)throw Error('O Mercado Pago recusou a operação. Confira as credenciais e os dados do pagamento.');return r.json();
}
async function reconcile(paymentId:string,config:any){
 if(!/^\d+$/.test(paymentId))throw Error('Pagamento inválido.');
 const p=await mp(`/v1/payments/${paymentId}`,config.access_token);
 if(String(p.collector_id)!==String(config.collector_id)||p.currency_id!=='BRL'||p.live_mode!==config.live_mode)throw Error('Pagamento divergente da configuração.');
 if(!z.string().uuid().safeParse(p.external_reference).success)throw Error('Pagamento sem referência Astros.');
 const {data:order,error}=await db.from('astros_payment_orders').select('*').eq('id',p.external_reference).single();
 if(error||!order)throw Error('Solicitação não encontrada.');
 if(order.live_mode!==p.live_mode)throw Error('Ambiente do pagamento divergente.');
 const cents=Math.round(Number(p.transaction_amount)*100);
 if(!Number.isSafeInteger(cents)||cents!==Number(order.amount_cents))throw Error('Valor divergente.');
 const status=p.status;
 const refundedCents=Math.round(Number(p.transaction_amount_refunded||0)*100);
 if(!config.live_mode){await db.from('astros_payment_orders').update({status:`test_${status}`}).eq('id',order.id);return `test_${status}`;}
 const {error:apply}=await db.rpc('astros_apply_payment',{order_id:order.id,payment_id:String(p.id),payment_status:status,paid_cents:cents,refunded_cents:refundedCents});
 if(apply)throw Error('Não foi possível confirmar o saldo. Tente verificar novamente.');
 return status;
}
async function validSignature(req:Request,secret:string,id:string){
 const pieces=Object.fromEntries((req.headers.get('x-signature')||'').split(',').map(v=>v.trim().split('=')));
 const requestId=req.headers.get('x-request-id');
 if(!requestId||!pieces.ts||!pieces.v1||!/^\d+$/.test(pieces.ts)||!/^[a-f0-9]{64}$/i.test(pieces.v1))return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const signature=new Uint8Array(pieces.v1.match(/.{2}/g)!.map(v=>parseInt(v,16)));
 return crypto.subtle.verify('HMAC',key,signature,new TextEncoder().encode(`id:${id.toLowerCase()};request-id:${requestId};ts:${pieces.ts};`));
}
Deno.serve(async req=>{
 if(req.method!=='POST')return json({error:'Método não permitido.'},405);
 try{
  const url=new URL(req.url);
  if(url.searchParams.get('webhook')==='1'){
   const config=await settings();const id=url.searchParams.get('data.id')||'';
   if(!config.webhook_secret||!await validSignature(req,config.webhook_secret,id))return json({error:'Notificação não autorizada.'},401);
   const event=await req.json();
   if(event.type!=='payment')return json({received:true});
   if(String(event.data?.id)!==id)return json({error:'Notificação divergente.'},400);
   await reconcile(id,config);return json({received:true});
  }
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
  const {data:{user},error:authError}=await db.auth.getUser(token);
  if(authError||!user||!user.email_confirmed_at)return json({error:'Sua sessão expirou ou o e-mail não foi confirmado.'},401);
  const {data:profile}=await db.from('painel_de_desbanimento').select('id,tipo_usuario').eq('id',user.id).single();
  if(!profile)return json({error:'Conta não encontrada.'},403);
  const {action,data}=await req.json();
  if(action==='settings'||action==='save-settings'){
   if(profile.tipo_usuario!=='admin')return json({error:'Acesso administrativo não autorizado.'},403);
   let config=await settings();
   if(action==='save-settings'){
    const input=z.object({accessToken:z.string().trim().max(1024),webhookSecret:z.string().trim().max(1024),enabled:z.boolean(),liveMode:z.boolean(),servicePriceCents:z.number().int().min(0).max(1000000)}).strict().parse(data);
    const access=input.accessToken||config.access_token;const secret=input.webhookSecret||config.webhook_secret;
    if(input.enabled&&(!access||!secret))throw Error('Informe Access Token e chave secreta do webhook antes de ativar.');
    let collector=config.collector_id;
    if(access){const account=await mp('/users/me',access);collector=String(account.id);}
    if(config.collector_id&&collector!==config.collector_id){const {count}=await db.from('astros_payment_orders').select('id',{head:true,count:'exact'});if(count)throw Error('Esta carteira já possui pagamentos vinculados. Não é possível trocar a conta recebedora por aqui.');}
    if(input.enabled&&input.liveMode!==!access.startsWith('TEST-'))throw Error('O ambiente selecionado não corresponde ao Access Token.');
    if((access!==config.access_token||input.liveMode!==config.live_mode)&&config.enabled)throw Error('Desative os pagamentos antes de trocar a credencial ou o ambiente.');
    const {error}=await db.from('astros_payment_settings').update({access_token:access,webhook_secret:secret,collector_id:collector,enabled:input.enabled,live_mode:input.liveMode,service_price_cents:input.servicePriceCents,updated_at:new Date().toISOString()}).eq('id',true);
    if(error)throw Error('Não foi possível salvar as configurações.');config=await settings();
   }
   return json({enabled:config.enabled,liveMode:config.live_mode,hasAccessToken:!!config.access_token,hasWebhookSecret:!!config.webhook_secret,servicePriceCents:Number(config.service_price_cents),webhookUrl:notify});
  }
  if(action==='create'){
   const input=z.object({amountCents:z.number().int().min(500).max(1000000),method:z.enum(['pix','card']),requestId:z.string().uuid(),cpf:z.string().regex(/^\d{11}$/).optional()}).strict().parse(data);
   if(input.method==='pix'&&!input.cpf)throw Error('Informe o CPF do pagador para gerar o Pix.');
   const config=await settings();if(!config.enabled||!config.access_token)throw Error('As recargas ainda não estão disponíveis.');
   const {count}=await db.from('astros_payment_orders').select('id',{count:'exact',head:true}).eq('user_id',user.id).gte('created_at',new Date(Date.now()-300000).toISOString()).neq('id',input.requestId);
   if((count||0)>=10)throw Error('Aguarde alguns minutos antes de gerar outra recarga.');
   const {error:insert}=await db.from('astros_payment_orders').upsert({id:input.requestId,user_id:user.id,amount_cents:input.amountCents,method:input.method,live_mode:config.live_mode},{onConflict:'id',ignoreDuplicates:true});
   if(insert)throw Error('Não foi possível iniciar a recarga.');
   const {data:order}=await db.from('astros_payment_orders').select('*').eq('id',input.requestId).single();
   if(!order||order.user_id!==user.id||Number(order.amount_cents)!==input.amountCents||order.method!==input.method)throw Error('Solicitação divergente.');
   if(!order.mp_payment_id&&!order.checkout_url){
    const reference=order.id;const value=input.amountCents/100;
    const payload=input.method==='pix'?{transaction_amount:value,description:'Recarga da carteira Astros',payment_method_id:'pix',external_reference:reference,notification_url:notify,payer:{email:user.email,identification:{type:'CPF',number:input.cpf}}}:{items:[{id:reference,title:'Recarga da carteira Astros',quantity:1,currency_id:'BRL',unit_price:value}],external_reference:reference,notification_url:notify,payer:{email:user.email},back_urls:{success:`${APP}/carteira`,pending:`${APP}/carteira`,failure:`${APP}/carteira`},auto_return:'approved',payment_methods:{excluded_payment_types:[{id:'ticket'},{id:'bank_transfer'},{id:'debit_card'},{id:'atm'},{id:'prepaid_card'}]}};
    const payment=await mp(input.method==='pix'?'/v1/payments':'/checkout/preferences',config.access_token,payload,order.id);
    const tx=payment.point_of_interaction?.transaction_data;
    const update=input.method==='pix'?{mp_payment_id:String(payment.id),status:payment.status,qr_code:tx?.qr_code,qr_base64:tx?.qr_code_base64}:{status:'pending',checkout_url:config.live_mode?payment.init_point:payment.sandbox_init_point};
    const {error}=await db.from('astros_payment_orders').update(update).eq('id',order.id);
    if(error)throw Error('Pagamento gerado, mas não foi possível salvar. Verifique novamente antes de repetir.');
   }
   const {data:result}=await db.from('astros_payment_orders').select('id,method,status,qr_code,qr_base64,checkout_url,amount_cents').eq('id',order.id).single();return json(result);
  }
  if(action==='check'){
   const input=z.object({orderId:z.string().uuid()}).strict().parse(data);
   const {data:order}=await db.from('astros_payment_orders').select('*').eq('id',input.orderId).eq('user_id',user.id).single();
   if(!order)throw Error('Recarga não encontrada.');
   const config=await settings();
   let status=order.status;
   if(order.mp_payment_id)status=await reconcile(order.mp_payment_id,config);
   else{
    const found=await mp(`/v1/payments/search?external_reference=${encodeURIComponent(order.id)}&sort=date_created&criteria=desc`,config.access_token);
    const approved=found.results?.find((p:any)=>p.status==='approved');
    if(approved)status=await reconcile(String(approved.id),config);
   }
   return json({status});
  }
  return json({error:'Operação inválida.'},400);
 }catch(error){
  const message=error instanceof z.ZodError?'Confira os dados informados.':error instanceof Error?error.message:'Não foi possível processar a operação.';
  // Never return provider payloads, tokens, SQL errors or stack traces.
  return json({error:message},400);
 }
});
