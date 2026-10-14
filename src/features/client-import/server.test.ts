import {beforeEach,expect,it,vi} from 'vitest';
const api=vi.hoisted(()=>({admin:vi.fn(),request:vi.fn(),cookie:vi.fn()}));vi.mock('../admin/auth.server',()=>({requireAdmin:api.admin,request:api.request}));vi.mock('@tanstack/react-start/server',()=>({getCookie:api.cookie,setResponseHeader:vi.fn()}));
import {importClient} from './server';
const row={sourceId:'1',name:'Maria',email:'maria@example.com',whatsapp:'85999999999',amountCents:110};
beforeEach(()=>{vi.resetAllMocks();api.cookie.mockReturnValue('admin-session');});
it('denies non-admin before any import',async()=>{api.admin.mockRejectedValue(Error('admin only'));await expect(importClient(row)).rejects.toThrow('admin only');expect(api.request).not.toHaveBeenCalled();});
it('never sends the excluded account to the function',async()=>{expect(await importClient({...row,email:'eudezioj@gmail.com'})).toMatchObject({state:'excluded'});expect(api.request).not.toHaveBeenCalled();});
it('forwards only approved fields with the private admin session',async()=>{api.request.mockResolvedValue({ok:true,json:async()=>({success:true,state:'completed',password:'never-return'})});const result=await importClient(row);expect(result).toEqual({success:true,state:'completed',repeated:false});expect(api.request.mock.calls[0][1]).toBe('admin-session');expect(JSON.parse(api.request.mock.calls[0][2].body)).toEqual(row);});
it('instructs same-file retry when creation or credit is uncertain',async()=>{api.request.mockRejectedValue(Error('offline'));await expect(importClient(row)).rejects.toThrow('mesmo arquivo');});
