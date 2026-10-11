import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import { expect, it, vi } from 'vitest';
function handler(config:Record<string,unknown>,role='cliente'){
 let serve:(req:Request)=>Promise<Response>;
 const db={auth:{getUser:async()=>({data:{user:{id:'own',email:'own@example.com',email_confirmed_at:'yes'}}})},from:(table:string)=>({select:()=>({eq:()=>({single:async()=>({data:table==='painel_de_desbanimento'?{id:'own',tipo_usuario:role}:config})})})})};
 const source=readFileSync('supabase/functions/astros-payments/index.ts','utf8').replace(/^import .*;\n/gm,'');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.None}}).outputText;
 new Function('createClient','z','Deno',js)(()=>db,z,{env:{get:()=> 'private'},serve:(fn:typeof serve)=>{serve=fn;}});
 return (action:string,data:unknown)=>serve(new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer own-session'},body:JSON.stringify({action,data})}));
}
it('enforces the current admin minimum on the server before generating a payment',async()=>{
 const provider=vi.fn();vi.stubGlobal('fetch',provider);
 const call=handler({enabled:true,access_token:'private',minimum_enabled:true,minimum_recharge_cents:2000});
 const r=await call('create',{amountCents:1000,method:'pix',requestId:'00000000-0000-4000-8000-000000000001',cpf:'12345678901'});
 expect(r.status).toBe(400);expect((await r.json()).error).toContain('20,00');expect(provider).not.toHaveBeenCalled();
});
it('never exposes private settings to a client',async()=>{
 const r=await handler({access_token:'private'})('settings',{});
 expect(r.status).toBe(403);expect(JSON.stringify(await r.json())).not.toContain('private');
});
