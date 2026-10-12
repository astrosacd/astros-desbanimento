import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {expect,it,vi} from 'vitest';
import {canonicalPhone} from './phone';
import {classify,confirmed,normalize} from '../../../supabase/functions/astros-submit-number/core';
const input={number:'85999999999',requestId:'00000000-0000-4000-8000-000000000001',action:'submit',expectedCents:900};
function setup(options:{unverified?:boolean;cached?:boolean;writeFail?:boolean;reserveFail?:boolean;insufficient?:boolean;changed?:boolean;international?:boolean;existingStatus?:string;custom?:{id:string;ddi:string}|null}={}){
 const phone=options.international?'+351912345678':input.number;const country=options.international?'PT':'BR';const observations=options.existingStatus?'observação anterior':options.international?'internacional':'nacional';
 let handler:(r:Request)=>Promise<Response>;let scans=0;
 const rpc=vi.fn(async(name:string)=> name==='astros_start_service'?{data:options.reserveFail?null:{execute:true},error:options.reserveFail?{}:options.insufficient?{message:'Saldo insuficiente'}:null}:{error:null});
 const db={auth:{getUser:async()=>({data:{user:options.unverified?null:{id:'own',email:'own@example.com',email_confirmed_at:'yes'}}})},from:(table:string)=>{const result={data:table==='astros_service_jobs'?(options.cached?{user_id:'own',number:input.number,state:'completed',result:{success:true,state:'completed'}}:null):table==='astros_custom_countries'?options.custom??null:table==='painel_de_desbanimento'?{id:'own',nome:'Maria'}:{service_price_cents:900},error:null};const q:any={select:()=>q,eq:()=>q,single:async()=>result,maybeSingle:async()=>result};return q;},rpc};
 const fetcher=vi.fn(async(url:URL,init:any)=>{
  if(init.method==='GET'&&url.search){scans++;return new Response(JSON.stringify({count:options.existingStatus||options.changed&&scans===2?1:0,results:options.existingStatus?[{id:7,field_4741:phone,field_4773:'own@example.com',field_4784:observations,field_4831:{value:options.existingStatus}}]:options.changed&&scans===2?[{id:7,field_4741:input.number,field_4773:'own@example.com',field_4831:{value:'DESBANIMENTO OK'}}]:[]}));}
  if(options.writeFail&&init.method!=='GET')throw Error('network lost');
  return new Response(JSON.stringify({id:7,field_4741:phone,field_4773:'own@example.com',field_4831:{value:options.existingStatus&&options.existingStatus!=='EXCLUIDO'?'REEDESBANIMENTO':'EM ANÁLISE PELA META'},field_4784:options.existingStatus==='EXCLUIDO'?(options.international?'internacional':'nacional'):observations}));
 });
 const source=readFileSync('supabase/functions/astros-submit-number/index.ts','utf8').replace(/^import .*;\n/gm,'');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 new Function('createClient','z','classify','confirmed','normalize','canonicalPhone','Deno','fetch',code)(()=>db,z,classify,confirmed,normalize,canonicalPhone,{env:{get:()=> 'secret'},serve:(h:any)=>handler=h},fetcher);
 const send=(extra={})=>handler!(new Request('https://supabase.example/functions/v1/astros-submit-number',{method:'POST',headers:{Authorization:'Bearer session'},body:JSON.stringify({...input,number:phone,country,...extra})}));
 return {send,rpc,fetcher};
}
it('authenticates before any Baserow request or balance reservation',async()=>{const x=setup({unverified:true});expect((await x.send()).status).toBe(401);expect(x.rpc).not.toHaveBeenCalled();expect(x.fetcher).not.toHaveBeenCalled();});
it('quotes without a reservation or external write',async()=>{const x=setup();expect(await (await x.send({action:'quote'})).json()).toMatchObject({state:'quoted',costCents:900});expect(x.rpc).not.toHaveBeenCalled();expect(x.fetcher.mock.calls.every(([,init])=>init.method==='GET')).toBe(true);});
it('reserves, writes once, reads back and finishes only after verification',async()=>{const x=setup();expect(await (await x.send()).json()).toMatchObject({state:'completed'});expect(x.fetcher.mock.calls.filter(([,init])=>init.method!=='GET')).toHaveLength(1);expect(x.rpc.mock.calls.map(([name])=>name)).toEqual(['astros_start_service','astros_finish_service']);});
it('returns the completed reference without another write or debit',async()=>{const x=setup({cached:true});expect(await (await x.send()).json()).toMatchObject({state:'completed'});expect(x.rpc).not.toHaveBeenCalled();expect(x.fetcher).not.toHaveBeenCalled();});
it('does not write when the reservation result is unknown',async()=>{const x=setup({reserveFail:true});expect(await (await x.send()).json()).toMatchObject({success:false});expect(x.fetcher.mock.calls.every(([,init])=>init.method==='GET')).toBe(true);});
it('keeps an uncertain external write in review without retrying or refunding',async()=>{const x=setup({writeFail:true});expect(await (await x.send()).json()).toMatchObject({state:'review'});expect(x.fetcher.mock.calls.filter(([,init])=>init.method!=='GET')).toHaveLength(1);expect(x.rpc.mock.calls[1]).toMatchObject(['astros_finish_service',{final_state:'review'}]);});
it('refunds a changed classification before any external write',async()=>{const x=setup({changed:true});expect(await (await x.send()).json()).toMatchObject({state:'failed'});expect(x.fetcher.mock.calls.every(([,init])=>init.method==='GET')).toBe(true);expect(x.rpc.mock.calls[1]).toMatchObject(['astros_finish_service',{final_state:'failed'}]);});
it('rejects a changed price before reservation',async()=>{const x=setup();expect(await (await x.send({expectedCents:800})).json()).toMatchObject({success:false});expect(x.rpc).not.toHaveBeenCalled();});

