import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../admin/auth.server', () => api);
vi.mock('@tanstack/react-start/server', () => ({ getCookie: () => 'token', setResponseHeader: vi.fn() }));
import { updateProfile } from './profile.server';
const r = (data: unknown, ok = true) => ({ ok, json: async () => data });
beforeEach(() => vi.resetAllMocks());
describe('own profile', () => {
 it('rejects email and identity overrides before any request', async () => {
  await expect(updateProfile({ name: 'Maria Costa', email: 'other@example.com', id: 'other' })).rejects.toThrow();
  expect(api.request).not.toHaveBeenCalled();
 });
 it('keeps the password when blank and saves only the name via authenticated RPC', async () => {
  api.request.mockResolvedValueOnce(r({ id: 'own', email: 'maria@example.com' })).mockResolvedValueOnce(r({}));
  await updateProfile({ name: 'Maria Costa', newPassword: '' });
  expect(api.request).toHaveBeenCalledTimes(2);
  expect(JSON.parse(api.request.mock.calls[1][2].body)).toEqual({ new_name: 'Maria Costa' });
 });
 it('stops on incorrect current password before changing any data', async () => {
  api.request.mockResolvedValueOnce(r({ id: 'own', email: 'maria@example.com' })).mockResolvedValueOnce(r({}, false));
  await expect(updateProfile({ name: 'Maria Costa', currentPassword: 'wrong', newPassword: 'newpassword' })).rejects.toThrow('senha atual');
  expect(api.request).toHaveBeenCalledTimes(2);
 });
 it('requires a verified session before saving', async () => {
  api.request.mockResolvedValueOnce(r({}, false));
  await expect(updateProfile({ name: 'Maria Costa' })).rejects.toThrow('expirou');
  expect(api.request).toHaveBeenCalledTimes(1);
 });
 it('updates password only after verifying the same account and saving the name', async () => {
  api.request.mockResolvedValueOnce(r({ id: 'own', email: 'maria@example.com' })).mockResolvedValueOnce(r({ user: { id: 'own' } })).mockResolvedValueOnce(r({})).mockResolvedValueOnce(r({}));
  await updateProfile({ name: 'Maria Costa', currentPassword: 'oldpassword', newPassword: 'newpassword' });
  expect(JSON.parse(api.request.mock.calls[3][2].body)).toEqual({ password: 'newpassword' });
 });
});
