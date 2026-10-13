import {randomBytes,createHash} from 'node:crypto';
import {getCookie,setResponseHeader} from '@tanstack/react-start/server';
import {request,requireAdmin} from '../admin/auth.server';
async function rpc(name:string,data:unknown,admin=false){setResponseHeader('Cache-Control','private, no-store');if(admin)await requireAdmin();const token=getCookie(admin?'astros_admin_session':'astros_client_session');if(!token)throw Error('Entre novamente.');const response=await request('/rest/v1/rpc/'+name,token,{method:'POST',body:JSON.stringify(data)});if(!response.ok)throw Error('Não foi possível atualizar a API. Confira a liberação e execute o SQL da API.');return await response.json() as {enabled:boolean;hasKey:boolean;keyCreatedAt:string|null};}
export const status=()=>rpc('astros_api_status',{});
export const adminStatus=(targetId:string)=>rpc('astros_api_status',{target_id:targetId},true);
export const permission=(targetId:string,enabled:boolean)=>rpc('astros_api_permission',{target_id:targetId,allow_access:enabled},true);
export async function key(){const secret='astros_'+randomBytes(32).toString('hex');const state=await rpc('astros_api_set_key',{new_hash:createHash('sha256').update(secret).digest('hex')});return {...state,key:secret};}
export const revoke=()=>rpc('astros_api_set_key',{new_hash:null});
