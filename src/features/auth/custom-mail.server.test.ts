import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { customMail, customMailEnabled } from './custom-mail.server';
const api = vi.fn();
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', api); vi.stubEnv('ASTROS_CUSTOM_EMAIL_ENABLED', 'true'); vi.stubEnv('ASTROS_EMAIL_INTERNAL_SECRET', 'a'.repeat(48)); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('is activated only by an explicit server flag', () => { expect(customMailEnabled()).toBe(true); vi.stubEnv('ASTROS_CUSTOM_EMAIL_ENABLED', ''); expect(customMailEnabled()).toBe(false); });
it('fails closed before any external request without an internal secret', async () => { vi.stubEnv('ASTROS_EMAIL_INTERNAL_SECRET', ''); await expect(customMail({ type: 'recovery', email: 'client@example.com' })).rejects.toThrow('configurado'); expect(api).not.toHaveBeenCalled(); });
it('never returns generated links or provider credentials to the browser', async () => {
 api.mockResolvedValueOnce({ ok: true, json: async () => ({ action_link: 'private-link', access_token: 'private-token' }) });
 expect(await customMail({ type: 'recovery', email: 'client@example.com' })).toEqual({ success: true });
});
it('does not leak upstream errors or retry through the shared mail provider', async () => {
 api.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ message: 'credential detail' }) });
 await expect(customMail({ type: 'recovery', email: 'client@example.com' })).rejects.toThrow('concluir o envio'); expect(api).toHaveBeenCalledTimes(1);
});
