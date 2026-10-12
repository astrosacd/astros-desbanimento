import { getCookie, setResponseHeader } from '@tanstack/react-start/server';
import { requireAdmin, request } from '../admin/auth.server';
import { noticeSchema } from './validation';
export type Notice={title:string;body:string;buttonLabel:string;buttonUrl:string;enabled:boolean;version:string};
export async function readNotice(admin=false):Promise<Notice|null>{
 if(admin)await requireAdmin();
 setResponseHeader('Cache-Control','private, no-store');
 const token=getCookie(admin?'astros_admin_session':'astros_client_session');if(!token)throw new Error('Entre novamente para continuar.');
 const r=await request('/rest/v1/astros_client_notice?select=title,body,button_label,button_url,enabled,version&limit=1'+(admin?'':'&enabled=eq.true'),token);
 if(!r.ok)throw new Error('Não foi possível consultar o aviso. Execute o SQL de avisos no Supabase.');
 const rows=await r.json();const row=rows[0];if(!row)return null;
 return {title:row.title,body:row.body,buttonLabel:row.button_label,buttonUrl:row.button_url,enabled:row.enabled,version:row.version};
}
export async function saveNotice(input:unknown){
 await requireAdmin();setResponseHeader('Cache-Control','private, no-store');const data=noticeSchema.parse(input);
 const version=crypto.randomUUID();
 const r=await request('/rest/v1/astros_client_notice?id=eq.true',getCookie('astros_admin_session'),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({title:data.title,body:data.body,button_label:data.buttonLabel,button_url:data.buttonUrl,enabled:data.enabled,version,updated_at:new Date().toISOString()})});
 if(!r.ok)throw new Error('Não foi possível salvar o aviso. Confira se o SQL foi executado.');
 const rows=await r.json();if(rows.length!==1)throw new Error('O aviso não foi salvo. Execute o SQL de avisos.');return {version};
}
