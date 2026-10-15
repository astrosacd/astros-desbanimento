import {getCookie,setResponseHeader} from '@tanstack/react-start/server';
import {requireAdmin,request} from '../admin/auth.server';
import {financialFilter,financialReport} from './validation';
export async function financialDashboard(input:unknown){
 await requireAdmin();setResponseHeader('Cache-Control','private, no-store');
 const filters=financialFilter.parse(input);
 const response=await request('/rest/v1/rpc/astros_financial_dashboard',getCookie('astros_admin_session'),{method:'POST',body:JSON.stringify({date_from:filters.from,date_until:filters.until})});
 if(!response.ok){if(response.status===404)throw Error('Ative o dashboard executando o SQL financeiro no Supabase.');throw Error('Não foi possível consultar os indicadores financeiros. Tente atualizar.');}
 return financialReport.parse(await response.json());
}
