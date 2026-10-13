import {getCookie,setResponseHeader} from '@tanstack/react-start/server';
import {requireAdmin,request} from '../admin/auth.server';
import {bannerSchema,bannerVisible} from './validation';
export async function readBanner(admin=false){
 if(admin)await requireAdmin();
 setResponseHeader('Cache-Control','private, no-store');
 const session=getCookie(admin?'astros_admin_session':'astros_client_session');
 if(!session)throw Error('Entre novamente para continuar.');
 const filter=admin?'':`&enabled=eq.true&starts_at=lte.${encodeURIComponent(new Date().toISOString())}&ends_at=gt.${encodeURIComponent(new Date().toISOString())}`;
 const r=await request(`/rest/v1/astros_overview_banners?select=message,enabled,starts_at,ends_at&order=created_at.desc,id.desc&limit=1${filter}`,session);
 if(!r.ok)throw Error('Não foi possível consultar a faixa. Execute o SQL da faixa informativa.');
 const rows=await r.json();const now=Date.now();
 if(!rows.length)return {banner:null,serverNow:now};
 const banner=bannerSchema.parse({message:rows[0].message,enabled:rows[0].enabled,startsAt:rows[0].starts_at,endsAt:rows[0].ends_at});
 return {banner:admin||bannerVisible(banner,now)?banner:null,serverNow:now};
}
export async function saveBanner(input:unknown){
 await requireAdmin();setResponseHeader('Cache-Control','private, no-store');
 const data=bannerSchema.parse(input);
 if(data.enabled&&Date.parse(data.endsAt)<=Date.now())throw Error('Escolha um término no futuro antes de ativar.');
 const r=await request(`/rest/v1/astros_overview_banners${data.id?`?id=eq.${data.id}`:''}`,getCookie('astros_admin_session'),{method:data.id?'PATCH':'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({message:data.message,enabled:data.enabled,starts_at:data.startsAt,ends_at:data.endsAt,updated_at:new Date().toISOString()})});
 if(!r.ok)throw Error('Não foi possível salvar a faixa. Execute o SQL da faixa informativa.');
 const rows=await r.json();if(rows.length!==1)throw Error('A faixa não foi salva. Confira o SQL.');return {success:true};
}

export async function listBanners(page:number){
 await requireAdmin();setResponseHeader('Cache-Control','private, no-store');
 const r=await request(`/rest/v1/astros_overview_banners?select=id,message,enabled,starts_at,ends_at,created_at&order=created_at.desc,id.desc&limit=26&offset=${(page-1)*25}`,getCookie('astros_admin_session'));
 if(!r.ok)throw Error('Não foi possível consultar o histórico. Execute o SQL do histórico de faixas.');
 const rows=await r.json();return {rows:rows.slice(0,25).map((row:any)=>({...bannerSchema.parse({id:row.id,message:row.message,enabled:row.enabled,startsAt:row.starts_at,endsAt:row.ends_at}),createdAt:row.created_at})),hasMore:rows.length>25};
}
export async function deleteBanner(id:string){
 await requireAdmin();setResponseHeader('Cache-Control','private, no-store');
 const r=await request(`/rest/v1/astros_overview_banners?id=eq.${id}`,getCookie('astros_admin_session'),{method:'DELETE',headers:{Prefer:'return=representation'}});
 if(!r.ok||(await r.json()).length!==1)throw Error('Não foi possível excluir a faixa.');return {success:true};
}