it('writes only nacional for a new Brazilian number',async()=>{const x=setup();await x.send();const write=x.fetcher.mock.calls.find(([,init])=>init.method==='POST')!;expect(JSON.parse(write[1].body).field_4784).toBe('nacional');});
it('writes only internacional and the complete DDI for a foreign number',async()=>{const x=setup({international:true});expect(await (await x.send()).json()).toMatchObject({state:'completed',number:'+351912345678'});const write=x.fetcher.mock.calls.find(([,init])=>init.method==='POST')!;expect(JSON.parse(write[1].body)).toMatchObject({field_4784:'internacional',field_4741:'+351912345678'});});
it('replaces observations on EXCLUIDO renewal',async()=>{const x=setup({existingStatus:'EXCLUIDO'});expect(await (await x.send()).json()).toMatchObject({state:'completed'});const write=x.fetcher.mock.calls.find(([,init])=>init.method==='PATCH')!;expect(JSON.parse(write[1].body).field_4784).toBe('nacional');});
it('preserves existing observations on a free resend',async()=>{const x=setup({existingStatus:'ANÁLISE NEGADA'});expect(await (await x.send({expectedCents:0})).json()).toMatchObject({state:'completed',costCents:0});const write=x.fetcher.mock.calls.find(([,init])=>init.method==='PATCH')!;expect(JSON.parse(write[1].body).field_4784).toBe('observação anterior');});

it('looks up custom DDIs on Supabase rather than accepting a browser value',async()=>{const custom={id:'00000000-0000-4000-8000-000000000009',ddi:'351'};const x=setup({international:true,custom});expect(await (await x.send({country:'custom:'+custom.id})).json()).toMatchObject({state:'completed',number:'+351912345678'});});
it('rejects a deleted or missing custom country before any balance reservation',async()=>{const x=setup({custom:null});expect(await (await x.send({country:'custom:00000000-0000-4000-8000-000000000009'})).json()).toMatchObject({success:false});expect(x.rpc).not.toHaveBeenCalled();expect(x.fetcher).not.toHaveBeenCalled();});
it('rejects a changed custom DDI before any balance reservation',async()=>{const x=setup({international:true,custom:{id:'00000000-0000-4000-8000-000000000009',ddi:'44'}});expect(await (await x.send({country:'custom:00000000-0000-4000-8000-000000000009'})).json()).toMatchObject({success:false});expect(x.rpc).not.toHaveBeenCalled();});
