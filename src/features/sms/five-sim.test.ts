import {afterEach,describe,expect,it,vi} from 'vitest';
import {fiveAdminOffers,fiveOffer,fiveOrder,fiveRejection,handler} from '../../../supabase/functions/astros-sms/index';
const actor='00000000-0000-4000-8000-000000000001',orderId='00000000-0000-4000-8000-000000000002',quoteId='00000000-0000-4000-8000-000000000003',epoch='2026-10-21T15:00:00Z';
const activation={id:123,phone:'+5511999999999',product:'whatsapp',country:'brazil',operator:'virtual1',price:10,status:'PENDING',expires:'2026-10-21T15:20:00Z',sms:null};
const expected={product:'whatsapp',country:'brazil'};
afterEach(()=>vi.unstubAllGlobals());
describe('5SIM provider evidence',()=>{
 it('uses only in-stock prices for the chosen service/country and stock at the exact price cap',()=>{expect(fiveOffer({brazil:{whatsapp:{a:{cost:10,count:2},b:{cost:10,count:3},c:{cost:1,count:0},d:{cost:12,count:100}}}},'brazil','whatsapp')).toEqual({native:10000000,stock:5});expect(()=>fiveOffer({brazil:{telegram:{}}},'brazil','whatsapp')).toThrow();expect(()=>fiveOffer({brazil:{whatsapp:{a:{cost:'1e3',count:1}}}},'brazil','whatsapp')).toThrow();});
 it.each(['no free phones','not enough user balance','not enough rating','bad country'])('recognizes only documented no-purchase evidence: %s',text=>{expect(fiveRejection(text,200)).toBe(true);expect(fiveRejection(text,400)).toBe(true);expect(fiveRejection(text,500)).toBe(false);expect(fiveRejection(JSON.stringify({error:text,id:123}),400)).toBe(false);});
 it('does not refund generic errors, server offline or rate limiting',()=>{for(const s of ['server offline','internal error','too many requests','no free phones extra'])expect(fiveRejection(s,400)).toBe(false);});
 it('RECEIVED without code is still waiting; only validated code is success',()=>{expect(fiveOrder({...activation,status:'RECEIVED'},expected).state).toBe('pending');expect(fiveOrder({...activation,status:'RECEIVED',sms:[{code:'123456'}]},expected)).toMatchObject({state:'received',code:'123456',phone:'5511999999999'});});
 it('requires exact saved supplier identity, product, country and phone',()=>{for(const changes of [{id:124},{product:'telegram'},{country:'usa'},{phone:'+14155552671'},{price:'invalid'},{sms:{}},{expires:'invalid'}])expect(()=>fiveOrder({...activation,...changes},{...expected,id:'123',phone:'5511999999999'})).toThrow();});
 it('credits only confirmed cancellation without SMS, never local expiry or contradictory data',()=>{expect(fiveOrder({...activation,status:'CANCELED',sms:[]},expected).state).toBe('refunded');for(const status of ['TIMEOUT','FINISHED','BANNED','unknown'])expect(fiveOrder({...activation,status},expected).state).toBe('review');expect(fiveOrder({...activation,status:'CANCELED',sms:[{code:'123456'}]},expected).state).toBe('review');});
});
type Setup={role?:string;active?:string;existing?:boolean;existingSupplier?:string;balance?:unknown;buyBody?:unknown;buyStatus?:number;network?:boolean;changed?:boolean;cancelNetwork?:boolean;checkStatus?:string;checkSms?:unknown;reserve?:boolean;worker?:boolean};
function setup(options:Setup={}){
 const calls:Array<{url:string;init:any;body:any}>=[];let saved=Boolean(options.existing),state=options.existing?'pending':'dispatching',providerId=options.existing?'123':null,claimed=false;
 const supplier=options.existingSupplier??'five_sim';
 const order=()=>({id:orderId,user_id:actor,quote_id:quoteId,supplier,supplier_product:'whatsapp',supplier_country:'brazil',native_units:10000000,price_cents:150,service_name:'WhatsApp',country_name:'Brasil',state,phone:providerId?'5511999999999':null,provider_id:providerId,created_at:new Date().toISOString()});
 vi.stubGlobal('Deno',{env:{get:(k:string)=>k==='SUPABASE_URL'?'https://test.supabase.co':'PRIVATE-SERVER-KEY'}});
 vi.stubGlobal('fetch',vi.fn(async(url:string,init:any={})=>{
  const body=typeof init.body==='string'?JSON.parse(init.body):init.body;calls.push({url,init,body});let value:any;
  if(url.includes('/auth/v1/user'))value={id:actor,email_confirmed_at:'2026-01-01'};
  else if(url.includes('painel_de_desbanimento'))value=[{id:actor,tipo_usuario:options.role??'cliente'}];
  else if(url.includes('astros_sms_gate'))value=true;
  else if(url.includes('astros_sms_orders?'))value=saved?[order()]:[];
  else if(url.includes('astros_sms_settings'))value=[{active_supplier:options.active??'five_sim',enabled:true,usd_brl_units:0,fx_mode:'auto',fx_checked_at:null,worker_at:new Date().toISOString(),updated_at:epoch}];
  else if(url.includes('astros_sms_private'))value=[{five_sim_key:'PRIVATE-FIVE-SIM-KEY',api_key:'PRIVATE-SMSPOOL-KEY',worker_secret:'PRIVATE-WORKER'}];
  else if(url.includes('astros_sms_five_settings'))value=[{native_brl_units:1000,margin_bps:5000,fee_cents:0}];
  else if(url.includes('astros_sms_quotes'))value=[{id:quoteId,user_id:actor,supplier:'five_sim',supplier_product:'whatsapp',supplier_country:'brazil',native_units:10000000,native_brl_units:1000,settings_version:epoch,expires_at:new Date(Date.now()+120000).toISOString()}];
  else if(url.includes('astros_sms_reserve')){saved=true;value={dispatch:options.reserve!==false};}
  else if(url.includes('astros_sms_settle')){state=body.target;if(body.provider)providerId=body.provider;value=null;}
  else if(url.includes('record_purchase_diagnostic'))value=null;
  else if(url.includes('astros_sms_claim_five_cancel')){value=!claimed;claimed=true;}
  else if(url.includes('astros_sms_review_begin'))value={execute:true};
  else if(url.includes('astros_sms_review_finish'))value=null;
  else if(url.includes('5sim.net/v1/guest/prices'))value={brazil:{whatsapp:{virtual1:{cost:options.changed?11:10,count:5}}}};
  else if(url.includes('5sim.net/v1/guest/products'))value={whatsapp:{Category:'activation',Price:10,Qty:5},'1day':{Category:'hosting',Price:80,Qty:3}};
  else if(url.includes('5sim.net/v1/guest/countries'))value={brazil:{iso:{br:1},text_en:'Brazil'}};
  else if(url.includes('5sim.net/v1/user/profile'))value={id:1,balance:options.balance??100};
  else if(url.includes('5sim.net/v1/user/buy/')){if(options.network)throw Error('PRIVATE-FIVE-SIM-KEY timeout');const v=options.buyBody??activation;return new Response(typeof v==='string'?v:JSON.stringify(v),{status:options.buyStatus??200});}
  else if(url.includes('5sim.net/v1/user/check/'))value={...activation,status:options.checkStatus??'PENDING',sms:options.checkSms??null};
  else if(url.includes('5sim.net/v1/user/cancel/')){if(options.cancelNetwork)throw Error('private timeout');value={...activation,status:'CANCELED'};}
  else if(url.includes('api.smspool.net/sms/check'))value={status:6};
  else throw Error('Unexpected endpoint '+url);
  return new Response(JSON.stringify(value));
 }));return calls;
}
function req(action='buy',data:any={requestId:orderId,quoteId,orderId}){return new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer test','X-Astros-Sms-Worker':'PRIVATE-WORKER'},body:JSON.stringify({action,data})});}
it('uses Bearer auth, any operator and frozen maxPrice; never calls SMSPool or FX for a 5SIM buy',async()=>{const calls=setup();const r=await handler(req());expect(r.status).toBe(200);expect((await r.json()).order).toMatchObject({supplier:'five_sim',state:'pending'});const buy=calls.find(v=>v.url.includes('/user/buy/'))!;expect(buy.url).toBe('https://5sim.net/v1/user/buy/activation/brazil/any/whatsapp?maxPrice=10.000000');expect(buy.init.headers.Authorization).toBe('Bearer PRIVATE-FIVE-SIM-KEY');expect(buy.init.redirect).toBe('error');expect(calls.some(v=>v.url.includes('smspool.net')||v.url.includes('frankfurter'))).toBe(false);expect(calls.findIndex(v=>v.url.includes('/user/profile'))).toBeLessThan(calls.findIndex(v=>v.url.includes('astros_sms_reserve')));});
it.each(['0','9.99','invalid'])('blocks before wallet debit on low or unknown 5SIM balance %s',async balance=>{const calls=setup({balance});expect((await handler(req())).status).toBe(400);expect(calls.some(v=>v.url.includes('astros_sms_reserve')||v.url.includes('/buy/'))).toBe(false);});
it('rejects changed stock price before charging',async()=>{const calls=setup({changed:true});expect((await handler(req())).status).toBe(400);expect(calls.some(v=>v.url.includes('astros_sms_reserve')||v.url.includes('/buy/'))).toBe(false);});
it('recovers previous 5SIM order even after admin switches to SMSPool',async()=>{const calls=setup({existing:true,active:'smspool',balance:0});expect((await handler(req())).status).toBe(200);expect(calls.some(v=>v.url.includes('5sim.net')||v.url.includes('astros_sms_settings')||v.url.includes('astros_sms_private'))).toBe(false);});
it('stale quote after supplier switch cannot buy',async()=>{const calls=setup({active:'smspool'});expect((await handler(req())).status).toBe(400);expect(calls.some(v=>v.url.includes('astros_sms_reserve')||v.url.includes('/buy/'))).toBe(false);});
it('refunds proven no-stock rejection once without fallthrough to SMSPool',async()=>{const calls=setup({buyBody:'no free phones'});expect((await (await handler(req())).json()).order.state).toBe('refunded');await handler(req());expect(calls.filter(v=>v.url.includes('/user/buy/'))).toHaveLength(1);expect(calls.some(v=>v.url.includes('smspool.net'))).toBe(false);});
it.each([{network:true},{buyStatus:500,buyBody:'no free phones'},{buyBody:{id:123,phone:'+5511999999999'}},{buyBody:'server offline'}])('never retries/refunds uncertain provider purchase %j',async options=>{const calls=setup(options);expect((await (await handler(req())).json()).order.state).toBe('review');await handler(req());expect(calls.filter(v=>v.url.includes('/user/buy/'))).toHaveLength(1);expect(calls.some(v=>v.url.includes('astros_sms_settle')&&v.body.target==='refunded')).toBe(false);});
it('over-budget but valid delivered identity is retained for reconciliation, never blindly refunded',async()=>{const calls=setup({buyBody:{...activation,price:11}});expect((await (await handler(req())).json()).order.state).toBe('review');expect(calls.find(v=>v.url.includes('astros_sms_settle'))?.body.provider).toBe('123');});
it('catalog excludes hosting and keeps provider slugs; client responses contain no provider credentials',async()=>{const calls=setup();const r=await handler(req('catalog'));const text=await r.text();expect(text).toContain('whatsapp');expect(text).not.toContain('1day');expect(text).not.toContain('PRIVATE');expect(calls.some(v=>v.url.includes('/user/buy/'))).toBe(false);});
it('admin preview applies independent native FX without quote/debit/purchase',async()=>{const calls=setup({role:'admin'});expect(await (await handler(req('admin-price',{serviceId:'whatsapp',countryId:'brazil'}))).json()).toMatchObject({currency:'5SIM',costNative:10,costCents:100,priceCents:150});expect(calls.some(v=>v.url.includes('astros_sms_quotes')||v.url.includes('/user/buy/')||v.url.includes('astros_sms_reserve'))).toBe(false);});
it('a client cannot read/configure providers or select routing',async()=>{for(const action of ['admin-providers','save-five','select-supplier','admin-balance']){const calls=setup();expect((await handler(req(action))).status).toBe(400);expect(calls.some(v=>v.url.includes('astros_sms_private')||v.url.includes('5sim.net')||v.url.includes('astros_sms_select_supplier'))).toBe(false);}});
it('keeps old 5SIM checks on 5SIM after active supplier changes',async()=>{const calls=setup({existing:true,active:'smspool'});expect((await handler(req('check'))).status).toBe(200);expect(calls.some(v=>v.url.includes('5sim.net/v1/user/check/123'))).toBe(true);expect(calls.some(v=>v.url.includes('smspool.net'))).toBe(false);});
it('keeps old SMSPool checks on SMSPool after switching to 5SIM',async()=>{const calls=setup({existing:true,existingSupplier:'smspool'});expect((await handler(req('check'))).status).toBe(200);expect(calls.some(v=>v.url.includes('api.smspool.net/sms/check'))).toBe(true);expect(calls.some(v=>v.url.includes('5sim.net'))).toBe(false);});
it('claims cancellation before external request and never repeats uncertain cancellation',async()=>{const calls=setup({existing:true,cancelNetwork:true});await handler(req('cancel'));await handler(req('cancel'));expect(calls.filter(v=>v.url.includes('/user/cancel/'))).toHaveLength(1);expect(calls.findIndex(v=>v.url.includes('astros_sms_claim_five_cancel'))).toBeLessThan(calls.findIndex(v=>v.url.includes('/user/cancel/')));expect(calls.some(v=>v.url.includes('astros_sms_settle')&&v.body.target==='refunded')).toBe(false);});
it('admin review is audited and routed to original 5SIM without exposing SMS code',async()=>{const calls=setup({existing:true,active:'smspool',role:'admin',checkStatus:'RECEIVED',checkSms:[{code:'987654'}]});const r=await handler(req('admin-review',{orderId,actionId:quoteId,mode:'check',reason:'Conferência solicitada pelo cliente'}));expect(r.status).toBe(200);expect(await r.text()).not.toContain('987654');expect(calls.find(v=>v.url.includes('astros_sms_review_finish'))?.body).toMatchObject({target:'received',code_value:'987654',expected_provider:'123'});expect(calls.some(v=>v.url.includes('smspool.net'))).toBe(false);});
it('worker reconciles 5SIM orders independently of active SMSPool selection',async()=>{const calls=setup({existing:true,active:'smspool'});const r=await handler(req('worker'));expect((await r.json()).checked).toBe(1);expect(calls.some(v=>v.url.includes('5sim.net/v1/user/check/123'))).toBe(true);expect(calls.some(v=>v.url.includes('/user/buy/'))).toBe(false);});

it('projects distinct operator prices, stock and optional historical rate without guessing currency',()=>{
 const result=fiveAdminOffers({brazil:{whatsapp:{virtual4:{cost:30,count:5,rate:0},virtual61:{cost:10,count:2},virtual66:{cost:20,count:0,rate:42.5},broken:{cost:'invalid',count:4},missingStock:{cost:5,count:null}}}},'brazil','whatsapp');
 expect(result).toEqual([{operator:'virtual61',costNative:10,stock:2,deliveryRate:null},{operator:'virtual66',costNative:20,stock:0,deliveryRate:42.5},{operator:'virtual4',costNative:30,stock:5,deliveryRate:0}]);
});
it('admin inspects 5SIM operators independently of active provider, key, conversion and wallet',async()=>{
 const calls=setup({role:'admin',active:'smspool'});const r=await handler(req('admin-five-offers',{serviceId:'whatsapp',countryId:'brazil'}));
 expect(r.status).toBe(200);expect(await r.json()).toMatchObject({service:'WhatsApp',country:'Brazil',currencyConfirmed:false,offers:[{operator:'virtual1',costNative:10,stock:5,deliveryRate:null}]});
 expect(calls.some(v=>v.url.includes('astros_sms_private')||v.url.includes('astros_sms_settings')||v.url.includes('astros_sms_quotes')||v.url.includes('astros_sms_reserve')||v.url.includes('/user/buy/')||v.url.includes('/user/profile'))).toBe(false);
});
it('client cannot access either administrative 5SIM inspection action',async()=>{
 for(const action of ['admin-five-catalog','admin-five-offers']){const calls=setup();expect((await handler(req(action,{serviceId:'whatsapp',countryId:'brazil'}))).status).toBe(400);expect(calls.some(v=>v.url.includes('5sim.net')||v.url.includes('astros_sms_private'))).toBe(false);}
});
it('client quotes keep only final price and availability, without operator costs or delivery rates',async()=>{
 setup();const r=await handler(req('quote',{serviceId:'whatsapp',countryId:'brazil'}));expect(r.status).toBe(200);const text=await r.text();expect(text).not.toContain('costNative');expect(text).not.toContain('deliveryRate');expect(text).not.toContain('virtual1');expect(text).toContain('priceCents');
});
