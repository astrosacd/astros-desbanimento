// Código completo para atualizar a função existente astros-payments.
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
async function reconcile(paymentId:string,config:any,cardInfo=false){
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
 const result=(value:string)=>cardInfo?{status:value,paymentId:String(p.id),challenge:cardChallenge(p)}:value;
 const refundedCents=Math.round(Number(p.transaction_amount_refunded||0)*100);
 if(!config.live_mode){await db.from('astros_payment_orders').update({status:`test_${status}`}).eq('id',order.id);return result(`test_${status}`);}
 const {error:apply}=await db.rpc('astros_apply_payment',{order_id:order.id,payment_id:String(p.id),payment_status:status,paid_cents:cents,refunded_cents:refundedCents});
 if(apply)throw Error('Não foi possível confirmar o saldo. Tente verificar novamente.');
 return result(status);
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
    const input=z.object({accessToken:z.string().trim().max(1024),webhookSecret:z.string().trim().max(1024),publicKey:z.string().trim().max(200).regex(/^(?:(?:APP_USR|TEST)-[A-Za-z0-9-]+)?$/).optional(),enabled:z.boolean(),liveMode:z.boolean(),servicePriceCents:z.number().int().min(0).max(1000000),minimumEnabled:z.boolean(),minimumRechargeCents:z.number().int().min(0).max(1000000)}).strict().parse(data);
    if(input.minimumEnabled&&input.minimumRechargeCents<1)throw Error('Informe um mínimo maior que zero ou escolha sem mínimo.');
    const access=input.accessToken||config.access_token;const secret=input.webhookSecret||config.webhook_secret;
    if(input.publicKey&&input.liveMode===input.publicKey.startsWith('TEST-'))throw Error('A Public Key não corresponde ao ambiente selecionado.');
    if(input.enabled&&(!access||!secret))throw Error('Informe Access Token e chave secreta do webhook antes de ativar.');
    let collector=config.collector_id;
    if(access&&(input.accessToken||!collector)){const account=await mp('/users/me',access);collector=String(account.id);}
    if(config.collector_id&&collector!==config.collector_id){const {count}=await db.from('astros_payment_orders').select('id',{head:true,count:'exact'});if(count)throw Error('Esta carteira já possui pagamentos vinculados. Não é possível trocar a conta recebedora por aqui.');}
    if(input.enabled&&input.liveMode!==!access.startsWith('TEST-'))throw Error('O ambiente selecionado não corresponde ao Access Token.');
    if((access!==config.access_token||input.liveMode!==config.live_mode)&&config.enabled)throw Error('Desative os pagamentos antes de trocar a credencial ou o ambiente.');
    const {error}=await db.from('astros_payment_settings').update({...(input.publicKey?{public_key:input.publicKey}:{}),access_token:access,webhook_secret:secret,collector_id:collector,enabled:input.enabled,live_mode:input.liveMode,service_price_cents:input.servicePriceCents,minimum_enabled:input.minimumEnabled,minimum_recharge_cents:input.minimumRechargeCents,updated_at:new Date().toISOString()}).eq('id',true);
    if(error)throw Error('Não foi possível salvar as configurações.');config=await settings();
   }
   return json({enabled:config.enabled,liveMode:config.live_mode,hasAccessToken:!!config.access_token,hasWebhookSecret:!!config.webhook_secret,publicKey:config.public_key||'',servicePriceCents:Number(config.service_price_cents),minimumEnabled:config.minimum_enabled,minimumRechargeCents:Number(config.minimum_recharge_cents),webhookUrl:notify});
  }
  if(action==='card-config'){
   const config=await settings();return json({publicKey:config.public_key||'',enabled:!!config.enabled});
  }
  if(action==='pay-card'){
   const input=z.object({orderId:z.string().uuid(),token:z.string().min(10).max(256).regex(/^[A-Za-z0-9_-]+$/),paymentMethodId:z.string().min(1).max(50).regex(/^[A-Za-z0-9_-]+$/),issuerId:z.string().regex(/^\d{1,20}$/).optional(),installments:z.number().int().min(1).max(12),identification:z.object({type:z.enum(['CPF','CNPJ']),number:z.string().regex(/^\d{11}(\d{3})?$/)}).strict()}).strict().parse(data);
   const config=await settings();if(!config.enabled||!config.public_key)throw Error('O pagamento com cartão ainda não está configurado.');
   const {data:order}=await db.from('astros_payment_orders').select('*').eq('id',input.orderId).eq('user_id',user.id).single();
   if(!order||order.user_id!==user.id||order.method!=='card'||order.card_mode!=='embedded'||order.live_mode!==config.live_mode)throw Error('Recarga de cartão inválida para esta conta.');
   if(order.mp_payment_id)return json({id:order.id,...await reconcile(order.mp_payment_id,config,true) as any});
   const methods=await mp('/v1/payment_methods',config.access_token);
   if(!Array.isArray(methods)||!methods.some((m:any)=>m.id===input.paymentMethodId&&m.payment_type_id==='credit_card'&&m.status==='active'))throw Error('Selecione um cartão de crédito válido.');
   const payload={three_d_secure_mode:'optional',transaction_amount:Number(order.amount_cents)/100,token:input.token,installments:input.installments,payment_method_id:input.paymentMethodId,...(input.issuerId?{issuer_id:input.issuerId}:{}),description:'Recarga da carteira Astros',external_reference:order.id,notification_url:notify,payer:{email:user.email,identification:input.identification}};
   const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload))))).map(v=>v.toString(16).padStart(2,'0')).join('');
   const {data:claimed,error:claimError}=await db.rpc('astros_claim_card_payment',{order_id:order.id,fingerprint});
   if(claimError)throw Error('Esta recarga já possui uma tentativa ou precisa ser atualizada. Consulte o pagamento antes de reenviar.');
   if(!claimed){const {data:current}=await db.from('astros_payment_orders').select('mp_payment_id').eq('id',order.id).single();if(!current?.mp_payment_id)throw Error('Pagamento em conferência. Aguarde a confirmação automática.');return json({id:order.id,...await reconcile(current.mp_payment_id,config,true) as any});}
   const payment=await mp('/v1/payments',config.access_token,payload,order.id);
   if(!/^\d+$/.test(String(payment.id)))throw Error('O pagamento precisa de conferência. Aguarde a confirmação automática.');
   const {error:saveError}=await db.from('astros_payment_orders').update({mp_payment_id:String(payment.id)}).eq('id',order.id);
   if(saveError)throw Error('O pagamento precisa de conferência. Não gere outra recarga para repetir esta tentativa.');
   return json({id:order.id,...await reconcile(String(payment.id),config,true) as any});
  }
  if(action==='create'||action==='prepare-card'){
   const input=z.object({amountCents:z.number().int().min(1).max(1000000),method:z.enum(['pix','card']),requestId:z.string().uuid(),cpf:z.string().regex(/^\d{11}$/).optional()}).strict().parse(action==='prepare-card'?{...data,method:'card'}:data);
   if(input.method==='pix'&&!input.cpf)throw Error('Informe o CPF do pagador para gerar o Pix.');
   const config=await settings();if(!config.enabled||!config.access_token)throw Error('As recargas ainda não estão disponíveis.');
   if(action==='prepare-card'&&!config.public_key)throw Error('O pagamento com cartão ainda não está configurado.');
   if(config.minimum_enabled&&input.amountCents<Number(config.minimum_recharge_cents))throw Error(`A recarga mínima é de R$ ${(Number(config.minimum_recharge_cents)/100).toFixed(2).replace('.',',')}.`);
   const {count}=await db.from('astros_payment_orders').select('id',{count:'exact',head:true}).eq('user_id',user.id).gte('created_at',new Date(Date.now()-300000).toISOString()).neq('id',input.requestId);
   if((count||0)>=10)throw Error('Aguarde alguns minutos antes de gerar outra recarga.');
   const {error:insert}=await db.from('astros_payment_orders').upsert({id:input.requestId,user_id:user.id,amount_cents:input.amountCents,method:input.method,live_mode:config.live_mode,...(action==='prepare-card'?{card_mode:'embedded'}:{})},{onConflict:'id',ignoreDuplicates:true});
   if(insert)throw Error('Não foi possível iniciar a recarga.');
   const {data:order}=await db.from('astros_payment_orders').select('*').eq('id',input.requestId).single();
   if(!order||order.user_id!==user.id||Number(order.amount_cents)!==input.amountCents||order.method!==input.method||(action==='prepare-card'&&order.card_mode!=='embedded'))throw Error('Solicitação divergente.');
   if(action==='prepare-card')return json({id:order.id,method:'card',card_mode:'embedded',status:order.status,amount_cents:Number(order.amount_cents),publicKey:config.public_key});
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
    const approved=order.card_mode==='embedded'?found.results?.[0]:found.results?.find((p:any)=>p.status==='approved');
    if(approved)status=await reconcile(String(approved.id),config);
   }
   if(order.card_mode==='embedded'&&order.card_fingerprint&&!order.mp_payment_id&&!['approved','rejected','cancelled','refunded','charged_back'].includes(String(status).replace(/^test_/,'')))status='pending';
   return json({status});
  }
  return json({error:'Operação inválida.'},400);
 }catch(error){
  const message=error instanceof z.ZodError?paymentValidationMessage(error):error instanceof Error?error.message:'Não foi possível processar a operação.';
  // Never return provider payloads, tokens, SQL errors or stack traces.
  return json({error:message},400);
 }
});

