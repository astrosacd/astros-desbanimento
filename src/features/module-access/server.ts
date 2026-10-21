import {getCookie,setResponseHeader} from '@tanstack/react-start/server';
import {requireAdmin,request} from '../admin/auth.server';
import {moduleList,targetSchema,saveSchema} from './model';
async function rpc(name:string,token:string,body:unknown){
 setResponseHeader('Cache-Control','private, no-store');
 const r=await request('/rest/v1/rpc/'+name,token,{method:'POST',body:JSON.stringify(body)});
 const v=await r.json().catch(()=>null);
 // Compatibility for the staged installation only, never on transport/permission errors.
 if(!r.ok&&r.status===404&&v?.code==='PGRST202')return {installed:false as const,modules:[]};
 if(!r.ok)throw Error('Não foi possível consultar ou salvar o controle de módulos.');
 return {installed:true as const,modules:name==='astros_save_module'?[]:moduleList.parse(v)};
}
export async function myModules(){
 const token=getCookie('astros_client_session');if(!token)throw Error('Entre novamente para continuar.');
 const auth=await request('/auth/v1/user',token);const u=auth.ok?await auth.json():null;
 if(!u?.id||!u.email_confirmed_at)throw Error('Entre com uma conta confirmada.');
 return rpc('astros_my_modules',token,{});
}
export async function adminModules(input:unknown){await requireAdmin();const data=targetSchema.parse(input);return rpc('astros_admin_modules',getCookie('astros_admin_session')!,{target_user:data.userId});}
export async function updateModule(input:unknown){await requireAdmin();const data=saveSchema.parse(input);const r=await rpc('astros_save_module',getCookie('astros_admin_session')!,{module_key:data.module,active:data.enabled,target_user:data.userId,notice:data.message});if(!r.installed)throw Error('O controle de módulos ainda precisa ser instalado.');return {saved:true};}
