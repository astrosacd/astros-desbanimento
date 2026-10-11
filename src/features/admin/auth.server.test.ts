import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const cookies = vi.hoisted(() => ({ getCookie: vi.fn(), setCookie: vi.fn(), deleteCookie: vi.fn(), setResponseHeader: vi.fn(), getRequestUrl: () => new URL('https://example.com/admin') }));
vi.mock('@tanstack/react-start/server', () => cookies);
import { getSession, signIn, requireAdmin } from './auth.server';
const fetchMock = vi.fn();
function respond(value: unknown, ok = true) { return { ok, json: async () => value }; }
beforeEach(() => {
 vi.clearAllMocks(); vi.stubGlobal('fetch', fetchMock);
 vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co'); vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'public-test-key');
 cookies.getCookie.mockReturnValue('token');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('admin authorization', () => {
 it('fails closed without configuration', async () => {
  vi.stubEnv('SUPABASE_URL', ''); expect(await getSession()).toEqual({ configured: false, admin: null }); expect(fetchMock).not.toHaveBeenCalled();
 });
 it('refuses a client even with a valid Auth password', async () => {
  fetchMock.mockResolvedValueOnce(respond({ access_token: 'token' })).mockResolvedValueOnce(respond({ id: 'uuid' })).mockResolvedValueOnce(respond([{ id: 'uuid', tipo_usuario: 'cliente' }])).mockResolvedValueOnce(respond({}));
  await expect(signIn('client@example.com', 'password')).rejects.toThrow('Acesso não autorizado'); expect(cookies.setCookie).not.toHaveBeenCalled();
 });
 it('sets a protected cookie only after verifying the matching admin UUID', async () => {
  fetchMock.mockResolvedValueOnce(respond({ access_token: 'token', expires_in: 7200 })).mockResolvedValueOnce(respond({ id: 'uuid', email: 'admin@example.com' })).mockResolvedValueOnce(respond([{ id: 'uuid', tipo_usuario: 'admin', nome: 'Admin' }]));
  expect((await signIn('admin@example.com', 'password')).id).toBe('uuid');
  expect(cookies.setCookie).toHaveBeenCalledWith('astros_admin_session', 'token', expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict', maxAge: 3600 }));
 });
 it('blocks a revoked admin on the next server request', async () => {
  fetchMock.mockResolvedValueOnce(respond({ id: 'uuid' })).mockResolvedValueOnce(respond([{ id: 'uuid', tipo_usuario: 'cliente' }]));
  await expect(requireAdmin()).rejects.toThrow('não autorizado');
 });
 it('rejects an unrelated profile or failed verification', async () => {
  fetchMock.mockResolvedValueOnce(respond({ id: 'uuid' })).mockResolvedValueOnce(respond([{ id: 'other', tipo_usuario: 'admin' }]));
  expect((await getSession()).admin).toBeNull();
  fetchMock.mockRejectedValueOnce(new Error('offline')); expect((await getSession()).admin).toBeNull();
 });
});
