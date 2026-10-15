import {afterEach,it,expect,vi} from 'vitest';
import {handler} from '../../../supabase/functions/astros-sms/index';
afterEach(()=>vi.unstubAllGlobals());
it.each([[{success:0,message:'Custom areacodes is not supported for this pool.'},[]],[['85','11'],['85','11']]])('projects only confirmed DDDs without buying or exposing pool',async(response,expected)=>{
 vi.stubGlobal('Deno',{env:{get:(key:string)=>key==='SUPABASE_URL'?'https://example.supabase.co':'private'}});
 const calls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{calls.push(url);let value:unknown;if(url.includes('/auth/v1/user'))value={id:'own',email_confirmed_at:'2026-01-01'};else if(url.includes('painel_de_desbanimento'))value=[{id:'own',tipo_usuario:'cliente'}];else if(url.includes('astros_sms_gate'))value=true;else if(url.includes('astros_sms_settings'))value=[{enabled:true,usd_brl_units:50000,worker_at:new Date().toISOString()}];else if(url.includes('astros_sms_private'))value=[{api_key:'PRIVATE'}];else if(url.includes('country/retrieve_all'))value=[{ID:68,short_name:'BR'}];else if(url.includes('sms/all_stock'))value=[[{country:68,service:907,pool:3,stock:1,price:'1.00'}]];else if(url.includes('request/areacodes'))value=response;else throw Error('Unexpected endpoint');return new Response(JSON.stringify(value));}));
 const r=await handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({action:'area-options',data:{serviceId:907,countryId:68}})}));
 expect(r.status).toBe(200);expect(await r.json()).toEqual({areas:expected});expect(calls.some(v=>v.includes('reserve')||v.includes('purchase')||v.includes('quotes'))).toBe(false);
});
