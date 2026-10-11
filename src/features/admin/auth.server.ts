import { getCookie, setCookie, deleteCookie, getRequestUrl, setResponseHeader } from '@tanstack/react-start/server';

const COOKIE = 'astros_admin_session';
export type AdminIdentity = { id: string; name: string; email: string };
export type AdminSession = { configured: boolean; admin: AdminIdentity | null; error?: string };
function config() {
  // Public project identifiers; server environment values can override this connection.
  const url = (process.env.SUPABASE_URL ?? 'https://tevljvidqbvrcgzqypwf.supabase.co').replace(/\/$/, '');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_wvwHQDOVefSPivb227u1Iw_lH5qEM_j';
  if (!url || !key) return null;
  if (!url.startsWith('https://')) throw new Error('Conexão administrativa indisponível.');
  return { url, key };
}
function noCache() { setResponseHeader('Cache-Control', 'private, no-store'); }
async function request(path: string, token?: string, init: RequestInit = {}) {
  const c = config();
  if (!c) throw new Error('O acesso administrativo ainda não foi conectado ao Supabase.');
  return fetch(`${c.url}${path}`, { ...init, headers: { apikey: c.key, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...init.headers }, cache: 'no-store', signal: AbortSignal.timeout(12000) });
}
export async function identityForToken(token: string): Promise<AdminIdentity | null> {
  const userResponse = await request('/auth/v1/user', token);
  if (!userResponse.ok) return null;
  const user = await userResponse.json() as { id?: string; email?: string };
  if (!user.id) return null;
  // The authenticated UUID, never an email or a browser-supplied role, selects the profile.
  const response = await request(`/rest/v1/painel_de_desbanimento?id=eq.${encodeURIComponent(user.id)}&select=id,tipo_usuario,nome&limit=1`, token);
  if (!response.ok) throw new Error('Não foi possível verificar a permissão administrativa.');
  const profiles = await response.json() as Array<{ id: string; tipo_usuario: string; nome: string }>;
  const profile = profiles[0];
  if (!profile || profile.id !== user.id || profile.tipo_usuario !== 'admin') return null;
  return { id: user.id, email: user.email || '', name: profile.nome || 'Administrador' };
}
export async function getSession(): Promise<AdminSession> {
  noCache();
  if (!config()) return { configured: false, admin: null };
  const token = getCookie(COOKIE);
  if (!token) return { configured: true, admin: null };
  try { return { configured: true, admin: await identityForToken(token) }; }
  catch { return { configured: true, admin: null, error: 'Não foi possível verificar seu acesso. Tente novamente.' }; }
}
export async function signIn(email: string, password: string) {
  noCache();
  deleteCookie(COOKIE, { path: '/' });
  const response = await request('/auth/v1/token?grant_type=password', undefined, { method: 'POST', body: JSON.stringify({ email, password }) });
  if (!response.ok) throw new Error('Acesso não autorizado. Confira suas credenciais e sua permissão de administrador.');
  const session = await response.json() as { access_token?: string; expires_in?: number };
  if (!session.access_token) throw new Error('Não foi possível iniciar a sessão.');
  const admin = await identityForToken(session.access_token);
  if (!admin) {
    await request('/auth/v1/logout', session.access_token, { method: 'POST' }).catch(() => undefined);
    throw new Error('Acesso não autorizado. Confira suas credenciais e sua permissão de administrador.');
  }
  setCookie(COOKIE, session.access_token, { httpOnly: true, secure: getRequestUrl().protocol === 'https:', sameSite: 'strict', path: '/', maxAge: Math.min(session.expires_in || 3600, 3600) });
  return admin;
}
export async function signOut() {
  noCache(); const token = getCookie(COOKIE);
  deleteCookie(COOKIE, { path: '/' });
  if (token) await request('/auth/v1/logout', token, { method: 'POST' }).catch(() => undefined);
  return { success: true };
}
// Every future administrative data or mutation handler must call this on the server.
export async function requireAdmin() {
  const session = await getSession();
  if (!session.admin) throw new Error('Acesso administrativo não autorizado.');
  return session.admin;
}
