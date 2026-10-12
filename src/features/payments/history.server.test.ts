import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),request:vi.fn()}));
vi.mock('../admin/auth.server',()=>mocks);
vi.mock('@tanstack/react-start/server',()=>({getCookie:()=> 'admin-session',setResponseHeader:vi.fn()}));
import { paymentHistory } from './history.server';
beforeEach(()=>vi.resetAllMocks());
it('blocks clients before querying any financial history',async()=>{mocks.requireAdmin.mockRejectedValue(new Error('Acesso negado'));await expect(paymentHistory({})).rejects.toThrow('negado');expect(mocks.request).not.toHaveBeenCalled();});
it('filters on the server, paginates, and omits QR codes and private fields',async()=>{
 mocks.requireAdmin.mockResolvedValue({id:'admin'});mocks.request.mockResolvedValue({ok:true,headers:new Headers({'content-range':'25-25/26'}),json:async()=>[{id:'00000000-0000-4000-8000-000000000001',amount_cents:5000,method:'pix',status:'approved',mp_payment_id:'123',created_at:'2026-10-11T12:00:00Z',updated_at:'2026-10-11T12:00:00Z',live_mode:true,painel_de_desbanimento:{nome:'Maria Costa',email:'maria@example.com'},qr_code:'private-extra'}]});
 const result=await paymentHistory({page:2,email:'maria',status:'approved',method:'pix',from:'2026-10-11',until:'2026-10-11'});
 const url=new URL('https://example.test'+mocks.request.mock.calls[0]![0]);expect(url.searchParams.get('offset')).toBe('25');expect(url.searchParams.get('painel_de_desbanimento.email')).toBe('ilike.*maria*');expect(url.searchParams.get('and')).toContain('2026-10-11T03:00:00.000Z');expect(result.total).toBe(26);expect(result.rows[0]?.email).toBe('maria@example.com');expect(JSON.stringify(result)).not.toContain('private-extra');
});
it('reports lookup failures instead of pretending history is empty',async()=>{mocks.requireAdmin.mockResolvedValue({id:'admin'});mocks.request.mockResolvedValue({ok:false});await expect(paymentHistory({})).rejects.toThrow('histórico');});
it('rejects invalid dates and unexpected identity overrides',async()=>{mocks.requireAdmin.mockResolvedValue({id:'admin'});await expect(paymentHistory({from:'2026-02-31'})).rejects.toThrow();await expect(paymentHistory({userId:'other'})).rejects.toThrow();expect(mocks.request).not.toHaveBeenCalled();});
