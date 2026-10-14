import {getCookie,setResponseHeader} from '@tanstack/react-start/server';
import {requireAdmin,request} from '../admin/auth.server';
import {validateClient,excludedEmail} from './core';
export async function importClient(input:unknown){
 await requireAdmin();setResponseHeader('Cache-Control','private, no-store');const row=validateClient(input);
 if(row.email===excludedEmail)return {success:true as const,state:'excluded' as const,repeated:false};
 const token=getCookie('astros_admin_session');if(!token)throw Error('Entre novamente na administração.');
 let response:Response;try{response=await request('/functions/v1/astros-import-clients',token,{method:'POST',body:JSON.stringify(row),signal:AbortSignal.timeout(25000)});}catch{throw Error('Não foi possível confirmar. Tente novamente com o mesmo arquivo; os créditos concluídos não serão repetidos.');}
 const result=await response.json().catch(()=>null);
 if(!response.ok||result?.success!==true)throw Error(typeof result?.message==='string'?result.message:'Ative o SQL e a função astros-import-clients antes de importar.');
 if(!['completed','skipped','excluded'].includes(result.state))throw Error('Resposta não confirmada. Repita com o mesmo arquivo.');
 return {success:true as const,state:result.state as 'completed'|'skipped'|'excluded',repeated:result.repeated===true};
}
