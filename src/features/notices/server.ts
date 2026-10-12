import { getCookie, setResponseHeader } from '@tanstack/react-start/server';
import { requireAdmin, request } from '../admin/auth.server';
import { noticeSchema, uploadSchema, noticeListSchema, noticeStatusSchema } from './validation';
export type Notice={id:string;title:string;body:string;buttonLabel:string;buttonUrl:string;enabled:boolean;imageUrl:string;version:string;status:'draft'|'published'|'archived';publishedAt:string|null;createdAt:string};
const select='id,title,body,button_label,button_url,image_url,status,version,published_at,created_at';
function map(row:any):Notice{return {id:row.id,title:row.title,body:row.body,buttonLabel:row.button_label,buttonUrl:row.button_url,imageUrl:row.image_url||'',enabled:row.status==='published',status:row.status,version:row.version,publishedAt:row.published_at,createdAt:row.created_at};}
async function token(admin:boolean){if(admin)await requireAdmin();setResponseHeader('Cache-Control','private, no-store');const value=getCookie(admin?'astros_admin_session':'astros_client_session');if(!value)throw new Error('Entre novamente para continuar.');return value;}
export async function readNotice(admin=false):Promise<Notice|null>{
 const session=await token(admin);
 const r=await request(`/rest/v1/astros_notices?select=${select}&status=eq.published&order=published_at.desc,id.desc&limit=1`,session);
 if(!r.ok)throw new Error('Não foi possível consultar os comunicados. Execute o SQL de histórico.');const rows=await r.json();return rows[0]?map(rows[0]):null;
}
export async function listNotices(input:unknown,admin=false){
 const session=await token(admin);const {page}=noticeListSchema.parse(input);
 const r=await request(`/rest/v1/astros_notices?select=${select}&order=${admin?'created_at.desc':'published_at.desc'},id.desc&limit=20&offset=${(page-1)*20}${admin?'':'&status=eq.published'}`,session,{headers:{Prefer:'count=exact'}});
 if(!r.ok)throw new Error('Não foi possível consultar o histórico de comunicados. Execute o SQL de histórico.');
 const rows=await r.json();const total=Number(r.headers.get('content-range')?.split('/')[1]);if(!Number.isSafeInteger(total)||total<0)throw new Error('Não foi possível consultar o total de comunicados.');
 return {rows:rows.map(map) as Notice[],total,page,pageSize:20};
}
export async function saveNotice(input:unknown){
 const session=await token(true);const data=noticeSchema.parse(input);const version=crypto.randomUUID();const id=data.id||crypto.randomUUID();
 let publishedAt:string|null=data.enabled?new Date().toISOString():null;
 if(data.id){const previous=await request(`/rest/v1/astros_notices?id=eq.${data.id}&select=status,published_at`,session);if(!previous.ok)throw new Error('Não foi possível consultar o comunicado.');const rows=await previous.json();if(!rows[0])throw new Error('Comunicado não encontrado.');if(data.enabled&&rows[0].status==='published')publishedAt=rows[0].published_at;}
 const payload={title:data.title,body:data.body,button_label:data.buttonLabel,button_url:data.buttonUrl,image_url:data.imageUrl,status:data.enabled?'published':'draft',version,published_at:publishedAt,updated_at:new Date().toISOString()};
 const r=await request(`/rest/v1/astros_notices${data.id?`?id=eq.${id}`:''}`,session,{method:data.id?'PATCH':'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({...(!data.id?{id}:{}),...payload})});
 if(!r.ok)throw new Error('Não foi possível salvar o comunicado. Confira se o SQL de histórico foi executado.');const rows=await r.json();if(rows.length!==1)throw new Error('O comunicado não foi salvo.');return {id,version};
}
export async function changeNoticeStatus(input:unknown){
 const session=await token(true);const data=noticeStatusSchema.parse(input);
 const r=await request(`/rest/v1/astros_notices?id=eq.${data.id}`,session,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:data.status,version:crypto.randomUUID(),...(data.status==='published'?{published_at:new Date().toISOString()}:{}),updated_at:new Date().toISOString()})});
 if(!r.ok)throw new Error('Não foi possível alterar o comunicado.');const rows=await r.json();if(rows.length!==1)throw new Error('Comunicado não encontrado.');return {success:true};
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
