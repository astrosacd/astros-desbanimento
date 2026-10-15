// SMSPool bridge: all credentials, catalog authority and wallet writes stay on the server.
declare const Deno: {env:{get:(name:string)=>string|undefined};serve:(handler:(req:Request)=>Promise<Response>)=>void};
type Obj=Record<string,any>;
export function units(value:unknown,places=6):number {
 const s=String(value??'');if(!new RegExp(`^\\d{1,7}(?:\\.\\d{1,${places}})?$`).test(s))throw Error('Valor indisponível.');
 const [a,b='']=s['split']('.');const n=Number(a)*10**places+Number(b.padEnd(places,'0'));if(!Number.isSafeInteger(n))throw Error('Valor indisponível.');return n;
}
export function saleCents(usd:number,fx:number,margin:number,fee:number){
 if(![usd,fx,margin,fee].every(Number.isSafeInteger)||usd<=0||fx<=0||margin<0||margin>100000||fee<0)throw Error('Confira os valores de venda.');
 const numerator=BigInt(usd)*BigInt(fx)*BigInt(10000+margin);const cents=Number((numerator+999999999999n)/1000000000000n)+fee;
 if(!Number.isSafeInteger(cents)||cents<1||cents>1000000)throw Error('Preço fora do limite permitido.');return cents;
}
export function parseActivation(value:Obj){
 if(value?.['success']!==1||!/^[-a-zA-Z0-9_]{1,100}$/.test(String(value['order_id']??''))||!/^\d{5,18}$/.test(String(value['number']??'')))throw Error('Confirmação da ativação pendente.');
 const expiration=Number(value['expiration']);if(!Number.isSafeInteger(expiration)||expiration<1)throw Error('Confirmação da ativação pendente.');
 return {provider:String(value['order_id']),phone:String(value['number']),expiry:new Date(expiration*1000).toISOString(),usd:units(value['cost'])};
}
export function stateFromCheck(value:Obj):'pending'|'received'|'refunded'|'review'{
 if(value['status']===3&&typeof value['sms']==='string'&&value['sms'].length>0&&value['sms'].length<=200)return 'received';
 if(value['status']===6)return 'refunded';
 if([1,4,7,8].includes(value['status']))return 'pending';
 return 'review'; // Expired/cancelled alone are not proof of a provider refund.
}
export function chooseOffer(value:unknown,service:number,country:number){
 if(!Array.isArray(value))throw Error('Não foi possível consultar a disponibilidade agora. Tente novamente.');
 const offers:Array<{pool:number;usd:number}>=[];
 const rows=value.flat(3);
 if(rows.length&&!rows.some(row=>row&&Number.isSafeInteger(Number(row.country))&&Number.isSafeInteger(Number(row.service))&&Number.isFinite(Number(row.stock))))throw Error('Não foi possível validar o estoque retornado pelo fornecedor. Tente novamente.');
 for(const row of rows){if(!row||Number(row.service)!==service||Number(row.country)!==country||!Number.isSafeInteger(Number(row.stock))||Number(row.stock)<1)continue;
  const pool=Number(row.pool);if(!Number.isSafeInteger(pool)||pool<=0||pool>1000000)continue;
  try{const usd=units(row.price);if(usd>0)offers.push({pool,usd});}catch{/* Ignore malformed offers, never guess cost. */}
 }
 offers.sort((a,b)=>a.usd-b.usd||a.pool-b.pool);
 if(!offers[0])throw Error('Não há números disponíveis para esse serviço neste país. Experimente outro país.');return offers[0];
}
export function effectiveFx(market:number,deposit:number,fixed:number,depositBps:number,conversion:number,extra:number){
 if(![market,deposit,fixed,depositBps,conversion,extra].every(Number.isSafeInteger)||market<1||market>10000000||deposit<1000000||deposit>10000000000||fixed<0||fixed>100000000||[depositBps,conversion,extra].some(v=>v<0||v>5000))throw Error('Confira as taxas e a recarga de referência.');
 const net=BigInt(deposit)*BigInt(10000-depositBps)-BigInt(fixed)*10000n;
 if(net<=0n)throw Error('A recarga de referência não cobre as taxas.');
 const credit=((net+50000000n)/100000000n)*10000n;if(credit<=0n)throw Error('A recarga de referência não cobre as taxas.');
 const n=BigInt(market)*BigInt(10000+conversion)*BigInt(10000+extra)*BigInt(deposit),d=100000000n*credit;
 const result=Number((n+d-1n)/d);if(result<1||result>10000000)throw Error('Cotação fora do limite.');return result;
}
export function marketRate(value:any,now=Date.now()){
 const date=value?.date,rate=Number(value?.rate);const time=Date.parse(String(date)+'T00:00:00Z');
 if(String(value?.base).toUpperCase()!=='USD'||String(value?.quote).toUpperCase()!=='BRL'||!/^\d{4}-\d{2}-\d{2}$/.test(String(date))||!Number.isFinite(time)||time>now+86400000||time<now-7*86400000||!Number.isFinite(rate)||rate<=0||rate>1000)throw Error('Cotação automática indisponível ou desatualizada.');
 return {market:Math.ceil(rate*10000),source_date:date};
}
async function fetchMarket(){try{const r=await fetch('https://api.frankfurter.dev/v2/rate/USD/BRL',{redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();return marketRate(await r.json());}catch{throw Error('Não foi possível atualizar o dólar. Novas compras dependem de uma cotação válida ou do modo manual.');}}
async function ensureFx(s:Obj,force=false):Promise<Obj>{
 if(s['fx_mode']!=='auto')return s;
 if(!force&&s['fx_checked_at']&&Date.now()-Date.parse(s['fx_checked_at'])<3600000&&s['fx_date']&&Date.now()-Date.parse(s['fx_date']+'T00:00:00Z')<7*86400000)return s;
 const value=await fetchMarket();await db('rpc/astros_sms_refresh_fx','POST',value);return settings();
}
function env(name:string){const s=Deno.env.get(name);if(!s)throw Error('Serviço ainda não configurado.');return s;}
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});
async function db(path:string,method='GET',data?:unknown):Promise<any>{
 const r=await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`,{method,headers:{apikey:env('SUPABASE_SERVICE_ROLE_KEY'),Authorization:`Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`,'Content-Type':'application/json',Prefer:'return=representation'},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(12000)});
 const v=await r.json().catch(()=>null);if(!r.ok)throw Error((path.startsWith('rpc/astros_sms_reserve')||path==='rpc/astros_sms_review_begin')&&typeof v?.message==='string'&&['Saldo insuficiente. Faça uma recarga','Atualize o preço antes de comprar','Referência divergente','Cotação já utilizada','Conclua suas ativações em andamento','Serviço indisponível','Um cancelamento já aguarda confirmação. Consulte o fornecedor sem repetir o cancelamento','Não há confirmação do fornecedor para esta ação'].includes(v.message)?v.message:'Não foi possível confirmar os dados. Tente atualizar.');return v;
}
async function settings(){return (await db('astros_sms_settings?id=eq.true'))[0] as Obj;}
async function privateSettings(){return (await db('astros_sms_private?id=eq.true'))[0] as Obj;}
async function provider(path:string,data:Obj={},key?:string):Promise<any>{
 const form=new FormData();for(const[k,v]of Object.entries(data))form.set(k,String(v));if(key)form.set('key',key);
 try{const r=await fetch(`https://api.smspool.net/${path}`,{method:'POST',body:form,redirect:'error',signal:AbortSignal.timeout(path==='sms/check'?8000:20000)});
 const v=await r.json();if(!r.ok)throw Error('Não foi possível consultar o serviço de SMS. Tente novamente.');return v;}catch{throw Error('Não foi possível consultar o serviço de SMS. Tente novamente.');}
}
async function supplierBalance(key:string){const value=await provider('request/balance',{},key);if(value?.success===0)throw Error('Saldo do fornecedor indisponível.');return units(value?.balance);}
export function historyQuery(data:Obj,owner:string,adminView=false){
 const allowed=['page','search','state','from','until','email'];if(Object.keys(data).some(k=>!allowed.includes(k)))throw Error('Filtro inválido.');
 const page=Number(data.page??0);if(!Number.isSafeInteger(page)||page<0||page>100000)throw Error('Página inválida.');
 const clean=(v:unknown,max:number)=>{const text=String(v??'').trim().normalize('NFC');if(text.length>max||!/^[\p{L}\p{N} @._+\-]*$/u.test(text))throw Error('Use letras, números ou e-mail na busca.');return text;};
 let search=String(data.search??'').trim();if(/^[+\d ()-]+$/.test(search))search=search.replace(/\D/g,'');search=clean(search,80);
 const email=clean(data.email,254);if(email&&!adminView)throw Error('Filtro inválido.');
 const state=String(data.state??'all');if(!['all','dispatching','pending','received','refunded','review'].includes(state))throw Error('Situação inválida.');
 const date=(v:unknown)=>{const text=String(v??''),parsed=new Date(text+'T00:00:00Z');if(text&&(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==text))throw Error('Data inválida.');return text;};
 const from=date(data.from),until=date(data.until);if(from&&until&&from>until)throw Error('A data inicial deve ser anterior à final.');
 const fields='id,user_id,service_name,country_name,price_cents,state,phone,code,expires_at,created_at'+(adminView?',provider_id,painel_de_desbanimento!inner(nome,email)':'');
 const params=new URLSearchParams({select:fields,order:'created_at.desc,id.desc',limit:'21',offset:String(page*20)});
 if(!adminView)params.set('user_id','eq.'+owner);if(state!=='all')params.set('state','eq.'+state);
 if(search)params.set('or',`(phone.ilike.*${search}*,service_name.ilike.*${search}*,country_name.ilike.*${search}*)`);
 if(email)params.set('painel_de_desbanimento.email','ilike.*'+email+'*');
 const dates=[];if(from)dates.push('created_at.gte.'+new Date(from+'T00:00:00-03:00').toISOString());if(until)dates.push('created_at.lte.'+new Date(until+'T23:59:59.999-03:00').toISOString());if(dates.length)params.set('and','('+dates.join(',')+')');
 return params;
}
async function identity(req:Request){
 const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');if(!token)throw Error('Entre novamente para continuar.');
 const r=await fetch(`${env('SUPABASE_URL')}/auth/v1/user`,{headers:{apikey:env('SUPABASE_ANON_KEY'),Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('Entre novamente para continuar.');const user=await r.json();
 if(!user['id']||!user['email_confirmed_at']||user['banned_until']&&Date.parse(user['banned_until'])>Date.now())throw Error('Conta indisponível.');
 if(user['app_metadata']?.astros_password_change_required)throw Error('Defina sua nova senha antes de continuar.');
 const p=(await db(`painel_de_desbanimento?id=eq.${encodeURIComponent(user['id'])}&select=id,tipo_usuario,email,nome&limit=1`))[0];if(!p)throw Error('Conta indisponível.');return p;
}
function admin(user:Obj){if(user['tipo_usuario']!=='admin')throw Error('Acesso administrativo não autorizado.');}
function uuid(v:unknown){if(typeof v!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))throw Error('Referência inválida.');return v;}
function id(v:unknown){const n=Number(v);if(!Number.isSafeInteger(n)||n<=0||n>1000000)throw Error('Selecione uma opção válida.');return n;}
function view(o:Obj){return {id:o['id'],service:o['service_name'],country:o['country_name'],priceCents:Number(o['price_cents']),state:o['state'],phone:o['phone']??null,code:o['code']??null,expiresAt:o['expires_at']??null,createdAt:o['created_at'],userId:o['user_id']};}
async function settle(o:Obj,target:string,data:Obj={}){await db('rpc/astros_sms_settle','POST',{order_id:o['id'],target,...data});}
async function check(o:Obj,key:string){
 if(!o['provider_id']||['received','refunded'].includes(o['state']))return;
 const v=await provider('sms/check',{orderid:o['provider_id']},key);const target=stateFromCheck(v);
 await settle(o,target,target==='received'?{code_value:v.sms}:{});
}
async function orderById(value:unknown,user:Obj){const rows=await db(`astros_sms_orders?id=eq.${uuid(value)}&user_id=eq.${encodeURIComponent(user['id'])}&limit=1`);if(!rows[0])throw Error('Ativação não encontrada.');return rows[0] as Obj;}
function open(s:Obj,p:Obj){if(!s['enabled']||!p['api_key']||!s['usd_brl_units']||!s['worker_at']||Date.now()-Date.parse(s['worker_at'])>180000)throw Error('As ativações SMS estão indisponíveis no momento.');}
export async function handler(req:Request):Promise<Response>{
 if(req.method!=='POST')return json({error:'Método não permitido.'},405);
 try{
  const body=await req.json();const action=body.action;const data=body.data??{};
  // Cron uses a separate private secret; no user or customer API is exposed.
  if(action==='worker'){
   const p=await privateSettings();if(!p['worker_secret']||req.headers.get('X-Astros-Sms-Worker')!==p['worker_secret'])return json({error:'Acesso não autorizado.'},401);
   await db('astros_sms_settings?id=eq.true','PATCH',{worker_at:new Date().toISOString()});
   try{await ensureFx(await settings());}catch{/* FX outage never prevents reconciliation of existing orders. */}
   const rows:Obj[]=await db('astros_sms_orders?state=in.(dispatching,pending,review)&order=checked_at.asc.nullsfirst&limit=10');let checked=0;
   for(let start=0;start<rows.length;start+=5){await Promise.all(rows.slice(start,start+5).map(async(o)=>{try{if(o['provider_id']&&p['api_key']){await check(o,p['api_key']);checked++;}else if(Date.now()-Date.parse(o['created_at'])>90000){await settle(o,'review');}}catch{/* Leave durable state for next run. Never replay purchase. */}}));}
   return json({success:true,checked});
  }
  const user=await identity(req);
  if(!await db('rpc/astros_sms_gate','POST',{actor:user['id']}))return json({error:'Muitas consultas em sequência. Aguarde um minuto e tente novamente.'},429);
  if(action==='admin-catalog'||action==='admin-price')admin(user);
  if(action==='admin-balance'){
   admin(user);const p=await privateSettings();if(!p['api_key'])throw Error('Configure a chave do SMSPool para consultar o saldo.');
   try{const balanceUnits=await supplierBalance(p['api_key']);return json({balanceUnits,currency:'USD',lowBalance:balanceUnits<5000000,lowThresholdUnits:5000000,checkedAt:new Date().toISOString()});}catch{throw Error('Não foi possível consultar o saldo do fornecedor. Tente atualizar.');}
  }
  if(action==='admin-settings'){
   admin(user);const s=await settings(),p=await privateSettings();return json({enabled:s['enabled'],usdBrlUnits:Number(s['usd_brl_units']),marginBps:s['margin_bps'],feeCents:Number(s['fee_cents']),fxMode:s['fx_mode']??'manual',depositBps:s['deposit_bps']??325,conversionBps:s['conversion_bps']??400,extraBps:s['extra_bps']??0,fixedUsdUnits:Number(s['fixed_usd_units']??250000),depositUsdUnits:Number(s['deposit_usd_units']??10000000),marketUnits:s['market_units']??null,fxDate:s['fx_date']??null,fxCheckedAt:s['fx_checked_at']??null,hasKey:Boolean(p['api_key']),workerReady:Boolean(s['worker_at']&&Date.now()-Date.parse(s['worker_at'])<180000)});
  }
  if(action==='save-settings'){
   admin(user);const p=await privateSettings();const fx=Number(data.usdBrlUnits),margin=Number(data.marginBps),fee=Number(data.feeCents);
   if(typeof data.enabled!=='boolean'||!Number.isSafeInteger(fx)||fx<=0||fx>10000000||!Number.isSafeInteger(margin)||margin<0||margin>100000||!Number.isSafeInteger(fee)||fee<0||fee>100000)throw Error('Confira a cotação e a margem.');
   const key=typeof data.apiKey==='string'?data.apiKey.trim():'';if(key&&!/^[a-zA-Z0-9_-]{20,200}$/.test(key))throw Error('Confira a chave de integração.');
   if(key&&key!==p['api_key']){const running=await db('astros_sms_orders?state=in.(dispatching,pending,review)&select=id&limit=1');if(running.length)throw Error('Conclua os pedidos em andamento antes de trocar a chave.');const test=await provider('request/balance',{},key);units(test.balance);}
   if(data.enabled&&!key&&!p['api_key'])throw Error('Configure a chave antes de ativar.');const s=await settings();
   if(data.enabled&&(!s['worker_at']||Date.now()-Date.parse(s['worker_at'])>180000))throw Error('Ative primeiro a rotina automática de acompanhamento.');
   const mode=data.fxMode??s['fx_mode']??'manual',deposit=Number(data.depositUsdUnits??s['deposit_usd_units']??10000000),fixed_fee=Number(data.fixedUsdUnits??s['fixed_usd_units']??250000),deposit_percent=Number(data.depositBps??s['deposit_bps']??325),conversion=Number(data.conversionBps??s['conversion_bps']??400),extra=Number(data.extraBps??s['extra_bps']??0);
   if(!['auto','manual'].includes(mode))throw Error('Selecione o modo de cotação.');effectiveFx(50000,deposit,fixed_fee,deposit_percent,conversion,extra);
   const market=mode==='auto'?await fetchMarket():{market:null,source_date:null};
   await db('rpc/astros_sms_configure_fx','POST',{actor:user['id'],active:data.enabled,manual_fx:fx,margin,fee,new_key:key,mode,deposit,fixed_fee,deposit_percent,conversion,extra,...market});return json({success:true});
  }
  if(action==='refresh-fx'){admin(user);const s=await ensureFx(await settings(),true);return json({usdBrlUnits:Number(s['usd_brl_units']),fxDate:s['fx_date']??null});}
  if(action==='admin-orders'||action==='history'){
   const adminView=action==='admin-orders';if(adminView)admin(user);
   const rows:Obj[]=await db('astros_sms_orders?'+historyQuery(data,user['id'],adminView));
   return json({orders:rows.slice(0,20).map(o=>adminView?{...view(o),code:null,hasProvider:Boolean(o['provider_id']),email:o['painel_de_desbanimento']?.['email']??'',name:o['painel_de_desbanimento']?.['nome']??''}:view(o)),hasMore:rows.length>20});
  }
  if(action==='admin-review-detail'){
   admin(user);const orderId=uuid(data.orderId),o=(await db(`astros_sms_orders?id=eq.${orderId}&limit=1`))[0];if(!o)throw Error('Ativação não encontrada.');
   const audit=await db(`astros_sms_review_actions?order_id=eq.${orderId}&select=id,actor_id,operation,reason,state,previous_state,result_state,result,created_at,finished_at&order=created_at.desc&limit=20`);
   const ids=[...new Set(audit.map((a:Obj)=>a['actor_id']))];const actors:Obj[]=ids.length?await db(`painel_de_desbanimento?id=in.(${ids.join(',')})&select=id,nome`):[];
   return json({order:{...view(o),code:null,hasProvider:Boolean(o['provider_id'])},audit:audit.map(({actor_id,...a}:Obj)=>({...a,actorName:actors.find(v=>v['id']===actor_id)?.['nome']??'Administrador'}))});
  }
  if(action==='admin-review'){
   admin(user);const orderId=uuid(data.orderId),actionId=uuid(data.actionId),mode=String(data.mode),reason=String(data.reason??'').trim();
   if(!['check','cancel','note'].includes(mode)||reason.length<10||reason.length>500)throw Error('Selecione uma ação e informe uma justificativa de 10 a 500 caracteres.');
   const o=(await db(`astros_sms_orders?id=eq.${orderId}&limit=1`))[0];if(!o)throw Error('Ativação não encontrada.');
   if(mode!=='note'&&!o['provider_id'])throw Error('Pedido sem confirmação do fornecedor. Registre a análise e confira com o suporte do fornecedor; não repita a compra.');
   const claim=await db('rpc/astros_sms_review_begin','POST',{actor:user['id'],action_id:actionId,request_id:orderId,mode,note:reason});
   if(!claim.execute)return json({success:true,replayed:true,operationState:claim.state});
   const finish=(target:string,outcome:string,code_value:string|null=null)=>db('rpc/astros_sms_review_finish','POST',{actor:user['id'],action_id:actionId,target,expected_provider:o['provider_id']??null,code_value,outcome});
   if(mode==='note'){await finish('note','noted');return json({success:true,operationState:'completed'});}
   try{
    const p=await privateSettings();if(!p['api_key'])throw Error();
    let v=await provider('sms/check',{orderid:o['provider_id']},p['api_key']),target=stateFromCheck(v),outcome='checked';
    if(mode==='cancel'&&target==='pending'){
     const cancelled=await provider('sms/cancel',{orderid:o['provider_id']},p['api_key']);
     if(cancelled.success===1){target='refunded';outcome='cancel_confirmed';}else{v=await provider('sms/check',{orderid:o['provider_id']},p['api_key']);target=stateFromCheck(v);outcome='cancel_not_confirmed';}
    }
    await finish(target,outcome,target==='received'?v.sms:null);
    return json({success:true,operationState:'completed'});
   }catch{
    await finish('review','unconfirmed').catch(()=>undefined);
    return json({success:false,operationState:'uncertain',message:'A confirmação ainda não foi obtida. A ação foi registrada; consulte novamente sem repetir o cancelamento.'});
   }
  }
  if(action==='check'||action==='cancel'){
   const o=await orderById(data.orderId,user);const p=await privateSettings();if(!p['api_key'])throw Error('Acompanhamento temporariamente indisponível.');
   if(action==='cancel'&&o['provider_id']&&!['received','refunded'].includes(o['state'])){
    const v=await provider('sms/cancel',{orderid:o['provider_id']},p['api_key']);
    if(v.success===1)await settle(o,'refunded');else await check(o,p['api_key']);
   }else await check(o,p['api_key']);
   return json({order:view(await orderById(o['id'],user))});
  }
  if(action==='release-quote'){
   const requestId=uuid(data.requestId),quoteId=uuid(data.quoteId);const result=await db('rpc/astros_sms_release_quote','POST',{actor:user['id'],request_id:requestId,quote:quoteId});
   return json(result.released?{released:true}:{released:false,order:view(await orderById(requestId,user))});
  }
  if(action==='buy'){
   const requestId=uuid(data.requestId),quoteId=uuid(data.quoteId);
   // An earlier call may already have dispatched; do not require a fresh price to retrieve it.
   const previous=await db(`astros_sms_orders?id=eq.${requestId}&limit=1`);
   if(previous.length){if(previous[0].user_id!==user['id']||previous[0].quote_id!==quoteId)throw Error('Referência divergente.');return json({order:view(previous[0])});}
   const s=await ensureFx(await settings()),p=await privateSettings();open(s,p);
   const q=(await db(`astros_sms_quotes?id=eq.${quoteId}&user_id=eq.${user['id']}&limit=1`))[0];if(!q)throw Error('Atualize o preço antes de comprar.');
   const live=await provider('request/price',{service:q['service_id'],country:q['country_id'],pool:q['pool_id']},p['api_key']);
   if(units(live.price)!==Number(q['usd_units'])||(live.pool!==undefined&&id(live.pool)!==q['pool_id']))throw Error('O preço mudou. Consulte novamente antes de comprar.');
   // Fresh supplier balance is a preflight, never a substitute for atomic wallet reservation.
   // A concurrent purchase can still exhaust provider funds; explicit rejection keeps the existing refund protocol.
   let funded=false;try{funded=await supplierBalance(p['api_key'])>=Number(q['usd_units']);}catch{/* Fail closed before reserving client funds. */}
   if(!funded){
    // A parallel retry of this same request may already have reserved/dispatched: recover it instead of claiming no debit.
    const existing=await db(`astros_sms_orders?id=eq.${requestId}&limit=1`);
    if(existing.length){if(existing[0].user_id!==user['id']||existing[0].quote_id!==quoteId)throw Error('Referência divergente.');return json({order:view(existing[0])});}
    throw Error('Ativações SMS temporariamente indisponíveis. Nenhum valor foi descontado nesta tentativa. Tente novamente mais tarde.');
   }
   const reservation=await db('rpc/astros_sms_reserve','POST',{actor:user['id'],request_id:requestId,quote:quoteId});
   if(!reservation.dispatch)return json({order:view(await orderById(requestId,user))});
   const o=await orderById(requestId,user);
   try{
    const v=await provider('purchase/sms',{country:q['country_id'],service:q['service_id'],pool:q['pool_id'],max_price:(q['usd_units']/1000000).toFixed(6),pricing_option:0,quantity:1,activation_type:'SMS',create_token:0},p['api_key']);
    if(v.success===0){await settle(o,'refunded');return json({order:view(await orderById(requestId,user))});}
    const a=parseActivation(v);
    // A positive purchase is recorded even if its cost differs; never refund a delivered activation blindly.
    await settle(o,'pending',{provider:a.provider,number_value:a.phone,expiry:a.expiry});
   }catch{await settle(o,'review').catch(()=>undefined);}
   return json({order:view(await orderById(requestId,user))});
  }
  if(action==='catalog'||action==='admin-catalog'){
   const s=await settings(),p=await privateSettings();if(action==='admin-catalog'){admin(user);if(!p['api_key'])throw Error('Salve a chave do fornecedor antes de consultar.');}else{if(!s['enabled'])return json({available:false,services:[],countries:[]});open(s,p);}
   const [services,countries]=await Promise.all([provider('service/retrieve_all'),provider('country/retrieve_all')]);
   if(!Array.isArray(services)||!Array.isArray(countries))throw Error('Catálogo temporariamente indisponível.');
   return json({available:true,services:services.map(v=>({id:id(v.ID),name:String(v.name).slice(0,160)})),countries:countries.map(v=>({id:id(v.ID),name:String(v.name).slice(0,100),iso:String(v.short_name).slice(0,2)}))});
  }
  if(action==='quote'||action==='admin-price'){
   const s=await ensureFx(await settings()),p=await privateSettings();if(action==='admin-price'){admin(user);if(!p['api_key']||!s['usd_brl_units'])throw Error('Salve a chave e a cotação antes de consultar.');}else open(s,p);const service=id(data.serviceId),country=id(data.countryId);
   const [services,countries,availability]=await Promise.all([provider('service/retrieve_all'),provider('country/retrieve_all'),provider('sms/all_stock',{service,country},p['api_key'])]);
   if(!Array.isArray(services)||!Array.isArray(countries))throw Error('Catálogo temporariamente indisponível.');
   const serviceRow=services.find(v=>id(v.ID)===service),countryRow=countries.find(v=>id(v.ID)===country);if(!serviceRow||!countryRow)throw Error('Selecione serviço e país do catálogo.');
   const {pool,usd}=chooseOffer(availability,service,country);
   const stock=await provider('sms/stock',{service,country,pool},p['api_key']);if(stock['success']!==1||Number(stock['amount'])<1)throw Error('Sem números disponíveis para esse serviço e país.');
   const cents=saleCents(usd,Number(s['usd_brl_units']),s['margin_bps'],Number(s['fee_cents']));
   if(action==='admin-price'){const costCents=saleCents(usd,Number(s['usd_brl_units']),0,0);return json({service:String(serviceRow['name']),country:String(countryRow['name']),costUsd:usd/1000000,costCents,priceCents:cents,differenceCents:cents-costCents,stock:Number(stock['amount'])});}
   const rows=await db('astros_sms_quotes','POST',{user_id:user['id'],service_id:service,country_id:country,pool_id:pool,service_name:String(serviceRow['name']).slice(0,160),country_name:String(countryRow['name']).slice(0,100),usd_units:usd,price_cents:cents,settings_version:s['updated_at']});
   return json({quoteId:rows[0].id,priceCents:cents,expiresAt:rows[0].expires_at,service:rows[0].service_name,country:rows[0].country_name});
  }
  return json({error:'Operação não disponível.'},400);
 }catch(e){return json({error:e instanceof Error?e.message:'Não foi possível concluir. Tente atualizar.'},400);}
}
if(typeof Deno!=='undefined'&&typeof Deno.serve==='function')Deno.serve(handler);
