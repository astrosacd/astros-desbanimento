import { getCookie, setResponseHeader } from '@tanstack/react-start/server';
import { requireAdmin, request } from '../admin/auth.server';
const base = 'https://tevljvidqbvrcgzqypwf.supabase.co';
async function edge(action: string, token: string, data: unknown = {}) {
 setResponseHeader('Cache-Control','private, no-store');
 const r = await fetch(`${base}/functions/v1/astros-payments`, { method: 'POST', headers: { 'Content-Type':'application/json', Authorization: `Bearer ${token}`, apikey:'sb_publishable_wvwHQDOVefSPivb227u1Iw_lH5qEM_j' }, body:JSON.stringify({ action, data }), signal:AbortSignal.timeout(40000) });
 const result = await r.json().catch(() => ({}));
 if (!r.ok) throw new Error(result.error || 'O serviço de pagamento ainda não está disponível.');
 return result;
}
export async function clientCall(action: string, data: unknown) {
 const token = getCookie('astros_client_session');
 if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
 return edge(action, token, data);
}
export async function adminCall(action: string, data?: unknown) {
 await requireAdmin();
 return edge(action, getCookie('astros_admin_session')!, data);
}
export async function wallet() {
 setResponseHeader('Cache-Control','private, no-store');
 const token=getCookie('astros_client_session');
 if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
 const auth=await request('/auth/v1/user',token);
 if (!auth.ok) throw new Error('Sua sessão expirou. Entre novamente.');
 const user=await auth.json();
 if (!user.id) throw new Error('Conta não encontrada.');
 const p=await request(`/rest/v1/painel_de_desbanimento?id=eq.${encodeURIComponent(user.id)}&select=recarga&limit=1`,token);
 if (!p.ok) throw new Error('Não foi possível consultar o saldo.');
 const rows=await p.json();
 if (!rows[0] || !Number.isFinite(Number(rows[0].recarga ?? 0))) throw new Error('Não foi possível consultar o saldo.');
 let movements: Array<{id:string;amount_cents:number;kind:string;reference?:string;created_at:string}> = [];
 const m=await request(`/rest/v1/astros_wallet_movements?user_id=eq.${encodeURIComponent(user.id)}&select=id,amount_cents,kind,reference,created_at&order=created_at.desc&limit=30`,token);
 if (m.ok) movements=await m.json();
 let ordersResponse=await request(`/rest/v1/astros_payment_orders?user_id=eq.${encodeURIComponent(user.id)}&select=id,method,status,amount_cents,qr_code,qr_base64,checkout_url,card_mode,created_at&order=created_at.desc&limit=20`,token);
 if(ordersResponse.status===400)ordersResponse=await request(`/rest/v1/astros_payment_orders?user_id=eq.${encodeURIComponent(user.id)}&select=id,method,status,amount_cents,qr_code,qr_base64,checkout_url,created_at&order=created_at.desc&limit=20`,token);
 const orders: Array<{id:string;method:string;status:string;amount_cents:number;qr_code:string|null;qr_base64:string|null;checkout_url:string|null;card_mode?:string;created_at:string}>=ordersResponse.ok?await ordersResponse.json():[];
 return { orders, balanceCents:Math.round(Number(rows[0].recarga ?? 0)*100), movements };
}

export async function prices() {
 setResponseHeader('Cache-Control','private, no-store');
 const token=getCookie('astros_client_session');
 if(!token)throw new Error('Sua sessão expirou. Entre novamente.');
 const r=await request('/rest/v1/rpc/astros_payment_prices',token,{method:'POST',body:'{}'});
 if(!r.ok)throw new Error('Não foi possível consultar os valores do serviço.');
 const data=await r.json();
 if(!data||!Number.isSafeInteger(data.servicePriceCents)||typeof data.minimumEnabled!=='boolean'||!Number.isSafeInteger(data.minimumRechargeCents))throw new Error('Os valores do serviço ainda não estão disponíveis.');
 return data as {servicePriceCents:number;minimumEnabled:boolean;minimumRechargeCents:number};
}
export async function adminPrices(){await requireAdmin();return readAdminPrices();}
async function readAdminPrices(){
 setResponseHeader('Cache-Control','private, no-store');
 const r=await request('/rest/v1/rpc/astros_payment_prices',getCookie('astros_admin_session'),{method:'POST',body:'{}'});
 if(!r.ok)throw new Error('Execute o SQL complementar de valores e avisos no Supabase.');
 const data=await r.json();return (await import('./validation')).pricesSchema.parse(data);
}
export async function savePrices(input:unknown){
 await requireAdmin();setResponseHeader('Cache-Control','private, no-store');
 const data=(await import('./validation')).pricesSchema.parse(input);
 const r=await request('/rest/v1/rpc/astros_save_prices',getCookie('astros_admin_session'),{method:'POST',body:JSON.stringify({price_cents:data.servicePriceCents,minimum_on:data.minimumEnabled,minimum_cents:data.minimumRechargeCents})});
 if(!r.ok)throw new Error('Não foi possível salvar os valores. Execute o SQL complementar de valores e avisos.');
 const saved=(await import('./validation')).pricesSchema.parse(await r.json());
 if(saved.servicePriceCents!==data.servicePriceCents||saved.minimumEnabled!==data.minimumEnabled||saved.minimumRechargeCents!==data.minimumRechargeCents)throw new Error('Os valores não foram confirmados. Atualize e tente novamente.');
 return saved;
}
