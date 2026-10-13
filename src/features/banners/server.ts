import {getCookie,setResponseHeader} from '@tanstack/react-start/server';
import {requireAdmin,request} from '../admin/auth.server';
import {bannerSchema,bannerVisible} from './validation';
export async function readBanner(admin=false){
 if(admin)await requireAdmin();
 setResponseHeader('Cache-Control','private, no-store');
 const session=getCookie(admin?'astros_admin_session':'astros_client_session');
 if(!session)throw Error('Entre novamente para continuar.');
 const r=await request('/rest/v1/astros_overview_banner?select=message,enabled,starts_at,ends_at&id=eq.true&limit=1',session);
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
 const r=await request('/rest/v1/astros_overview_banner?id=eq.true',getCookie('astros_admin_session'),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({message:data.message,enabled:data.enabled,starts_at:data.startsAt,ends_at:data.endsAt,updated_at:new Date().toISOString()})});
 if(!r.ok)throw Error('Não foi possível salvar a faixa. Execute o SQL da faixa informativa.');
 const rows=await r.json();if(rows.length!==1)throw Error('A faixa não foi salva. Confira o SQL.');return {success:true};
}
