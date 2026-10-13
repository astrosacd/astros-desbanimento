import {getCookie,setResponseHeader} from '@tanstack/react-start/server';
import {requireAdmin,request} from '../admin/auth.server';
import {clientSearchSchema,clientCreditSchema,creditHistorySchema} from './validation';
async function session(){await requireAdmin();setResponseHeader('Cache-Control','private, no-store');const token=getCookie('astros_admin_session');if(!token)throw Error('Entre novamente na administração.');return token;}
export async function searchClients(input:unknown){
 const token=await session();const data=clientSearchSchema.parse(input);
 const escaped=data.search.replace(/[\\%_*]/g,v=>'\\'+(v==='*'?'%':v));
 const query=new URLSearchParams({select:'id,nome,email,recarga',tipo_usuario:'eq.cliente',[data.field]:`ilike.*${escaped}*`,order:'nome.asc,id.asc',limit:'11',offset:String((data.page-1)*10)});
 const r=await request(`/rest/v1/painel_de_desbanimento?${query}`,token);if(!r.ok)throw Error('Não foi possível pesquisar os clientes.');
 const rows=await r.json();return {rows:rows.slice(0,10).map((row:any)=>({id:String(row.id),name:String(row.nome||'Cliente'),email:String(row.email||''),balanceCents:Math.round(Number(row.recarga||0)*100)})),hasMore:rows.length>10};
}
export async function creditClient(input:unknown){
 const token=await session();const data=clientCreditSchema.parse(input);
 let r:Response;try{r=await request('/rest/v1/rpc/astros_credit_client',token,{method:'POST',body:JSON.stringify({request_id:data.requestId,client_id:data.clientId,credit_cents:data.amountCents,description:data.reason})});}catch{throw Error('Não foi possível confirmar o lançamento. Tente novamente mantendo os mesmos dados para evitar duplicidade.');}
 if(!r.ok)throw Error('Não foi possível confirmar o crédito. Confira o cliente, execute o SQL de saldo manual e tente novamente com os mesmos dados.');
 const result=await r.json();if(!result?.success||!Number.isSafeInteger(result.balanceCents))throw Error('Não foi possível confirmar o saldo atualizado. Confira o histórico antes de repetir com outros dados.');return result as {success:true;balanceCents:number;amountCents:number;repeated:boolean};
}
export async function creditHistory(input:unknown){
 const token=await session();const data=creditHistorySchema.parse(input);
 const r=await request(`/rest/v1/astros_manual_credits?user_id=eq.${data.clientId}&select=id,amount_cents,reason,balance_before_cents,balance_after_cents,created_at&order=created_at.desc,id.desc&limit=11&offset=${(data.page-1)*10}`,token);
 if(!r.ok)throw Error('Não foi possível consultar os créditos manuais. Execute o SQL de saldo manual.');const rows=await r.json();return {rows:rows.slice(0,10) as Array<{id:string;amount_cents:number;reason:string;balance_before_cents:number;balance_after_cents:number;created_at:string}>,hasMore:rows.length>10};
}
