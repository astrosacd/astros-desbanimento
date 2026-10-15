import {afterEach,expect,it,vi} from 'vitest';
import {handler} from '../../../supabase/functions/astros-sms/index';
const actor='00000000-0000-4000-8000-000000000001',requestId='00000000-0000-4000-8000-000000000002',quoteId='00000000-0000-4000-8000-000000000003';
const existing={id:requestId,user_id:actor,quote_id:quoteId,state:'pending',service_name:'Example',country_name:'Example',price_cents:1753,created_at:'2026-10-15T00:00:00Z'};
function setup({balance='1.99',role='cliente',failure=false,previous=false,parallel=false}:{balance?:unknown;role?:string;failure?:boolean;previous?:boolean;parallel?:boolean}={}){
 vi.stubGlobal('Deno',{env:{get:(k:string)=>k==='SUPABASE_URL'?'https://example.supabase.co':'private-test-only'}});
 const calls:string[]=[];let reads=0;
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{calls.push(url);let value:unknown;
 if(url.includes('/auth/v1/user'))value={id:actor,email_confirmed_at:'2026-01-01'};
 else if(url.includes('painel_de_desbanimento'))value=[{id:actor,tipo_usuario:role}];
 else if(url.includes('astros_sms_gate'))value=true;
 else if(url.includes('astros_sms_orders?')){reads++;value=previous||parallel&&reads>1?[existing]:[];}
 else if(url.includes('astros_sms_settings'))value=[{enabled:true,usd_brl_units:55338,worker_at:new Date().toISOString(),fx_mode:'manual'}];
 else if(url.includes('astros_sms_private'))value=[{api_key:'PRIVATE-INTEGRATION-KEY'}];
 else if(url.includes('astros_sms_quotes'))value=[{id:quoteId,user_id:actor,usd_units:1990000,country_id:1,service_id:1,pool_id:7}];
 else if(url.includes('request/price'))value={price:'1.99',pool:7};
 else if(url.includes('request/balance')){if(failure)throw Error('PRIVATE provider failure');value={balance};}
 else if(url.includes('astros_sms_reserve'))value={dispatch:false};
 else throw Error('Unexpected endpoint');
 return new Response(JSON.stringify(value));}));return calls;
}
const req=(action='buy')=>new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test'},body:JSON.stringify({action,data:{requestId,quoteId}})});
afterEach(()=>vi.unstubAllGlobals());
it.each(['0','1.989999',null,'invalid',-1])('blocks purchase before reserve for unavailable or insufficient supplier balance %s',async(balance)=>{const calls=setup({balance});const r=await handler(req());const text=await r.text();expect(r.status).toBe(400);expect(text).toContain('Nenhum valor foi descontado nesta tentativa');expect(text).not.toContain('SMSPool');expect(text).not.toContain('PRIVATE');expect(calls.some(v=>v.includes('astros_sms_reserve')||v.includes('purchase/'))).toBe(false);});
it('blocks before any debit when provider balance cannot be confirmed',async()=>{const calls=setup({failure:true});const r=await handler(req());expect(r.status).toBe(400);expect(calls.some(v=>v.includes('astros_sms_reserve')||v.includes('purchase/'))).toBe(false);expect(await r.text()).not.toContain('PRIVATE');});
it('accepts balance equal to supplier USD cost, not the client sale price',async()=>{const calls=setup({balance:'1.99',parallel:true});const r=await handler(req());expect(r.status).toBe(200);expect(calls.some(v=>v.includes('astros_sms_reserve'))).toBe(true);expect(calls.findIndex(v=>v.includes('request/balance'))).toBeLessThan(calls.findIndex(v=>v.includes('astros_sms_reserve')));expect(calls.some(v=>v.includes('purchase/'))).toBe(false);});
it('recovers an existing request without requiring provider funds or issuing another purchase',async()=>{const calls=setup({balance:'0',previous:true});const r=await handler(req());expect(r.status).toBe(200);expect((await r.json()).order.id).toBe(requestId);expect(calls.some(v=>v.includes('api.smspool.net')||v.includes('astros_sms_reserve'))).toBe(false);});
it('recovers a concurrently created request when the preflight fails',async()=>{const calls=setup({balance:'0',parallel:true});const r=await handler(req());expect(r.status).toBe(200);expect((await r.json()).order.state).toBe('pending');expect(calls.some(v=>v.includes('astros_sms_reserve')||v.includes('purchase/'))).toBe(false);});
it('does not expose the supplier balance to clients',async()=>{const calls=setup();const r=await handler(req('admin-balance'));expect(r.status).toBe(400);expect(calls.some(v=>v.includes('astros_sms_private')||v.includes('api.smspool.net'))).toBe(false);});
it('admin reads a numeric balance and low-saldo flag without provider credentials',async()=>{setup({balance:'1.99',role:'admin'});const r=await handler(req('admin-balance'));expect(r.status).toBe(200);const data=await r.json();expect(data.balanceUnits).toBe(1990000);expect(data.lowBalance).toBe(true);expect(data.lowThresholdUnits).toBe(5000000);expect(JSON.stringify(data)).not.toContain('PRIVATE');});
it('supplier balance errors never report a fictitious zero',async()=>{setup({role:'admin',failure:true});const r=await handler(req('admin-balance'));expect(r.status).toBe(400);expect((await r.json()).balanceUnits).toBeUndefined();});
