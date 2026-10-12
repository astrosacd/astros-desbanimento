import { getCookie, setResponseHeader } from '@tanstack/react-start/server';
import { z } from 'zod';
import { requireAdmin, request } from '../admin/auth.server';
import { historySchema } from './history-validation';
const profileSchema=z.object({nome:z.string().nullable(),email:z.string().nullable()});
const rowSchema=z.object({id:z.string().uuid(),amount_cents:z.number().int(),method:z.enum(['pix','card']),status:z.string(),mp_payment_id:z.string().nullable(),created_at:z.string(),updated_at:z.string(),live_mode:z.boolean(),painel_de_desbanimento:profileSchema});
export async function paymentHistory(input:unknown){
 await requireAdmin();
 setResponseHeader('Cache-Control','private, no-store');
 const filters=historySchema.parse(input);const params=new URLSearchParams({select:'id,amount_cents,method,status,mp_payment_id,created_at,updated_at,live_mode,painel_de_desbanimento!inner(nome,email)',order:'created_at.desc,id.desc',limit:'25',offset:String((filters.page-1)*25)});
 if(filters.email)params.set('painel_de_desbanimento.email',`ilike.*${filters.email}*`);
 if(filters.status!=='all')params.set('status',`eq.${filters.status}`);
 if(filters.method!=='all')params.set('method',`eq.${filters.method}`);
 const dates:string[]=[];
 if(filters.from)dates.push(`created_at.gte.${new Date(`${filters.from}T00:00:00-03:00`).toISOString()}`);
 if(filters.until)dates.push(`created_at.lte.${new Date(`${filters.until}T23:59:59.999-03:00`).toISOString()}`);
 if(dates.length)params.set('and',`(${dates.join(',')})`);
 const response=await request(`/rest/v1/astros_payment_orders?${params}`,getCookie('astros_admin_session'),{headers:{Prefer:'count=exact'}});
 if(!response.ok)throw new Error('Não foi possível consultar o histórico de pagamentos. Tente atualizar.');
 const rows=z.array(rowSchema).parse(await response.json());
 const total=Number(response.headers.get('content-range')?.split('/')[1]);
 if(!Number.isSafeInteger(total)||total<0)throw new Error('Não foi possível consultar o total do histórico.');
 return {page:filters.page,total,pageSize:25,rows:rows.map(({painel_de_desbanimento,...row})=>({...row,name:painel_de_desbanimento.nome||'Cliente',email:painel_de_desbanimento.email||'E-mail não disponível'}))};
}
