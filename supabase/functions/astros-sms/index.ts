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
 const v=await r.json().catch(()=>null);if(!r.ok)throw Error(['Este módulo está em manutenção. Novas operações estão temporariamente indisponíveis.','Este módulo não está liberado para sua conta. Fale com o suporte.'].includes(v?.message)?v.message:(path.startsWith('rpc/astros_sms_reserve')||path==='rpc/astros_sms_review_begin')&&typeof v?.message==='string'&&['Saldo insuficiente. Faça uma recarga','Atualize o preço antes de comprar','Referência divergente','Cotação já utilizada','Conclua suas ativações em andamento','Serviço indisponível','Um cancelamento já aguarda confirmação. Consulte o fornecedor sem repetir o cancelamento','Não há confirmação do fornecedor para esta ação'].includes(v.message)?v.message:'Não foi possível confirmar os dados. Tente atualizar.');return v;
}
async function settings(){return (await db('astros_sms_settings?id=eq.true'))[0] as Obj;}
async function privateSettings(){return (await db('astros_sms_private?id=eq.true'))[0] as Obj;}
async function provider(path:string,data:Obj={},key?:string):Promise<any>{
 const form=new FormData();for(const[k,v]of Object.entries(data))form.set(k,String(v));if(key)form.set('key',key);
 try{const r=await fetch(`https://api.smspool.net/${path}`,{method:'POST',body:form,redirect:'error',signal:AbortSignal.timeout(path==='sms/check'?8000:20000)});
 const v=await r.json();if(!r.ok)throw Error('Não foi possível consultar o serviço de SMS. Tente novamente.');return v;}catch{throw Error('Não foi possível consultar o serviço de SMS. Tente novamente.');}
}
export function definitePurchaseRejection(v:Obj,status:number){
 if(!v||v['success']!==0||![200,400,422].includes(status))return false;
 const delivered=(row:Obj)=>row&&(row['success']===1||row['order_id']||row['number']||row['phonenumber']||row['token']||row['url']);
 return !v['order_id']&&!v['number']&&!v['phonenumber']&&!v['token']&&!v['url']&&!Object.values(v['pools']??{}).some(row=>delivered(row as Obj));
}
export function purchaseDiagnostic(v:Obj,key:string,status:number|null,uncertain=false){
 const known=['OUT_OF_STOCK','PRICE_NOT_FOUND','BALANCE_ERROR','PARAMETER_ERROR','AUTH_ERROR','RATE_LIMITED'];
 const kind=String(v?.['type']??'');const category=uncertain?'RESPONSE_UNCONFIRMED':known.includes(kind)?kind:'PROVIDER_REJECTED';
 const raw=typeof v?.['message']==='string'?v['message']:'';
 // Text only, strip markup and redact the actual integration secret plus likely credentials/contact data.
 const detail=raw.slice(0,6000).split(key||'\u0000').join('[redigido]').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<[^>]*>/g,' ').replace(/(key|api[_-]?key|token|access[_-]?token|authorization|password|secret)\s*[:=]\s*[^\s,;]+/gi,'$1=[redigido]').replace(/Bearer\s+\S+/gi,'Bearer [redigido]').replace(/https?:\/\/\S+/gi,'[link removido]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[e-mail removido]').replace(/\b[A-Za-z0-9_-]{20,}\b/g,'[identificador removido]').replace(/\b\d{7,}\b/g,'[número removido]').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,400);
 return {category,httpStatus:status,detail};
}
class UnconfirmedPurchase extends Error{constructor(readonly status:number|null=null){super('Confirmação da compra pendente.');}}
async function purchaseSms(data:Obj,key:string){
 const form=new FormData();for(const[k,v]of Object.entries(data))form.set(k,String(v));form.set('key',key);
 let r:Response;try{r=await fetch('https://api.smspool.net/purchase/sms',{method:'POST',body:form,redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw new UnconfirmedPurchase();}
 const result=await r.json().catch(()=>null);
 if(!result||typeof result!=='object'||Array.isArray(result)||!r.ok&&!definitePurchaseRejection(result,r.status))throw new UnconfirmedPurchase(r.status);
 return {result,status:r.status};
}
async function recordPurchaseDiagnostic(orderId:string,diagnostic:{category:string;httpStatus:number|null;detail:string}){
 try{await db('rpc/astros_sms_record_purchase_diagnostic','POST',{request_id:orderId,kind:diagnostic.category,status_code:diagnostic.httpStatus,detail_text:diagnostic.detail});}catch{/* Diagnostics must never change wallet settlement or trigger another purchase. */}
}
export function consultedStock(value:Obj){
 const raw=value?.['amount'];
 if(value?.['success']!==1||!['string','number'].includes(typeof raw)||!/^\d+$/.test(String(raw)))throw Error('Não foi possível confirmar o estoque agora. Tente consultar novamente.');
 const count=Number(raw);if(!Number.isSafeInteger(count)||count<0)throw Error('Não foi possível confirmar o estoque agora. Tente consultar novamente.');return count;
}
export function selectedArea(value:unknown){
 const area=String(value??'').trim();if(area&&!/^[1-9][0-9]$/.test(area))throw Error('Informe um DDD brasileiro com dois dígitos, sem o 55.');return area;
}
export function availableAreas(value:any){
 if(value?.success===0&&String(value?.message??'').includes('Custom areacodes is not supported for this pool'))throw Error('Esta oferta não permite escolher o DDD. Deixe o campo vazio para receber um número com qualquer DDD.');
 const rows=Array.isArray(value)?value:Array.isArray(value?.areacodes)?value.areacodes:null;
 if(!rows||!rows.every((v:unknown)=>['string','number'].includes(typeof v)&&/^\d{1,6}$/.test(String(v))))throw Error('Não foi possível confirmar os DDDs disponíveis. Use Qualquer DDD ou tente novamente.');
 return [...new Set(rows.map(String))];
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
 const fields='id,user_id,supplier,service_name,country_name,price_cents,state,phone,code,expires_at,created_at'+(adminView?',provider_id,painel_de_desbanimento!inner(nome,email)':'');
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
function view(o:Obj){return {id:o['id'],supplier:o['supplier']??'smspool',service:o['service_name'],country:o['country_name'],priceCents:Number(o['price_cents']),state:o['state'],phone:o['phone']??null,code:o['code']??null,expiresAt:o['expires_at']??null,createdAt:o['created_at'],userId:o['user_id']};}
async function settle(o:Obj,target:string,data:Obj={}){await db('rpc/astros_sms_settle','POST',{order_id:o['id'],target,...data});}
async function check(o:Obj,key:string){
 if(!o['provider_id']||['received','refunded'].includes(o['state']))return;
 if(o['supplier']==='five_sim'){await fiveCheck(o);return;}
 const v=await provider('sms/check',{orderid:o['provider_id']},key);const target=stateFromCheck(v);
 await settle(o,target,target==='received'?{code_value:v.sms}:{});
}
async function orderById(value:unknown,user:Obj){const rows=await db(`astros_sms_orders?id=eq.${uuid(value)}&user_id=eq.${encodeURIComponent(user['id'])}&limit=1`);if(!rows[0])throw Error('Ativação não encontrada.');return rows[0] as Obj;}
function open(s:Obj,p:Obj){if(!s['enabled']||!p['api_key']||!s['usd_brl_units']||!s['worker_at']||Date.now()-Date.parse(s['worker_at'])>180000)throw Error('As ativações SMS estão indisponíveis no momento.');}
// 5SIM native units are configured independently; never apply the SMSPool USD rate.
function fiveSlug(v:unknown){const s=String(v??'');if(!/^[a-z0-9]{1,80}$/.test(s)||s==='any')throw Error('Atualize o catálogo e selecione uma opção válida.');return s;}
export function fiveRejection(text:string,status:number){return [200,400].includes(status)&&['no free phones','not enough user balance','not enough rating','select country','select operator','bad country','bad operator','no product'].includes(text.trim().toLowerCase());}
export function fiveOffer(value:Obj,country:string,product:string){
 const rows=value?.[country]?.[product];if(!rows||typeof rows!=='object'||Array.isArray(rows))throw Error('Estoque não confirmado. Consulte novamente.');
 const offers:Array<{native:number;stock:number}>=[];
 for(const v of Object.values(rows) as Obj[]){try{const native=units(v.cost),stock=Number(v.count);if(native>0&&Number.isSafeInteger(stock)&&stock>0)offers.push({native,stock});}catch{/* Never guess malformed costs. */}}
 offers.sort((a,b)=>a.native-b.native);if(!offers.length)throw Error('Sem números disponíveis para esse serviço e país.');
 const native=offers[0].native,stock=offers.filter(v=>v.native===native).reduce((n,v)=>n+v.stock,0);if(!Number.isSafeInteger(stock))throw Error('Estoque não confirmado.');return {native,stock};
}
export function fiveOrder(value:Obj,expected:{product:string;country:string;id?:string;phone?:string}){
 if(!Number.isSafeInteger(value?.id)||value.id<1||expected.id&&String(value.id)!==expected.id||value.product!==expected.product||value.country!==expected.country||typeof value.phone!=='string'||!/^\+?[1-9][0-9]{5,17}$/.test(value.phone)||expected.phone&&value.phone.replace(/^\+/,'')!==expected.phone.replace(/^\+/,''))throw Error('Confirmação da ativação pendente.');
 const expiry=Date.parse(value.expires);if(!Number.isFinite(expiry))throw Error('Confirmação da ativação pendente.');const cost=units(value.price);if(cost<=0)throw Error('Confirmação da ativação pendente.');
 const sms=value.sms;if(sms!==null&&!Array.isArray(sms))throw Error('Confirmação da ativação pendente.');
 const code=Array.isArray(sms)?sms.find(v=>typeof v?.code==='string'&&v.code.trim().length>0&&v.code.length<=200)?.code:null;
 let state:'pending'|'received'|'refunded'|'review'='review';
 if(code&&['PENDING','RECEIVED','FINISHED'].includes(value.status))state='received';
 else if((sms===null||Array.isArray(sms)&&sms.length===0)&&value.status==='CANCELED')state='refunded';
 else if((sms===null||Array.isArray(sms)&&sms.length===0)&&['PENDING','RECEIVED'].includes(value.status))state='pending';
 // TIMEOUT/BANNED/FINISHED without code and contradictory SMS/cancel are not refund proof.
 return {provider:String(value.id),phone:value.phone.replace(/^\+/,''),expiry:new Date(expiry).toISOString(),cost,state,code:code??null};
}
async function fiveRaw(path:string,key?:string){
 // Fixed host, no redirects/retries: even buy/cancel use GET but have side effects.
 const r=await fetch('https://5sim.net/v1/'+path,{headers:{Accept:'application/json',...(key?{Authorization:`Bearer ${key}`}:{})},redirect:'error',signal:AbortSignal.timeout(15000)});
 const text=await r.text();if(text.length>4000000)throw Error('Resposta não confirmada.');let value:any=null;try{value=JSON.parse(text);}catch{/* Documented purchase rejections are plain text. */}return {r,text,value};
}
async function fiveGet(path:string,key?:string):Promise<Obj>{try{const {r,value}=await fiveRaw(path,key);if(!r.ok||!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw Error('Não foi possível consultar o fornecedor de SMS. Tente novamente.');}}
async function fiveSettings(){return (await db('astros_sms_five_settings?id=eq.true'))[0] as Obj;}
async function fiveBalance(key:string){if(!key)throw Error('Configure a chave da 5SIM.');const v=await fiveGet('user/profile',key);if(!Number.isSafeInteger(v.id)||v.id<1)throw Error('Saldo não confirmado.');return units(v.balance);}
async function fiveCatalog(){
 const [products,countries]=await Promise.all([fiveGet('guest/products/any/any'),fiveGet('guest/countries')]);
 const services=Object.entries(products).filter(([id,v])=>/^[a-z0-9]{1,80}$/.test(id)&&id!=='any'&&v?.Category==='activation').map(([id])=>({id,name:({whatsapp:'WhatsApp',telegram:'Telegram',instagram:'Instagram',google:'Google / YouTube',openai:'OpenAI / ChatGPT'} as Obj)[id]??id.charAt(0).toUpperCase()+id.slice(1)}));
 const regions=Object.entries(countries).filter(([id,v])=>/^[a-z0-9]{1,80}$/.test(id)&&id!=='any'&&typeof v?.text_en==='string').map(([id,v])=>({id,name:String(v.text_en).slice(0,100),iso:Object.keys(v.iso??{})[0]?.toUpperCase()??''}));
 if(!services.length||!regions.length)throw Error('Catálogo temporariamente indisponível.');return {services,countries:regions};
}
function fiveOpen(s:Obj,p:Obj,f:Obj){if(!s.enabled||!p.five_sim_key||!f.native_brl_units||!s.worker_at||Date.now()-Date.parse(s.worker_at)>180000)throw Error('As ativações SMS estão indisponíveis no momento.');}
async function fiveRead(o:Obj,key:string,cancel=false){
 if(!key)throw Error('Acompanhamento temporariamente indisponível.');
 const expected={id:String(o.provider_id),product:o.supplier_product,country:o.supplier_country,phone:o.phone};
 let a=fiveOrder(await fiveGet('user/check/'+encodeURIComponent(o.provider_id),key),expected);
 if(cancel&&a.state==='pending'&&await db('rpc/astros_sms_claim_five_cancel','POST',{request_id:o.id})){
  // The durable claim also prevents a client cancellation racing administrative review.
  a=fiveOrder(await fiveGet('user/cancel/'+encodeURIComponent(o.provider_id),key),expected);
 }
 return a;
}
async function fiveCheck(o:Obj,cancel=false){
 if(!o.provider_id||['received','refunded'].includes(o.state))return;
 const p=await privateSettings(),a=await fiveRead(o,p.five_sim_key,cancel);
 await settle(o,a.state,a.state==='received'?{code_value:a.code}:{});
}
async function fiveNew(action:string,data:Obj,user:Obj,s:Obj){
 const p=await privateSettings(),f=await fiveSettings(),isAdmin=action.startsWith('admin-');if(isAdmin)admin(user);
 if(action==='catalog'||action==='admin-catalog'){
  if(!isAdmin&&!s.enabled)return json({available:false,services:[],countries:[]});
  if(isAdmin){if(!p.five_sim_key||!f.native_brl_units)throw Error('Configure a 5SIM antes de consultar.');}else fiveOpen(s,p,f);
  return json({available:true,supplier:'five_sim',...(await fiveCatalog())});
 }
 if(action==='area-options'){fiveOpen(s,p,f);return json({areas:[]});}
 if(action==='quote'||action==='admin-price'){
  if(isAdmin){if(!p.five_sim_key||!f.native_brl_units)throw Error('Configure a 5SIM antes de consultar.');}else fiveOpen(s,p,f);
  const product=fiveSlug(data.serviceId),country=fiveSlug(data.countryId);if(selectedArea(data.areaCode))throw Error('A seleção de DDD não está disponível nesta oferta.');
  const [catalog,prices]=await Promise.all([fiveCatalog(),fiveGet('guest/prices?'+new URLSearchParams({country,product}))]);
  const serviceRow=catalog.services.find(v=>v.id===product),countryRow=catalog.countries.find(v=>v.id===country);if(!serviceRow||!countryRow)throw Error('Atualize o catálogo e selecione serviço e país.');
  const offer=fiveOffer(prices,country,product),stockCheckedAt=new Date().toISOString(),price=saleCents(offer.native,Number(f.native_brl_units),Number(f.margin_bps),Number(f.fee_cents)),costCents=saleCents(offer.native,Number(f.native_brl_units),0,0);
  if(isAdmin)return json({service:serviceRow.name,country:countryRow.name,costNative:offer.native/1000000,currency:'5SIM',costCents,priceCents:price,differenceCents:price-costCents,stock:offer.stock,stockCheckedAt});
  const q=(await db('astros_sms_quotes','POST',{supplier:'five_sim',supplier_product:product,supplier_country:country,native_units:offer.native,native_brl_units:Number(f.native_brl_units),user_id:user.id,service_id:0,country_id:0,pool_id:0,service_name:serviceRow.name,country_name:countryRow.name,usd_units:0,price_cents:price,settings_version:s.updated_at}))[0];
  return json({quoteId:q.id,priceCents:price,expiresAt:q.expires_at,service:serviceRow.name,country:countryRow.name,stock:offer.stock,stockCheckedAt});
 }
 throw Error('Operação não disponível.');
}
async function fiveBuy(q:Obj,requestId:string,user:Obj,s:Obj){
 const p=await privateSettings(),f=await fiveSettings();fiveOpen(s,p,f);
 if(q.supplier!=='five_sim'||s.active_supplier!=='five_sim'||q.settings_version!==s.updated_at||Date.parse(q.expires_at)<=Date.now())throw Error('Atualize o preço antes de comprar.');
 const product=fiveSlug(q.supplier_product),country=fiveSlug(q.supplier_country),offer=fiveOffer(await fiveGet('guest/prices?'+new URLSearchParams({country,product})),country,product);
 if(offer.native!==Number(q.native_units))throw Error('O preço mudou. Consulte novamente antes de comprar.');
 let funded=false;try{funded=await fiveBalance(p.five_sim_key)>=Number(q.native_units);}catch{/* Fail closed before debit. */}
 if(!funded){const previous=await db(`astros_sms_orders?id=eq.${requestId}&limit=1`);if(previous.length){if(previous[0].user_id!==user.id||previous[0].quote_id!==q.id)throw Error('Referência divergente.');return json({order:view(previous[0])});}throw Error('Ativações SMS temporariamente indisponíveis. Nenhum valor foi descontado nesta tentativa.');}
 const reserved=await db('rpc/astros_sms_reserve','POST',{actor:user.id,request_id:requestId,quote:q.id});if(!reserved.dispatch)return json({order:view(await orderById(requestId,user))});
 const o=await orderById(requestId,user);
 try{
  const response=await fiveRaw(`user/buy/activation/${country}/any/${product}?maxPrice=${(Number(q.native_units)/1000000).toFixed(6)}`,p.five_sim_key);
  if(fiveRejection(response.text,response.r.status)){await recordPurchaseDiagnostic(requestId,{category:'PROVIDER_REJECTED',httpStatus:response.r.status,detail:''});await settle(o,'refunded');}
  else{
   if(!response.r.ok)throw Error();const a=fiveOrder(response.value,{product,country});
   // Persist a validated delivered identity even if price/status is unexpected. Never guess another order.
   await settle(o,'pending',{provider:a.provider,number_value:a.phone,expiry:a.expiry});
   if(a.cost>Number(q.native_units)||a.state==='review'){await recordPurchaseDiagnostic(requestId,{category:'RESPONSE_UNCONFIRMED',httpStatus:response.r.status,detail:'Ativação identificada; preço ou situação requer conferência.'});await settle(o,'review');}
   else if(a.state!=='pending')await settle(o,a.state,a.state==='received'?{code_value:a.code}:{});
  }
 }catch{await recordPurchaseDiagnostic(requestId,{category:'RESPONSE_UNCONFIRMED',httpStatus:null,detail:''});await settle(o,'review').catch(()=>undefined);}
 return json({order:view(await orderById(requestId,user))});
}

export async function handler(req:Request):Promise<Response>{
 if(req.method!=='POST')return json({error:'Método não permitido.'},405);
 try{
  const body=await req.json();const action=body.action;const data=body.data??{};
  // Cron uses a separate private secret; no user or customer API is exposed.
  if(action==='worker'){
   const p=await privateSettings();if(!p['worker_secret']||req.headers.get('X-Astros-Sms-Worker')!==p['worker_secret'])return json({error:'Acesso não autorizado.'},401);
   await db('astros_sms_settings?id=eq.true','PATCH',{worker_at:new Date().toISOString()});
   try{const s=await settings();if(s.active_supplier!=='five_sim')await ensureFx(s);}catch{/* FX outage never prevents reconciliation of existing orders. */}
   const rows:Obj[]=await db('astros_sms_orders?state=in.(dispatching,pending,review)&order=checked_at.asc.nullsfirst&limit=10');let checked=0;
   for(let start=0;start<rows.length;start+=5){await Promise.all(rows.slice(start,start+5).map(async(o)=>{try{if(o['provider_id']&&(o['supplier']==='five_sim'||p['api_key'])){await check(o,p['api_key']);checked++;}else if(Date.now()-Date.parse(o['created_at'])>90000){await settle(o,'review');}}catch{/* Leave durable state for next run. Never replay purchase. */}}));}
   return json({success:true,checked});
  }
  const user=await identity(req);
  if(!await db('rpc/astros_sms_gate','POST',{actor:user['id']}))return json({error:'Muitas consultas em sequência. Aguarde um minuto e tente novamente.'},429);
  if(action==='admin-catalog'||action==='admin-price')admin(user);
  if(action==='admin-providers'){
   admin(user);const s=await settings(),p=await privateSettings(),f=await fiveSettings();
   return json({supplier:s.active_supplier??'smspool',enabled:s.enabled,hasFiveKey:Boolean(p.five_sim_key),fiveFx:Number(f.native_brl_units),fiveMargin:Number(f.margin_bps),fiveFee:Number(f.fee_cents),workerReady:Boolean(s.worker_at&&Date.now()-Date.parse(s.worker_at)<180000)});
  }
  if(action==='save-five'){
   admin(user);const fx=Number(data.nativeBrlUnits),margin=Number(data.marginBps),fee=Number(data.feeCents),key=String(data.apiKey??'').trim();
   if(!Number.isSafeInteger(fx)||fx<1||fx>10000000||!Number.isSafeInteger(margin)||margin<0||margin>100000||!Number.isSafeInteger(fee)||fee<0||fee>100000||key&&!/^[A-Za-z0-9._-]{20,2000}$/.test(key))throw Error('Confira a chave e os valores da 5SIM.');
   const p=await privateSettings();if(key&&key!==p.five_sim_key){const running=await db('astros_sms_orders?supplier=eq.five_sim&state=in.(dispatching,pending,review)&select=id&limit=1');if(running.length)throw Error('Conclua os pedidos da 5SIM antes de trocar a chave.');await fiveBalance(key);}
   await db('rpc/astros_sms_configure_five','POST',{actor:user.id,fx,margin,fee,new_key:key});return json({success:true});
  }
  if(action==='select-supplier'){
   admin(user);if(!['smspool','five_sim'].includes(data.supplier)||typeof data.enabled!=='boolean')throw Error('Selecione o fornecedor.');
   await db('rpc/astros_sms_select_supplier','POST',{actor:user.id,chosen:data.supplier,active:data.enabled});return json({success:true});
  }
  if(['catalog','admin-catalog','quote','admin-price','area-options'].includes(action)){
   const s=await settings();if(s.active_supplier==='five_sim')return await fiveNew(action,data,user,s);
  }
  if(action==='admin-balance'){
   admin(user);const p=await privateSettings(),s=await settings();
   if((data.supplier??s.active_supplier)==='five_sim'){const balanceUnits=await fiveBalance(p.five_sim_key);return json({supplier:'five_sim',balanceUnits,currency:'5SIM',lowBalance:false,lowThresholdUnits:0,checkedAt:new Date().toISOString()});}
   if(!p['api_key'])throw Error('Configure a chave do SMSPool para consultar o saldo.');
   try{const balanceUnits=await supplierBalance(p['api_key']);return json({balanceUnits,currency:'USD',lowBalance:balanceUnits<5000000,lowThresholdUnits:5000000,checkedAt:new Date().toISOString()});}catch{throw Error('Não foi possível consultar o saldo do fornecedor. Tente atualizar.');}
  }
  if(action==='admin-dashboard'){
   admin(user);const f=String(data.from??''),u=String(data.until??'');
   const valid=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
   if(!valid(f)||!valid(u)||u<f||(Date.parse(u)-Date.parse(f))/86400000>365)throw Error('Escolha um período válido de até 366 dias.');
   return json(await db('rpc/astros_sms_dashboard','POST',{actor:user['id'],date_from:f,date_until:u}));
  }
  if(action==='admin-pause'){admin(user);return json(await db('rpc/astros_sms_pause','POST',{actor:user['id']}));}
  if(action==='support-order'){const o=await orderById(data.orderId,user);return json({id:o['id'],service:o['service_name'],country:o['country_name'],state:o['state'],priceCents:Number(o['price_cents']),createdAt:o['created_at']});}
  if(action==='admin-settings'){
   admin(user);const s=await settings(),p=await privateSettings();return json({activeSupplier:s.active_supplier??'smspool',enabled:s['enabled'],usdBrlUnits:Number(s['usd_brl_units']),marginBps:s['margin_bps'],feeCents:Number(s['fee_cents']),fxMode:s['fx_mode']??'manual',depositBps:s['deposit_bps']??325,conversionBps:s['conversion_bps']??400,extraBps:s['extra_bps']??0,fixedUsdUnits:Number(s['fixed_usd_units']??250000),depositUsdUnits:Number(s['deposit_usd_units']??10000000),marketUnits:s['market_units']??null,fxDate:s['fx_date']??null,fxCheckedAt:s['fx_checked_at']??null,hasKey:Boolean(p['api_key']),workerReady:Boolean(s['worker_at']&&Date.now()-Date.parse(s['worker_at'])<180000)});
  }
  if(action==='save-settings'){
   admin(user);const p=await privateSettings();const fx=Number(data.usdBrlUnits),margin=Number(data.marginBps),fee=Number(data.feeCents);
   if(typeof data.enabled!=='boolean'||!Number.isSafeInteger(fx)||fx<=0||fx>10000000||!Number.isSafeInteger(margin)||margin<0||margin>100000||!Number.isSafeInteger(fee)||fee<0||fee>100000)throw Error('Confira a cotação e a margem.');
   const key=typeof data.apiKey==='string'?data.apiKey.trim():'';if(key&&!/^[a-zA-Z0-9_-]{20,200}$/.test(key))throw Error('Confira a chave de integração.');
   if(key&&key!==p['api_key']){const running=await db('astros_sms_orders?supplier=eq.smspool&state=in.(dispatching,pending,review)&select=id&limit=1');if(running.length)throw Error('Conclua os pedidos em andamento antes de trocar a chave.');const test=await provider('request/balance',{},key);units(test.balance);}
   if(data.enabled&&!key&&!p['api_key'])throw Error('Configure a chave antes de ativar.');const s=await settings();
   if(data.enabled&&(!s['worker_at']||Date.now()-Date.parse(s['worker_at'])>180000))throw Error('Ative primeiro a rotina automática de acompanhamento.');
   const mode=data.fxMode??s['fx_mode']??'manual',deposit=Number(data.depositUsdUnits??s['deposit_usd_units']??10000000),fixed_fee=Number(data.fixedUsdUnits??s['fixed_usd_units']??250000),deposit_percent=Number(data.depositBps??s['deposit_bps']??325),conversion=Number(data.conversionBps??s['conversion_bps']??400),extra=Number(data.extraBps??s['extra_bps']??0);
   if(!['auto','manual'].includes(mode))throw Error('Selecione o modo de cotação.');effectiveFx(50000,deposit,fixed_fee,deposit_percent,conversion,extra);
   const market=mode==='auto'?await fetchMarket():{market:null,source_date:null};
   await db('rpc/astros_sms_configure_fx','POST',{actor:user['id'],active:s.active_supplier==='five_sim'?s.enabled:data.enabled,manual_fx:fx,margin,fee,new_key:key,mode,deposit,fixed_fee,deposit_percent,conversion,extra,...market});return json({success:true});
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
   const diagnosis=(await db(`astros_sms_purchase_diagnostics?order_id=eq.${orderId}&select=category,http_status,detail,created_at&limit=1`))[0]??null;
   return json({order:{...view(o),code:null,hasProvider:Boolean(o['provider_id'])},diagnosis,audit:audit.map(({actor_id,...a}:Obj)=>({...a,actorName:actors.find(v=>v['id']===actor_id)?.['nome']??'Administrador'}))});
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
    const p=await privateSettings();
    if(o.supplier==='five_sim'){
     const a=await fiveRead(o,p.five_sim_key,mode==='cancel');
     await finish(a.state,mode==='cancel'?(a.state==='refunded'?'cancel_confirmed':'cancel_not_confirmed'):'checked',a.state==='received'?a.code:null);
     return json({success:true,operationState:'completed'});
    }
    if(!p['api_key'])throw Error();
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
   const o=await orderById(data.orderId,user);
   if(o.supplier==='five_sim'){await fiveCheck(o,action==='cancel');return json({order:view(await orderById(o.id,user))});}
   const p=await privateSettings();if(!p['api_key'])throw Error('Acompanhamento temporariamente indisponível.');
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
   const current=await settings();
   const q=(await db(`astros_sms_quotes?id=eq.${quoteId}&user_id=eq.${user['id']}&limit=1`))[0];if(!q)throw Error('Atualize o preço antes de comprar.');
   if(q.supplier==='five_sim')return await fiveBuy(q,requestId,user,current);
   if(current.active_supplier&&current.active_supplier!=='smspool')throw Error('Atualize o preço antes de comprar.');
   const s=await ensureFx(current),p=await privateSettings();open(s,p);
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
    const purchase=await purchaseSms({country:q['country_id'],service:q['service_id'],pool:q['pool_id'],max_price:(q['usd_units']/1000000).toFixed(6),pricing_option:0,quantity:1,activation_type:'SMS',create_token:0,...(q['area_code']?{areacode:JSON.stringify([q['area_code']]),exclude:0}:{})},p['api_key']);
    const v=purchase.result;
    if(definitePurchaseRejection(v,purchase.status)){await recordPurchaseDiagnostic(requestId,purchaseDiagnostic(v,p['api_key'],purchase.status));await settle(o,'refunded');return json({order:view(await orderById(requestId,user))});}
    const a=parseActivation(v);
    // A positive purchase is recorded even if its cost differs; never refund a delivered activation blindly.
    await settle(o,'pending',{provider:a.provider,number_value:a.phone,expiry:a.expiry});
   }catch(e){await recordPurchaseDiagnostic(requestId,{category:e instanceof UnconfirmedPurchase&&e.status===null?'TRANSPORT_UNCONFIRMED':'RESPONSE_UNCONFIRMED',httpStatus:e instanceof UnconfirmedPurchase?e.status:null,detail:''});await settle(o,'review').catch(()=>undefined);}
   return json({order:view(await orderById(requestId,user))});
  }
  if(action==='catalog'||action==='admin-catalog'){
   const s=await settings(),p=await privateSettings();if(action==='admin-catalog'){admin(user);if(!p['api_key'])throw Error('Salve a chave do fornecedor antes de consultar.');}else{if(!s['enabled'])return json({available:false,services:[],countries:[]});open(s,p);}
   const [services,countries]=await Promise.all([provider('service/retrieve_all'),provider('country/retrieve_all')]);
   if(!Array.isArray(services)||!Array.isArray(countries))throw Error('Catálogo temporariamente indisponível.');
   return json({available:true,supplier:'smspool',services:services.map(v=>({id:id(v.ID),name:String(v.name).slice(0,160)})),countries:countries.map(v=>({id:id(v.ID),name:String(v.name).slice(0,100),iso:String(v.short_name).slice(0,2)}))});
  }
  if(action==='area-options'){
   const s=await settings(),p=await privateSettings();open(s,p);const service=id(data.serviceId),country=id(data.countryId);
   const countries=await provider('country/retrieve_all');const row=Array.isArray(countries)?countries.find(v=>Number(v.ID)===country):null;
   if(!row||String(row.short_name).toUpperCase()!=='BR')return json({areas:[]});
   const {pool}=chooseOffer(await provider('sms/all_stock',{service,country},p['api_key']),service,country);
   const value=await provider('request/areacodes',{service,country,pool},p['api_key']);
   if(value?.success===0&&String(value?.message??'').includes('Custom areacodes is not supported for this pool'))return json({areas:[]});
   return json({areas:availableAreas(value).filter(v=>/^[1-9][0-9]$/.test(v))});
  }
  if(action==='quote'||action==='admin-price'){
   const s=await ensureFx(await settings()),p=await privateSettings();if(action==='admin-price'){admin(user);if(!p['api_key']||!s['usd_brl_units'])throw Error('Salve a chave e a cotação antes de consultar.');}else open(s,p);const service=id(data.serviceId),country=id(data.countryId);
   const [services,countries,availability]=await Promise.all([provider('service/retrieve_all'),provider('country/retrieve_all'),provider('sms/all_stock',{service,country},p['api_key'])]);
   if(!Array.isArray(services)||!Array.isArray(countries))throw Error('Catálogo temporariamente indisponível.');
   const serviceRow=services.find(v=>id(v.ID)===service),countryRow=countries.find(v=>id(v.ID)===country);if(!serviceRow||!countryRow)throw Error('Selecione serviço e país do catálogo.');
   const {pool,usd}=chooseOffer(availability,service,country);
   const areaCode=selectedArea(data.areaCode);if(areaCode){if(String(countryRow['short_name']).toUpperCase()!=='BR')throw Error('A escolha de DDD está disponível somente para o Brasil.');const areas=availableAreas(await provider('request/areacodes',{service,country,pool},p['api_key']));if(!areas.includes(areaCode))throw Error('Esse DDD não está disponível nesta oferta. Escolha outro DDD ou Qualquer DDD.');}
   const stock=consultedStock(await provider('sms/stock',{service,country,pool},p['api_key']));const stockCheckedAt=new Date().toISOString();if(stock<1)throw Error('Sem números disponíveis para esse serviço e país.');
   const cents=saleCents(usd,Number(s['usd_brl_units']),s['margin_bps'],Number(s['fee_cents']));
   if(action==='admin-price'){const costCents=saleCents(usd,Number(s['usd_brl_units']),0,0);return json({service:String(serviceRow['name']),country:String(countryRow['name']),costUsd:usd/1000000,costCents,priceCents:cents,differenceCents:cents-costCents,stock,stockCheckedAt});}
   const rows=await db('astros_sms_quotes','POST',{user_id:user['id'],service_id:service,country_id:country,pool_id:pool,service_name:String(serviceRow['name']).slice(0,160),country_name:String(countryRow['name']).slice(0,100),usd_units:usd,price_cents:cents,settings_version:s['updated_at'],area_code:areaCode||null});
   return json({quoteId:rows[0].id,priceCents:cents,expiresAt:rows[0].expires_at,service:rows[0].service_name,country:rows[0].country_name,areaCode:areaCode||null,stock,stockCheckedAt});
  }
  return json({error:'Operação não disponível.'},400);
 }catch(e){return json({error:e instanceof Error?e.message:'Não foi possível concluir. Tente atualizar.'},400);}
}
if(typeof Deno!=='undefined'&&typeof Deno.serve==='function')Deno.serve(handler);
