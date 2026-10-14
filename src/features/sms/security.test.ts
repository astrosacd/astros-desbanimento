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
 it('rejects a worker request without the private worker secret',async()=>{const calls=mock({});const r=await handler(req('worker',false));expect(r.status).toBe(401);expect(calls).toHaveLength(1);});
});
