import {historySearchSchema} from '../numbers/validation';
import { getCookie, setResponseHeader } from '@tanstack/react-start/server';
import { request } from '../admin/auth.server';
import { callSubmission } from './transport.server';
import { submissionSchema } from './validation';
export async function send(input:unknown){
 setResponseHeader('Cache-Control','private, no-store');const data=submissionSchema.parse(input);const token=getCookie('astros_client_session');if(!token)throw new Error('Sua sessão expirou. Entre novamente.');
 const auth=await request('/auth/v1/user',token);if(!auth.ok)throw new Error('Sua sessão expirou. Entre novamente.');const user=await auth.json();if(!user.id||!user.email_confirmed_at)throw new Error('Confirme seu e-mail antes de enviar.');
 let result:Response;try{result=await callSubmission(token,data);}catch(error){if(data.action==='submit'){try{const queued=await trackedResult(data.requestId,data.number,user.id,token);if(queued)return queued;}catch{}}console.warn('astros_submission_connection_failure',{action:data.action,code:error instanceof Error?error.name:'unknown',reason:error instanceof Error&&error.message.startsWith('SUBMISSION_')?error.message:'NETWORK',cause:error instanceof Error&&'cause' in error&&typeof error.cause==='object'&&error.cause!==null&&'code' in error.cause?String(error.cause.code):undefined});throw new Error(data.action==='quote'?'Não foi possível consultar o número no servidor. Nenhum envio foi iniciado. Tente novamente em alguns instantes. (E01)':'Não foi possível confirmar o envio. Não envie novamente com outra referência; consulte o histórico ou o suporte. (E02)');}
 const value=await result.json();
 if(!result.ok||!value.success)throw new Error(value.message||'O serviço não conseguiu concluir o envio. Confira o histórico antes de tentar novamente.');
 return {state:value.state as string,number:value.number as string,targetStatus:value.targetStatus as string,costCents:Number(value.costCents),kind:value.kind as string,message:value.message as string};
}
export async function history(){
 setResponseHeader('Cache-Control','private, no-store');const token=getCookie('astros_client_session');if(!token)throw new Error('Entre novamente.');
 const auth=await request('/auth/v1/user',token);if(!auth.ok)throw new Error('Sua sessão expirou.');const user=await auth.json();if(!user.id)throw new Error('Conta não encontrada.');
 const path=`/rest/v1/astros_service_jobs?user_id=eq.${encodeURIComponent(user.id)}&select=id,number,kind,amount_cents,target_status,state,created_at,protocol_version&order=created_at.desc&limit=20`;
 let r=await request(path,token);if(r.status===400)r=await request(path.replace(',protocol_version',''),token);if(!r.ok)throw new Error('O histórico de envios estará disponível após ativar o serviço.');
 return await r.json() as Array<{id:string;number:string;kind:string;amount_cents:number;target_status:string;state:string;created_at:string;protocol_version?:number}>;
}

async function trackedResult(id:string,number:string,userId:string,token:string){
 const r=await request(`/rest/v1/astros_service_jobs?id=eq.${id}&user_id=eq.${encodeURIComponent(userId)}&select=id,number,kind,amount_cents,target_status,state,protocol_version&limit=1`,token);
 if(!r.ok)return null;const job=(await r.json())[0];if(!job||job.protocol_version!==2||job.number!==number)return null;
 return {state:String(job.state),number:String(job.number),kind:String(job.kind),costCents:Number(job.amount_cents),targetStatus:String(job.target_status),message:job.state==='completed'?'Envio confirmado.':job.state==='failed'?'O envio não foi concluído. A taxa foi devolvida.':'Seu envio está sendo conferido automaticamente. Acompanhe em Solicitações.'};
}

export async function searchedHistory(input:unknown){
 const {page,number}=historySearchSchema.parse(input);
 setResponseHeader('Cache-Control','private, no-store');const token=getCookie('astros_client_session');if(!token)throw Error('Entre novamente.');
 const auth=await request('/auth/v1/user',token);if(!auth.ok)throw Error('Sua sessão expirou.');const user=await auth.json();if(!user.id||!user.email_confirmed_at)throw Error('Confirme seu e-mail e entre novamente.');
 const path=`/rest/v1/astros_service_jobs?user_id=eq.${encodeURIComponent(user.id)}&select=id,number,kind,amount_cents,target_status,state,created_at,protocol_version&order=created_at.desc,id.desc&limit=11&offset=${(page-1)*10}${number?`&number=like.*${number}*`:''}`;
 let r=await request(path,token);if(r.status===400)r=await request(path.replace(',protocol_version',''),token);if(!r.ok)throw Error('Não foi possível consultar o histórico de envios. Tente novamente.');
 const rows=await r.json() as Awaited<ReturnType<typeof history>>;if(rows.some(row=>!String(row.number).replace(/\D/g,'').includes(number)))throw Error('Não foi possível validar o resultado da busca.');
 return {rows:rows.slice(0,10),page,pageSize:10,hasMore:rows.length>10};
}
