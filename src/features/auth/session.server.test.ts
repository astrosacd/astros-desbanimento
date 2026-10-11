import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { signupSchema } from './validation';
const server = vi.hoisted(() => ({ getCookie: vi.fn(), setCookie: vi.fn(), deleteCookie: vi.fn(), getRequestUrl: () => new URL('https://astros.example/login'), setResponseHeader: vi.fn() }));
const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@tanstack/react-start/server', () => server);
vi.mock('../admin/auth.server', () => api);
import { signup, currentClient, reset, recover, login, logout } from './session.server';
const response = (data: unknown, ok = true, status = 200) => ({ ok, status, json: async () => data });
beforeEach(() => { vi.resetAllMocks(); });
afterEach(() => vi.restoreAllMocks());
describe('client entrance', () => {
 it('normalizes WhatsApp and rejects incomplete names', () => {
  const valid = signupSchema.parse({ name: 'Maria Costa', email: 'maria@example.com', whatsapp: '(85) 99999-9999', password: '12345678' });
  expect(valid.whatsapp).toBe('5585999999999');
  expect(signupSchema.safeParse({ ...valid, name: 'Maria' }).success).toBe(false);
  expect(signupSchema.safeParse({ ...valid, whatsapp: '123' }).success).toBe(false);
 });
 it('sends only the requested profile fields and never a role or plaintext profile password', async () => {
  api.request.mockResolvedValueOnce(response({ user: { id: 'uuid' } }));
  expect(await signup({ name: 'Maria Costa', email: 'maria@example.com', whatsapp: '5585999999999', password: '12345678' })).toEqual({ signedIn: false });
  const payload = JSON.parse(api.request.mock.calls[0]![2].body);
  expect(payload.data).toEqual({ nome: 'Maria Costa', whatsapp: '5585999999999' });
  expect(server.setCookie).not.toHaveBeenCalled();
 });
 it('never replaces an existing account on duplicate signup', async () => {
  api.request.mockResolvedValueOnce(response({ code: 'user_already_exists' }, false, 422));
  await expect(signup({ name: 'Maria Costa', email: 'maria@example.com', whatsapp: '5585999999999', password: '12345678' })).rejects.toThrow('já possui cadastro');
  expect(api.request).toHaveBeenCalledTimes(1); expect(server.setCookie).not.toHaveBeenCalled();
 });
 it('rejects invalid recovery tokens before changing a password', async () => {
  api.request.mockResolvedValueOnce(response({}, false, 401));
  await expect(reset({ token: 'invalid', password: '12345678' })).rejects.toThrow('expirou');
  expect(api.request).toHaveBeenCalledTimes(1);
 });
 it('recovery uses a trusted same-origin return address', async () => {
  api.request.mockResolvedValueOnce(response({}));
  await recover('maria@example.com');
  expect(api.request.mock.calls[0]![0]).toContain(encodeURIComponent('https://astros.example/reset-password'));
 });
 it('verifies sessions with Auth and fails closed when offline', async () => {
  server.getCookie.mockReturnValue('token'); api.request.mockRejectedValueOnce(new Error('offline'));
  expect(await currentClient()).toBeNull();
 });
 it('stores only a protected token and clears it on logout', async () => {
  api.request.mockResolvedValueOnce(response({ access_token: 'token', expires_in: 7200 }));
  await login({ email: 'maria@example.com', password: '12345678' });
  expect(server.setCookie).toHaveBeenCalledWith('astros_client_session', 'token', expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict', maxAge: 3600 }));
  server.getCookie.mockReturnValue('token'); api.request.mockResolvedValueOnce(response({}));
  await logout(); expect(server.deleteCookie).toHaveBeenCalledWith('astros_client_session', { path: '/' });
 });
});
