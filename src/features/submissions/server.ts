import { getCookie, setResponseHeader } from '@tanstack/react-start/server';
import { request } from '../admin/auth.server';
import { submissionSchema } from './validation';
export async function send(input:unknown){
 setResponseHeader('Cache-Control','private, no-store');const data=submissionSchema.parse(input);const token=getCookie('astros_client_session');if(!token)throw new Error('Sua sessão expirou. Entre novamente.');
 const auth=await request('/auth/v1/user',token);if(!auth.ok)throw new Error('Sua sessão expirou. Entre novamente.');const user=await auth.json();if(!user.id||!user.email_confirmed_at)throw new Error('Confirme seu e-mail antes de enviar.');
 let result:Response;try{result=await request('/functions/v1/astros-submit-number',token,{method:'POST',body:JSON.stringify(data),redirect:'error',signal:AbortSignal.timeout(90000)});}catch{throw new Error(data.action==='quote'?'Não foi possível consultar o número no servidor. Nenhum envio foi iniciado. Tente novamente em alguns instantes. (E01)':'Não foi possível confirmar o envio. Não envie novamente com outra referência; consulte o histórico ou o suporte. (E02)');}
 const value=await result.json();
 if(!result.ok||!value.success)throw new Error(value.message||'O serviço não conseguiu concluir o envio. Confira o histórico antes de tentar novamente.');
 return {state:value.state as string,number:value.number as string,targetStatus:value.targetStatus as string,costCents:Number(value.costCents),kind:value.kind as string,message:value.message as string};
}
export async function history(){
 setResponseHeader('Cache-Control','private, no-store');const token=getCookie('astros_client_session');if(!token)throw new Error('Entre novamente.');
 const auth=await request('/auth/v1/user',token);if(!auth.ok)throw new Error('Sua sessão expirou.');const user=await auth.json();if(!user.id)throw new Error('Conta não encontrada.');
 const r=await request(`/rest/v1/astros_service_jobs?user_id=eq.${encodeURIComponent(user.id)}&select=id,number,kind,amount_cents,target_status,state,created_at&order=created_at.desc&limit=20`,token);if(!r.ok)throw new Error('O histórico de envios estará disponível após ativar o serviço.');
 return await r.json() as Array<{id:string;number:string;kind:string;amount_cents:number;target_status:string;state:string;created_at:string}>;
}
