import { beforeEach, expect, it, vi } from 'vitest';
const mock=vi.hoisted(()=>({request:vi.fn(),requireAdmin:vi.fn(),getCookie:vi.fn(),fetch:vi.fn()}));
vi.mock('../admin/auth.server',()=>({request:mock.request,requireAdmin:mock.requireAdmin}));
vi.mock('@tanstack/react-start/server',()=>({getCookie:mock.getCookie,setResponseHeader:vi.fn()}));
import { adminCall, clientCall, wallet } from './server';
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('fetch',mock.fetch);mock.getCookie.mockReturnValue('private-session');});
const response=(value:unknown)=>({ok:true,json:async()=>value});
it('checks the authoritative admin role before accessing settings',async()=>{mock.requireAdmin.mockRejectedValue(new Error('Acesso negado'));await expect(adminCall('save-settings',{})).rejects.toThrow('negado');expect(mock.fetch).not.toHaveBeenCalled();});
it('requires a client session before generating a recharge',async()=>{mock.getCookie.mockReturnValue(undefined);await expect(clientCall('create',{})).rejects.toThrow('sessão');expect(mock.fetch).not.toHaveBeenCalled();});
it('never trusts browser-supplied identity for the balance',async()=>{mock.request.mockResolvedValueOnce(response({id:'own-uuid'})).mockResolvedValueOnce(response([{recarga:'12.34'}])).mockResolvedValueOnce(response([])).mockResolvedValueOnce(response([]));expect(await wallet()).toMatchObject({balanceCents:1234});expect(mock.request.mock.calls[1]![0]).toContain('id=eq.own-uuid');expect(mock.request.mock.calls[2]![0]).toContain('user_id=eq.own-uuid');});
it('does not display a fictitious zero when the balance lookup fails',async()=>{mock.request.mockResolvedValueOnce(response({id:'own'})).mockResolvedValueOnce({ok:false});await expect(wallet()).rejects.toThrow('saldo');});
it('uses the private session only on the server request',async()=>{mock.requireAdmin.mockResolvedValue({id:'admin'});mock.fetch.mockResolvedValue(response({hasAccessToken:true}));expect(await adminCall('settings')).toEqual({hasAccessToken:true});expect(mock.fetch.mock.calls[0]![1].headers.Authorization).toBe('Bearer private-session');});
it('confirms persisted pricing rather than trusting a successful save banner',async()=>{
 const {savePrices}=await import('./server');mock.requireAdmin.mockResolvedValue({id:'admin'});mock.request.mockResolvedValue(response({servicePriceCents:12500,minimumEnabled:false,minimumRechargeCents:500}));
 expect(await savePrices({servicePriceCents:12500,minimumEnabled:false,minimumRechargeCents:500})).toMatchObject({servicePriceCents:12500});expect(mock.request.mock.calls[0]![0]).toBe('/rest/v1/rpc/astros_save_prices');
});
it('does not claim success when the database returns a different price',async()=>{
 const {savePrices}=await import('./server');mock.requireAdmin.mockResolvedValue({id:'admin'});mock.request.mockResolvedValue(response({servicePriceCents:0,minimumEnabled:false,minimumRechargeCents:500}));
 await expect(savePrices({servicePriceCents:12500,minimumEnabled:false,minimumRechargeCents:500})).rejects.toThrow('confirmados');
});
