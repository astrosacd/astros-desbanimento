import {getCookie,setResponseHeader} from '@tanstack/react-start/server';
import {requireAdmin} from '../admin/auth.server';
export async function smsCall(action:string,data:unknown={},admin=false){
 setResponseHeader('Cache-Control','private, no-store');
 if(admin)await requireAdmin();
 const token=getCookie(admin?'astros_admin_session':'astros_client_session');
 if(!token)throw Error('Entre novamente para continuar.');
 const r=await fetch('https://tevljvidqbvrcgzqypwf.supabase.co/functions/v1/astros-sms',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,apikey:'sb_publishable_wvwHQDOVefSPivb227u1Iw_lH5qEM_j'},body:JSON.stringify({action,data}),signal:AbortSignal.timeout(60000)});
 const v=await r.json().catch(()=>null);
 if(!r.ok||!v)throw Error(typeof v?.error==='string'?v.error:'O serviço de SMS ainda não está disponível. Tente atualizar.');return v;
}
