import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({getCookie:vi.fn(),setResponseHeader:vi.fn(),requireAdmin:vi.fn(),request:vi.fn()}));
vi.mock('@tanstack/react-start/server',()=>({getCookie:m.getCookie,setResponseHeader:m.setResponseHeader}));
vi.mock('../admin/auth.server',()=>({requireAdmin:m.requireAdmin,request:m.request}));
import {listUpdates,writeUpdate,removeUpdate} from './server';
const input={page:1,search:'',category:'all'};
const form={id:'a076f2e7-0e45-4817-a88f-d18e82f71421',version:0,title:'Nova ferramenta',summary:'Um resumo',body:'Texto completo',category:'new',status:'draft'};
beforeEach(()=>{vi.resetAllMocks();m.getCookie.mockReturnValue('verified-cookie');m.requireAdmin.mockResolvedValue({id:'admin'});});
it('requires a session before querying updates',async()=>{m.getCookie.mockReturnValue(undefined);await expect(listUpdates(input)).rejects.toThrow('Entre');expect(m.request).not.toHaveBeenCalled();});
it('verifies client identity and restricts the list to published updates',async()=>{m.request.mockResolvedValueOnce(new Response(JSON.stringify({id:'user',email_confirmed_at:'date'}))).mockResolvedValueOnce(new Response('[]',{headers:{'content-range':'*/0'}}));expect(await listUpdates({...input,search:'a&status=neq.published'})).toMatchObject({rows:[],total:0});const url=new URL(m.request.mock.calls[1][0],'https://example.com');expect(url.searchParams.get('status')).toBe('eq.published');expect(url.searchParams.get('title')).toBe('ilike.*a&status=neq.published*');expect(m.request.mock.calls[1][1]).toBe('verified-cookie');});
it('rejects unconfirmed clients before reading the table',async()=>{m.request.mockResolvedValueOnce(new Response(JSON.stringify({id:'user'})));await expect(listUpdates(input)).rejects.toThrow('Confirme');expect(m.request).toHaveBeenCalledTimes(1);});
it('does not query drafts when admin authorization fails',async()=>{m.requireAdmin.mockRejectedValue(Error('forbidden'));await expect(listUpdates(input,true)).rejects.toThrow('forbidden');expect(m.request).not.toHaveBeenCalled();});
it('checks live admin identity before saving and uses the authenticated RPC',async()=>{m.request.mockResolvedValue(new Response(JSON.stringify({id:form.id,version:1})));expect(await writeUpdate(form)).toEqual({id:form.id,version:1});expect(m.requireAdmin).toHaveBeenCalledOnce();expect(m.request.mock.calls[0][0]).toBe('/rest/v1/rpc/astros_update_save');expect(JSON.parse(m.request.mock.calls[0][2].body)).toEqual({payload:form});});
it('returns a controlled installation error without affecting other services',async()=>{m.request.mockResolvedValue(new Response('missing',{status:404}));await expect(listUpdates(input,true)).rejects.toThrow('Instale o SQL');});

it('requires live admin authorization before deleting',async()=>{m.requireAdmin.mockRejectedValue(Error('forbidden'));await expect(removeUpdate({id:form.id,version:1})).rejects.toThrow('forbidden');expect(m.request).not.toHaveBeenCalled();});
it('deletes only through the admin RPC with an exact id and version',async()=>{m.request.mockResolvedValue(new Response('true'));expect(await removeUpdate({id:form.id,version:2})).toEqual({success:true});expect(m.request.mock.calls[0][0]).toBe('/rest/v1/rpc/astros_update_delete');expect(JSON.parse(m.request.mock.calls[0][2].body)).toEqual({update_id:form.id,expected_version:2});});
