import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ request: vi.fn(), getCookie: vi.fn(), fetch: vi.fn() }));
vi.mock('../admin/auth.server', () => ({ request: mocks.request }));
vi.mock('@tanstack/react-start/server', () => ({ getCookie: mocks.getCookie, setResponseHeader: vi.fn() }));
import { listOwnNumbers } from './numbers.server';
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal('fetch', mocks.fetch); vi.stubEnv('BASEROW_API_TOKEN', 'private-token'); mocks.getCookie.mockReturnValue('session'); mocks.request.mockResolvedValue({ ok: true, json: async () => ({ id: 'own', email: 'Own@example.com', email_confirmed_at: '2026-01-01' }) }); });
describe('own numbers', () => {
 it('rejects caller-provided email', async () => { await expect(listOwnNumbers({ page: 1, email: 'other@example.com' })).rejects.toThrow(); expect(mocks.request).not.toHaveBeenCalled(); });
 it('requires a session before contacting the provider', async () => { mocks.getCookie.mockReturnValue(undefined); await expect(listOwnNumbers({ page: 1 })).rejects.toThrow('sessão'); expect(mocks.fetch).not.toHaveBeenCalled(); });
 it('requires confirmed email', async () => { mocks.request.mockResolvedValue({ ok: true, json: async () => ({ id: 'own', email: 'own@example.com' }) }); await expect(listOwnNumbers({ page: 1 })).rejects.toThrow('Confirme'); expect(mocks.fetch).not.toHaveBeenCalled(); });
 it('filters by verified email, preserves original dates and returns only safe fields', async () => { mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ count: 1, results: [{ id: 3, field_4773: 'own@example.com', field_4741: '859999 - ok', field_4827: '11/09/2025 15:41', field_4831: { value: 'DESBANIMENTO OK' }, field_4784: 'internal' }] }) }); const data = await listOwnNumbers({ page: 2 }); const url = mocks.fetch.mock.calls[0][0]; expect(url.searchParams.get('filter__field_4773__equal')).toBe('own@example.com'); expect(url.searchParams.get('page')).toBe('2'); expect(data.rows[0]).toEqual({ id: 3, number: '859999 - ok', registeredAt: '11/09/2025 15:41', consultedAt: '', status: 'DESBANIMENTO OK' }); });
 it('rejects the entire response if a row belongs to another account', async () => { mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ count: 1, results: [{ id: 9, field_4773: 'other@example.com' }] }) }); await expect(listOwnNumbers({ page: 1 })).rejects.toThrow('Não foi possível consultar'); });
 it('does not expose provider errors or secrets', async () => { mocks.fetch.mockRejectedValue(new Error('private-token')); await expect(listOwnNumbers({ page: 1 })).rejects.toThrow('Não foi possível consultar'); });
});
