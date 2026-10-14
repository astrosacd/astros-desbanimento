import {afterEach,describe,it,expect,vi} from 'vitest';
import {handler} from '../../../supabase/functions/astros-sms/index';
const actor='00000000-0000-4000-8000-000000000001';
function mock(user:Record<string,unknown>,role='cliente'){
 vi.stubGlobal('Deno',{env:{get:(k:string)=>k==='SUPABASE_URL'?'https://example.supabase.co':'test-only-not-a-real-key'}});
 const calls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string)=>{calls.push(url);const value=url.includes('/auth/v1/user')?user:url.includes('painel_de_desbanimento')?[{id:actor,tipo_usuario:role}]:url.includes('astros_sms_gate')?true:url.includes('astros_sms_private')?[{worker_secret:'private-worker'}]:null;return new Response(JSON.stringify(value));}));return calls;
}
const req=(action:string,token=true)=>new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer test-only'}:{})},body:JSON.stringify({action,data:{}})});
afterEach(()=>vi.unstubAllGlobals());
describe('SMS identity and secret boundaries',()=>{
 it('rejects missing authentication before any provider or database call',async()=>{const calls=mock({});const r=await handler(req('catalog',false));expect(r.status).toBe(400);expect(calls).toHaveLength(0);});
 it('rejects unconfirmed Auth identity',async()=>{const calls=mock({id:actor});const r=await handler(req('catalog'));expect(r.status).toBe(400);expect(calls).toHaveLength(1);});
 it('blocks temporary-password accounts before reading private configuration',async()=>{const calls=mock({id:actor,email_confirmed_at:'2026-01-01',app_metadata:{astros_password_change_required:true}});const r=await handler(req('catalog'));expect(r.status).toBe(400);expect(calls).toHaveLength(1);});
 it('does not let a client read admin settings or integration secrets',async()=>{const calls=mock({id:actor,email_confirmed_at:'2026-01-01'});const r=await handler(req('admin-settings'));expect(r.status).toBe(400);expect(calls.some(v=>v.includes('astros_sms_private'))).toBe(false);expect(calls.some(v=>v.includes('api.smspool.net'))).toBe(false);});
 it('blocks client access to administrative cost previews before loading private settings',async()=>{const calls=mock({id:actor,email_confirmed_at:'2026-01-01'});for(const action of ['admin-catalog','admin-price'])expect((await handler(req(action))).status).toBe(400);expect(calls.some(v=>v.includes('astros_sms_private'))).toBe(false);});
 it('rejects a worker request without the private worker secret',async()=>{const calls=mock({});const r=await handler(req('worker',false));expect(r.status).toBe(401);expect(calls).toHaveLength(1);});
});

it('admin cost preview works with sales disabled and never purchases or reserves funds',async()=>{
 mock({id:actor,email_confirmed_at:'2026-01-01'},'admin');const calls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{calls.push(url);let value:unknown=null;
 if(url.includes('/auth/v1/user'))value={id:actor,email_confirmed_at:'2026-01-01'};
 else if(url.includes('painel_de_desbanimento'))value=[{id:actor,tipo_usuario:'admin'}];
 else if(url.includes('astros_sms_gate'))value=true;
 else if(url.includes('astros_sms_settings'))value=[{enabled:false,usd_brl_units:55000,margin_bps:0,fee_cents:0}];
 else if(url.includes('astros_sms_private'))value=[{api_key:'private-test-only'}];
 else if(url.includes('service/retrieve_all'))value=[{ID:1,name:'Example'}];
 else if(url.includes('country/retrieve_all'))value=[{ID:1,name:'Example country'}];
 else if(url.includes('sms/all_stock'))value=[{service:1,country:1,pool:1,stock:10,price:'0.24'}];
 else if(url.includes('sms/stock'))value={success:1,amount:10};
 else throw Error('Unexpected write or endpoint');
 return new Response(JSON.stringify(value));}));
 const request=new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test-only','Content-Type':'application/json'},body:JSON.stringify({action:'admin-price',data:{serviceId:1,countryId:1}})});
 const response=await handler(request);expect(response.status).toBe(200);const result=await response.json();expect(result.costCents).toBe(132);expect(result.priceCents).toBe(132);expect(JSON.stringify(result)).not.toContain('private-test-only');expect(calls.some(v=>v.includes('purchase/')||v.includes('astros_sms_reserve')||v.includes('astros_sms_quotes'))).toBe(false);
});
