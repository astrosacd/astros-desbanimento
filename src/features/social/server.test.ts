import {it,expect,vi,afterEach} from 'vitest';
const auth=vi.hoisted(()=>({requireAdmin:vi.fn()}));
vi.mock('@tanstack/react-start/server',()=>({getCookie:vi.fn(()=> 'SESSION'),setResponseHeader:vi.fn()}));vi.mock('../admin/auth.server',()=>auth);
import {socialCall} from './server';
afterEach(()=>{vi.unstubAllGlobals();vi.resetAllMocks();});
it('requires administrative permission before any server admin fetch',async()=>{const request=vi.fn();vi.stubGlobal('fetch',request);auth.requireAdmin.mockRejectedValue(Error('Acesso restrito'));await expect(socialCall('admin-settings',{},true)).rejects.toThrow('Acesso restrito');expect(request).not.toHaveBeenCalled();});
it('never forwards a provider credential from configuration to a public URL',async()=>{const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({saved:true})));vi.stubGlobal('fetch',request);await socialCall('admin-configure',{apiKey:'PRIVATE-PROVIDER'},true);expect(auth.requireAdmin).toHaveBeenCalledOnce();const [url,opts]=request.mock.calls[0]!;expect(url).toBe('https://tevljvidqbvrcgzqypwf.supabase.co/functions/v1/astros-social');expect(url).not.toContain('PRIVATE');expect(opts.headers.Authorization).toBe('Bearer SESSION');});
