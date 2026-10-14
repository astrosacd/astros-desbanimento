import {getCookie,setResponseHeader} from '@tanstack/react-start/server';
import {requireAdmin,request} from '../admin/auth.server';
import {panelOrigin} from './validation';
export async function readAddress(){
 setResponseHeader('Cache-Control','private, no-store');await requireAdmin();
 const r=await request('/rest/v1/astros_panel_address?id=eq.true&select=origin,updated_at&limit=1',getCookie('astros_admin_session'));
 if(!r.ok)throw Error('A configuração do endereço ainda não está disponível. Execute o SQL de instalação.');
 const rows=await r.json();if(!rows[0])throw Error('Endereço principal não configurado.');
 return {origin:panelOrigin(rows[0].origin),updatedAt:rows[0].updated_at as string};
}
export async function saveAddress(input:{origin:string}){
 setResponseHeader('Cache-Control','private, no-store');await requireAdmin();
 const origin=panelOrigin(input.origin);
 const r=await request('/rest/v1/rpc/astros_set_panel_address',getCookie('astros_admin_session'),{method:'POST',body:JSON.stringify({new_origin:origin})});
 if(!r.ok)throw Error('Não foi possível salvar o endereço principal.');
 const saved=await r.json();if(panelOrigin(saved)!==origin)throw Error('Não foi possível confirmar o endereço salvo.');
 return {origin};
}
