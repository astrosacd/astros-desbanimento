import {randomBytes,createHash} from 'node:crypto';
import {getCookie,setResponseHeader} from '@tanstack/react-start/server';
import {request,requireAdmin} from '../admin/auth.server';
async function rpc(name:string,data:unknown,admin=false){setResponseHeader('Cache-Control','private, no-store');if(admin)await requireAdmin();const token=getCookie(admin?'astros_admin_session':'astros_client_session');if(!token)throw Error('Entre novamente.');const response=await request('/rest/v1/rpc/'+name,token,{method:'POST',body:JSON.stringify(data)});if(!response.ok)throw Error('Não foi possível atualizar a API. Confira a liberação e execute o SQL da API.');return await response.json() as {enabled:boolean;hasKey:boolean;keyCreatedAt:string|null};}
export const status=()=>rpc('astros_api_status',{});
export const adminStatus=(targetId:string)=>rpc('astros_api_status',{target_id:targetId},true);
export const permission=(targetId:string,enabled:boolean)=>rpc('astros_api_permission',{target_id:targetId,allow_access:enabled},true);
export async function key(){const secret='astros_'+randomBytes(32).toString('hex');const state=await rpc('astros_api_set_key',{new_hash:createHash('sha256').update(secret).digest('hex')});return {...state,key:secret};}
export const revoke=()=>rpc('astros_api_set_key',{new_hash:null});

export async function logs(input:unknown,admin=false){
 const {logSearchSchema,adminLogSearchSchema}=await import('./log-validation');const data=admin?adminLogSearchSchema.parse(input):logSearchSchema.parse(input);
 setResponseHeader('Cache-Control','private, no-store');if(admin)await requireAdmin();const token=getCookie(admin?'astros_admin_session':'astros_client_session');if(!token)throw Error('Entre novamente.');
 const auth=await request('/auth/v1/user',token);if(!auth.ok)throw Error('Entre novamente.');const user=await auth.json();if(!user.id||!user.email_confirmed_at)throw Error('Confirme seu e-mail e entre novamente.');
 const query=new URLSearchParams({select:admin?'id,operation,request_id,number,country,state,error_code,http_status,duration_ms,created_at,account:painel_de_desbanimento!astros_api_logs_user_id_fkey(nome,email)':'id,operation,request_id,number,country,state,error_code,http_status,duration_ms,created_at',created_at:'gte.'+new Date(Date.now()-30*86400000).toISOString(),order:'created_at.desc,id.desc',limit:'21',offset:String((data.page-1)*20)});
 if(!admin)query.set('user_id','eq.'+user.id);
 if(admin&&'userId'in data&&data.userId)query.set('user_id','eq.'+data.userId);
 if(admin&&'email'in data&&typeof data.email==='string'&&data.email){const accounts=await request('/rest/v1/painel_de_desbanimento?'+new URLSearchParams({select:'id',email:'ilike.'+data.email.replace(/[\\%_*]/g,v=>'\\'+(v==='*'?'%':v)),limit:'2'}),token);if(!accounts.ok)throw Error('Não foi possível pesquisar a conta.');const rows=await accounts.json();if(!rows.length)return {rows:[],hasMore:false};if(rows.length!==1)throw Error('Informe o e-mail completo de uma conta.');if('userId'in data&&data.userId&&data.userId!==rows[0].id)return {rows:[],hasMore:false};query.set('user_id','eq.'+rows[0].id);}
 if(data.operation)query.set('operation','eq.'+data.operation);if(data.result)query.set('state','eq.'+data.result);if(data.search)query.set('number','like.*'+data.search+'*');
 const response=await request('/rest/v1/astros_api_logs?'+query,token);if(!response.ok)throw Error('Não foi possível consultar os logs da API. Confira se o SQL dos logs foi executado.');const rows=await response.json();return {rows:rows.slice(0,20) as Array<{id:string;operation:string;request_id:string|null;number:string|null;country:string|null;state:string;error_code:string|null;http_status:number;duration_ms:number;created_at:string;account?:{nome:string;email:string}}>,hasMore:rows.length>20};
}
