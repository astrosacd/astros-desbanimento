import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {expect,it,vi} from 'vitest';
import {PANEL_ORIGINS} from './validation';
function mailer(origin:string|null){
 let handler:any;const generateLink=vi.fn(async({options}:any)=>({data:{properties:{action_link:options.redirectTo}},error:null})),sendMail=vi.fn(async()=>{}),createUser=vi.fn(async()=>({error:null}));
 const db={from:(table:string)=>({select:()=>({eq:()=>table==='astros_panel_address'?{single:async()=>({data:origin?{origin}:null,error:origin?null:{message:'offline'}})}:{limit:()=>({maybeSingle:async()=>({data:{id:'user'},error:null})})}})}),rpc:async()=>({data:true,error:null}),auth:{admin:{generateLink,createUser}}};
 const source=readFileSync('supabase/functions/astros-auth-email/index.ts','utf8').replace(/^import .*;$/gm,'');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const env:any={ASTROS_EMAIL_INTERNAL_SECRET:'a'.repeat(48),ASTROS_GMAIL_USER:'sender@example.com',ASTROS_GMAIL_APP_PASSWORD:'test-only',ASTROS_APP_URL:'https://evil.example'};
 new Function('Deno','createClient','nodemailer','timingSafeEqual',js)({env:{get:(k:string)=>env[k]},serve:(h:any)=>{handler=h}},()=>db,{createTransport:()=>({sendMail,close(){}})},(a:Uint8Array,b:Uint8Array)=>a.every((v,i)=>v===b[i]));
 return {handler,generateLink,sendMail,createUser};
}
for(const origin of PANEL_ORIGINS)it(`recovery follows stored origin ${origin}`,async()=>{const m=mailer(origin);const r=await m.handler(new Request('https://edge.example',{method:'POST',headers:{'x-astros-email-secret':'a'.repeat(48)},body:JSON.stringify({type:'recovery',email:'client@example.com',origin:'https://evil.example'})}));expect(r.status).toBe(200);expect(m.generateLink).toHaveBeenCalledWith(expect.objectContaining({options:{redirectTo:origin+'/reset-password'}}));expect(m.sendMail.mock.calls[0][0].html).toContain(origin+'/brand/astros-logo.png');});
it('unavailable or invalid address stops before account creation or sending',async()=>{for(const origin of [null,'https://evil.example']){const m=mailer(origin);const r=await m.handler(new Request('https://edge.example',{method:'POST',headers:{'x-astros-email-secret':'a'.repeat(48)},body:JSON.stringify({type:'signup',email:'client@example.com',name:'Maria Costa',password:'12345678',whatsapp:'5585999999999'})}));expect(r.status).toBe(503);expect(m.createUser).not.toHaveBeenCalled();expect(m.sendMail).not.toHaveBeenCalled();}});
