import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {handler} from '../../../supabase/functions/astros-prospecting/index';
const fetcher=vi.fn();let admin=false;
beforeEach(()=>{admin=false;vi.stubGlobal('Deno',{env:{get:(name:string)=>({SUPABASE_URL:'https://db.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'}[name])}});vi.stubGlobal('fetch',fetcher);fetcher.mockImplementation(async(url:string)=>{if(String(url).endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'own',email_confirmed_at:'yes'}));if(String(url).includes('/painel_de_desbanimento?'))return new Response(JSON.stringify([{id:'own',tipo_usuario:admin?'admin':'cliente'}]));if(String(url).includes('/astros_prospect_settings?'))return new Response(JSON.stringify([{enabled:false,unit_cents:10}]));if(String(url).includes('/astros_prospect_deliveries?'))return new Response('[]');if(String(url).includes('/astros_prospect_private?'))return new Response(JSON.stringify([{api_key:'secret-never-public'}]));throw Error('Unexpected network request');});});afterEach(()=>vi.unstubAllGlobals());
const req=(action:string,data:unknown={})=>new Request('https://function.invalid',{method:'POST',headers:{Authorization:'Bearer user-token'},body:JSON.stringify({action,data})});
it('blocks customer administrative actions before loading the private key',async()=>{const r=await handler(req('admin-config'));expect(r.status).toBe(400);expect(fetcher.mock.calls.some(c=>String(c[0]).includes('astros_prospect_private'))).toBe(false);});
it('never returns provider credentials in client configuration',async()=>{const r=await handler(req('config'));expect(await r.json()).toEqual({enabled:false,unitCents:10,maxQuantity:20});expect(fetcher.mock.calls.some(c=>String(c[0]).includes('astros_prospect_private'))).toBe(false);});
it('scopes history to verified identity regardless of caller supplied account',async()=>{const r=await handler(req('history',{user_id:'other',page:0}));expect(r.status).toBe(200);const url=fetcher.mock.calls.find(c=>String(c[0]).includes('/astros_prospect_deliveries?'))![0];expect(new URL(String(url)).searchParams.get('user_id')).toBe('eq.own');});
it('does not expose the stored key to the administrator either',async()=>{admin=true;const r=await handler(req('admin-config'));const text=await r.text();expect(text).toContain('"hasKey":true');expect(text).not.toContain('secret-never-public');});

it('derives summary owner from verified identity and never accepts a requested account',async()=>{
 fetcher.mockImplementation(async(url:string,options:any)=>{
  if(String(url).endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'own',email_confirmed_at:'yes'}));
  if(String(url).includes('/painel_de_desbanimento?'))return new Response(JSON.stringify([{id:'own',tipo_usuario:'cliente'}]));
  if(String(url).endsWith('/rpc/astros_prospect_lead_summary')) {expect(JSON.parse(options.body)).toEqual({actor:'own'});return new Response(JSON.stringify({total:29,new:25,contacted:1,negotiating:1,won:1,discarded:1}));}
  throw Error('Unexpected network request');
 });
 const r=await handler(req('lead-summary',{actor:'other',user_id:'other'}));expect(r.status).toBe(200);expect((await r.json()).total).toBe(29);
 expect(fetcher.mock.calls.some(c=>String(c[0]).includes('serpapi'))).toBe(false);
});
