import { beforeEach, expect, it, vi } from 'vitest';
import { fetchNumberRows } from './transport.server';
const provider = vi.fn();
const url = new URL('https://baserow.astroscomunicacaodigital.com/api/database/rows/table/511/?filter__field_4773__equal=own%40example.com&page=2&size=25');
beforeEach(() => { provider.mockReset(); vi.stubGlobal('fetch', provider); });
it('follows same-endpoint redirects and preserves the account filter', async () => {
 provider.mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: '/api/database/rows/table/511' } })).mockResolvedValueOnce(new Response('{}'));
 expect((await fetchNumberRows(url, 'private')).status).toBe(200);
 const next = new URL(provider.mock.calls[1]![0]);
 expect(next.searchParams.get('filter__field_4773__equal')).toBe('own@example.com');
 expect(next.searchParams.get('page')).toBe('2');
 expect(provider.mock.calls[0]![1].redirect).toBe('manual');
});
it('never forwards credentials to another host', async () => {
 provider.mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://other.example/api/database/rows/table/511/' } }));
 await expect(fetchNumberRows(url, 'private')).rejects.toThrow('unsafe');
 expect(provider).toHaveBeenCalledTimes(1);
});
it('rejects HTTPS downgrade and redirects outside the table endpoint', async () => {
 for (const location of ['http://baserow.astroscomunicacaodigital.com/api/database/rows/table/511/', '/login']) {
  provider.mockResolvedValue(new Response(null, { status: 302, headers: { location } }));
  await expect(fetchNumberRows(url, 'private')).rejects.toThrow('unsafe');
 }
});
it('limits redirect loops', async () => {
 provider.mockResolvedValue(new Response(null, { status: 307, headers: { location: url.toString() } }));
 await expect(fetchNumberRows(url, 'private')).rejects.toThrow('loop');
 expect(provider).toHaveBeenCalledTimes(4);
});
