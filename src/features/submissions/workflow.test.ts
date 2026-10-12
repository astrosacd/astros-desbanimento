import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const workflow=JSON.parse(readFileSync('n8n/astros-submit-number.json','utf8'));
const source=workflow.nodes.find((n:any)=>n.name==='Classificar solicitação').parameters.jsCode;
function classify(status?:string,otherEmail=false,extraBody:Record<string,unknown>={},duplicates=false){
 const row={id:7,numero:'85999999999 - ok',email:otherEmail?'other@example.com':'own@example.com',excluido_da_base:{value:status},observacoes:''};
 const data:Record<string,unknown[]>={'Webhook Astros':[{body:{number:'+55 (85) 99999-9999',requestId:'00000000-0000-4000-8000-000000000001',action:'quote',...extraBody}}],'Validar sessão':[{id:'own',email:'own@example.com',email_confirmed_at:'yes'}],'Consultar perfil':[{id:'own',nome:'Maria Costa',recarga:50}],'Consultar taxa':[{service_price_cents:900}],'Consultar referência':[],'Consultar números':status?[row,...(duplicates?[row]:[])]:[]};
 const $=(name:string)=>({first:()=>({json:data[name]![0]}),all:()=>data[name]!.map(json=>({json}))});
 return new Function('$','$now',source)($,{setZone:()=>({toFormat:()=> '12/10/2026 00:00'})})[0].json;
}
it('charges a new number and sends it to Meta analysis',()=>expect(classify()).toMatchObject({kind:'new',costCents:900,targetStatus:'EM ANÁLISE PELA META',number:'85999999999'}));
it('charges EXCLUIDO again and sends it to Meta analysis',()=>expect(classify('EXCLUIDO')).toMatchObject({kind:'renew',costCents:900,targetStatus:'EM ANÁLISE PELA META'}));
it.each(['ANÁLISE NEGADA','DESBANIMENTO OK','EM ANÁLISE PELA META','REEDESBANIMENTO'])('resends %s without another charge',status=>expect(classify(status)).toMatchObject({kind:'resend',costCents:0,targetStatus:'REEDESBANIMENTO'}));
it('blocks another account’s number and ambiguous duplicates',()=>{expect(classify('EXCLUIDO',true).route).toBe('error');expect(classify('EXCLUIDO',false,{},true).route).toBe('error');});
it('rejects a changed fee before reserving any balance',()=>expect(classify('EXCLUIDO',false,{action:'submit',expectedCents:800}).route).toBe('error'));
it('does not activate the imported workflow before credentials are configured',()=>expect(workflow.active).toBe(false));