function paymentValidationMessage(error:z.ZodError){
 const issue=error.issues[0];
 if(issue?.code==='unrecognized_keys')return 'Os campos recebidos não correspondem à versão da função de pagamentos. Atualize astros-payments no Supabase. (P01)';
 const labels:Record<string,string>={publicKey:'Public Key',accessToken:'Access Token',webhookSecret:'Chave secreta do webhook',enabled:'Habilitar recargas',liveMode:'Ambiente',servicePriceCents:'Taxa de desbanimento',minimumEnabled:'Opção de recarga mínima',minimumRechargeCents:'Valor mínimo de recarga',amountCents:'Valor da recarga',method:'Forma de pagamento',requestId:'Referência da recarga',cpf:'CPF do pagador'};
 const label=labels[String(issue?.path.at(-1))];
 if(!label)return 'A configuração recebida está incompleta ou incompatível. Atualize astros-payments no Supabase. (P02)';
 if(issue?.code==='too_big'&&['accessToken','webhookSecret'].includes(String(issue.path.at(-1))))return `${label}: conteúdo muito longo. Cole somente a credencial, sem código ou texto adicional. (P03)`;
 return `Confira o campo ${label}. O valor recebido está ausente ou em formato inválido. (P04)`;
}

function cardChallenge(payment:any){
 if(payment.status_detail!=='pending_challenge'||!payment.three_ds_info)return null;
 const info=payment.three_ds_info;
 try{const url=new URL(info.external_resource_url);if(url.protocol!=='https:'||url.username||url.password||typeof info.creq!=='string'||!info.creq||info.creq.length>12000)return null;return {externalResourceURL:url.href,creq:info.creq};}catch{return null;}
}
