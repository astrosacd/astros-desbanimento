import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ listOwnNumbers: vi.fn() }));
vi.mock('./numbers.server', () => mocks);
import { exportOwnNumbers } from './export.server';
beforeEach(() => mocks.listOwnNumbers.mockReset());
it('exports all pages from authenticated consultation', async () => {
 mocks.listOwnNumbers.mockResolvedValueOnce({ count: 2, pageSize: 1, rows: [{ id: 1, number: '85911111111' }] }).mockResolvedValueOnce({ count: 2, pageSize: 1, rows: [{ id: 2, number: '85922222222' }] });
 expect(await exportOwnNumbers()).toEqual({ numbers: ['85911111111', '85922222222'] });
 expect(mocks.listOwnNumbers.mock.calls.map(call => call[0])).toEqual([{ page: 1 }, { page: 2 }]);
});
it('never downloads a partial export after a service failure', async () => {
 mocks.listOwnNumbers.mockResolvedValueOnce({ count: 2, pageSize: 1, rows: [{ id: 1, number: '85911111111' }] }).mockResolvedValueOnce({ error: 'N01' });
 expect(await exportOwnNumbers()).toEqual({ error: 'N01' });
});
it('returns no numbers for an empty account', async () => {
 mocks.listOwnNumbers.mockResolvedValue({ count: 0, pageSize: 25, rows: [] });
 expect(await exportOwnNumbers()).toEqual({ numbers: [] });
});
it('rejects repeated pages rather than omitting missing numbers', async () => {
 mocks.listOwnNumbers.mockResolvedValue({ count: 2, pageSize: 1, rows: [{ id: 1, number: '85911111111' }] });
 expect(await exportOwnNumbers()).toMatchObject({ error: expect.any(String) });
});
