import { getCookie, setResponseHeader } from '@tanstack/react-start/server';
import { requireAdmin, request } from '../admin/auth.server';
import { noticeSchema, uploadSchema } from './validation';
export type Notice={title:string;body:string;buttonLabel:string;buttonUrl:string;enabled:boolean;imageUrl:string;version:string};
export async function readNotice(admin=false):Promise<Notice|null>{
 if(admin)await requireAdmin();
 setResponseHeader('Cache-Control','private, no-store');
 const token=getCookie(admin?'astros_admin_session':'astros_client_session');if(!token)throw new Error('Entre novamente para continuar.');
 const r=await request('/rest/v1/astros_client_notice?select=title,body,button_label,button_url,enabled,image_url,version&limit=1'+(admin?'':'&enabled=eq.true'),token);
 if(!r.ok)throw new Error('Não foi possível consultar o aviso. Execute o SQL de avisos no Supabase.');
 const rows=await r.json();const row=rows[0];if(!row)return null;
 return {title:row.title,body:row.body,buttonLabel:row.button_label,buttonUrl:row.button_url,enabled:row.enabled,imageUrl:row.image_url||'',version:row.version};
}
export async function saveNotice(input:unknown){
 await requireAdmin();setResponseHeader('Cache-Control','private, no-store');const data=noticeSchema.parse(input);
 const version=crypto.randomUUID();
 const r=await request('/rest/v1/astros_client_notice?id=eq.true',getCookie('astros_admin_session'),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({title:data.title,body:data.body,button_label:data.buttonLabel,button_url:data.buttonUrl,enabled:data.enabled,image_url:data.imageUrl,version,updated_at:new Date().toISOString()})});
 if(!r.ok)throw new Error('Não foi possível salvar o aviso. Confira se o SQL foi executado.');
 const rows=await r.json();if(rows.length!==1)throw new Error('O aviso não foi salvo. Execute o SQL de avisos.');return {version};
}

export async function uploadNoticeImage(input:unknown){
 const admin=await requireAdmin();setResponseHeader('Cache-Control','private, no-store');const data=uploadSchema.parse(input);
 const bytes=Uint8Array.from(atob(data.base64),c=>c.charCodeAt(0));
 if(bytes.length>2097152)throw new Error('A imagem deve ter até 2 MB.');
 const png=[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
 const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
 if(!(data.mime==='image/png'&&png||data.mime==='image/jpeg'&&jpg||data.mime==='image/webp'&&webp))throw new Error('Use uma imagem PNG, JPG ou WebP válida.');
 const path=`${admin.id}/${crypto.randomUUID()}.${data.mime==='image/png'?'png':data.mime==='image/jpeg'?'jpg':'webp'}`;
 const r=await request(`/storage/v1/object/astros-notices/${path}`,getCookie('astros_admin_session'),{method:'POST',headers:{'Content-Type':data.mime,'x-upsert':'false'},body:bytes.buffer});
 if(!r.ok)throw new Error('Não foi possível enviar a imagem. Confira se o SQL de imagens foi executado.');
 return {url:`https://tevljvidqbvrcgzqypwf.supabase.co/storage/v1/object/public/astros-notices/${path}`};
}
