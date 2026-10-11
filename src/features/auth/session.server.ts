import { getCookie, setCookie, deleteCookie, getRequestUrl, setResponseHeader } from '@tanstack/react-start/server';
import { request } from '../admin/auth.server';
import { customMail, customMailEnabled } from './custom-mail.server';
const COOKIE = 'astros_client_session';
export type ClientIdentity = { id: string; email: string; name: string };
function noCache() { setResponseHeader('Cache-Control', 'private, no-store'); }
export async function currentClient(): Promise<ClientIdentity | null> {
 noCache(); const token = getCookie(COOKIE); if (!token) return null;
 try {
  const r = await request('/auth/v1/user', token); if (!r.ok) return null;
  const u = await r.json(); if (!u.id) return null;
  return { id: u.id, email: u.email || '', name: u.user_metadata?.nome || 'Cliente' };
 } catch { return null; }
}
function remember(token: string, expires: number) {
 setCookie(COOKIE, token, { httpOnly: true, secure: getRequestUrl().protocol === 'https:', sameSite: 'strict', path: '/', maxAge: Math.min(expires || 3600, 3600) });
}
const origin = () => getRequestUrl().origin;
export async function login(data: { email: string; password: string }) {
 noCache(); deleteCookie(COOKIE, { path: '/' });
 const r = await request('/auth/v1/token?grant_type=password', undefined, { method: 'POST', body: JSON.stringify(data) });
 if (!r.ok) throw new Error('Não foi possível entrar. Confira e-mail e senha. Se ainda não tem conta, crie seu cadastro; se já cadastrou, confirme seu e-mail.');
 const s = await r.json(); if (!s.access_token) throw new Error('Não foi possível iniciar a sessão.');
 remember(s.access_token, s.expires_in); return { success: true };
}
export async function signup(data: { name: string; email: string; whatsapp: string; password: string }) {
 noCache();
 if (customMailEnabled()) { await customMail({ type: 'signup', ...data }); return { signedIn: false }; }
 const r = await request(`/auth/v1/signup?redirect_to=${encodeURIComponent(origin() + '/login')}`, undefined, { method: 'POST', body: JSON.stringify({ email: data.email, password: data.password, data: { nome: data.name, whatsapp: data.whatsapp } }) });
 if (!r.ok) {
  const e = await r.json().catch(() => ({}));
  if (r.status === 429) throw new Error('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  if (e.code === 'user_already_exists') throw new Error('Esse e-mail já possui cadastro. Entre ou recupere sua senha.');
  throw new Error('Não foi possível concluir o cadastro. Tente novamente. Se já possui conta, entre ou recupere sua senha.');
 }
 const s = await r.json();
 // A duplicate signup never changes an existing account or signs it in.
 if (s.access_token) { remember(s.access_token, s.expires_in); return { signedIn: true }; }
 return { signedIn: false };
}
export async function recover(email: string) {
 noCache();
 if (customMailEnabled()) return customMail({ type: 'recovery', email });
 const r = await request(`/auth/v1/recover?redirect_to=${encodeURIComponent(origin() + '/reset-password')}`, undefined, { method: 'POST', body: JSON.stringify({ email }) });
 if (!r.ok) throw new Error('Não foi possível solicitar a recuperação agora. Aguarde alguns minutos e tente novamente.');
 return { success: true };
}
export async function reset(data: { token: string; password: string }) {
 noCache();
 const verified = await request('/auth/v1/user', data.token);
 if (!verified.ok) throw new Error('O link expirou ou é inválido. Solicite uma nova recuperação.');
 const r = await request('/auth/v1/user', data.token, { method: 'PUT', body: JSON.stringify({ password: data.password }) });
 if (!r.ok) throw new Error('Não foi possível alterar a senha. Verifique os requisitos ou solicite outro link.');
 deleteCookie(COOKIE, { path: '/' });
 await request('/auth/v1/logout?scope=global', data.token, { method: 'POST' }).catch(() => undefined);
 return { success: true };
}
export async function logout() {
 noCache(); const token = getCookie(COOKIE); deleteCookie(COOKIE, { path: '/' });
 if (token) await request('/auth/v1/logout', token, { method: 'POST' }).catch(() => undefined);
 return { success: true };
}
