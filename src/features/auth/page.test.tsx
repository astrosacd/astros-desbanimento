import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
const mocks=vi.hoisted(()=>({resetClient:vi.fn(),navigate:vi.fn(),invalidate:vi.fn(),getSignupProtection:vi.fn(),signupClient:vi.fn(),rememberAffiliate:vi.fn()}));
vi.mock('./actions',()=>({resetClient:mocks.resetClient,loginClient:vi.fn(),signupClient:mocks.signupClient,recoverClient:vi.fn(),getSignupProtection:mocks.getSignupProtection}));
vi.mock('@tanstack/react-router',()=>({useRouter:()=>({navigate:mocks.navigate,invalidate:mocks.invalidate}),Link:({children,to}:{children:ReactNode;to:string})=><a href={to}>{children}</a>}));
vi.mock('@/features/demo/shell',()=>({Wordmark:()=> <div>Astros</div>}));
vi.mock('../affiliates/actions',()=>({rememberAffiliate:mocks.rememberAffiliate}));
vi.mock('./signup-captcha',()=>({SignupCaptcha:({onToken}:{onToken:(t:string)=>void})=><button type="button" onClick={()=>onToken('captcha-token')}>Validar segurança</button>}));
import { Entrance } from './page';
beforeEach(()=>{cleanup();vi.resetAllMocks();window.history.replaceState(null,'','/reset-password#type=recovery&access_token=private-recovery');});
it('redirects to login only after successfully updating the password',async()=>{
 let resolve:()=>void=()=>{};mocks.resetClient.mockReturnValue(new Promise<void>(r=>{resolve=r;}));
 render(<Entrance mode="reset"/>);
 fireEvent.change(screen.getByLabelText('Nova senha'),{target:{value:'newpassword'}});
 fireEvent.change(screen.getByLabelText('Confirme a nova senha'),{target:{value:'newpassword'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar nova senha'}));
 expect(mocks.navigate).not.toHaveBeenCalled();resolve();
 await waitFor(()=>expect(mocks.navigate).toHaveBeenCalledWith({to:'/login',search:{senha:'atualizada'},replace:true}));
 expect(window.location.hash).toBe('');
 expect(mocks.resetClient.mock.calls[0]![0].data.token).toBe('private-recovery');
});
it('keeps recovery on screen if saving fails',async()=>{
 mocks.resetClient.mockRejectedValue(new Error('Link expirado'));
 render(<Entrance mode="reset"/>);
 fireEvent.change(screen.getByLabelText('Nova senha'),{target:{value:'newpassword'}});
 fireEvent.change(screen.getByLabelText('Confirme a nova senha'),{target:{value:'newpassword'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar nova senha'}));
 await screen.findByText('Link expirado');expect(mocks.navigate).not.toHaveBeenCalled();
});
it('shows the success notice on the login form',()=>{
 window.history.replaceState(null,'','/login?senha=atualizada');
 render(<Entrance mode="login" passwordUpdated/>);
 expect(screen.getByText('Senha atualizada com sucesso. Entre com seu e-mail e sua nova senha.')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Entrar no painel'})).toBeTruthy();
});

it('requires CAPTCHA and preflight before registering an account',async()=>{
 mocks.getSignupProtection.mockResolvedValue({enabled:true,siteKey:'site-key',endpoint:'https://edge.example/guard'});
 mocks.signupClient.mockResolvedValue({signedIn:false});
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({permit:'a'.repeat(64)})));
 vi.stubGlobal('fetch',fetcher);
 render(<Entrance mode="cadastro"/>);
 await screen.findByRole('button',{name:'Validar segurança'});
 const submit=screen.getByRole('button',{name:'Criar minha conta'});
 expect(submit).toBeDisabled();
 fireEvent.change(screen.getByLabelText('Nome completo'),{target:{value:'Maria Costa'}});
 fireEvent.change(screen.getByLabelText('E-mail'),{target:{value:'maria@example.com'}});
 fireEvent.change(screen.getByLabelText('WhatsApp com DDD'),{target:{value:'85999999999'}});
 fireEvent.change(screen.getByLabelText('Senha'),{target:{value:'testpassword'}});
 fireEvent.click(screen.getByRole('button',{name:'Validar segurança'}));
 fireEvent.click(submit);
 await screen.findByText(/Confira sua caixa de entrada/);
 expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({email:'maria@example.com',token:'captcha-token'});
 expect(mocks.signupClient).toHaveBeenCalledWith({data:expect.objectContaining({signupPermit:'a'.repeat(64)})});
 vi.unstubAllGlobals();
});
it('blocks signup when security configuration cannot load and allows retry',async()=>{
 mocks.getSignupProtection.mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce({enabled:false,siteKey:'',endpoint:''});
 render(<Entrance mode="cadastro"/>);
 await screen.findByText('Não foi possível carregar a proteção do cadastro.');
 expect(screen.getByRole('button',{name:'Criar minha conta'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Criar minha conta'})).not.toBeDisabled());
 expect(mocks.signupClient).not.toHaveBeenCalled();
});

it('records referral before allowing signup while retaining CAPTCHA protection',async()=>{
 window.history.replaceState(null,'','/cadastro?ref='+ 'a'.repeat(32));
 let done:()=>void=()=>{};mocks.rememberAffiliate.mockReturnValue(new Promise<void>(r=>{done=r;}));
 mocks.getSignupProtection.mockResolvedValue({enabled:false,siteKey:'',endpoint:''});
 render(<Entrance mode="cadastro"/>);
 await waitFor(()=>expect(mocks.rememberAffiliate).toHaveBeenCalledWith({data:{code:'a'.repeat(32)}}));
 expect(screen.getByRole('button',{name:'Criar minha conta'})).toBeDisabled();done();
 await waitFor(()=>expect(screen.getByRole('button',{name:'Criar minha conta'})).not.toBeDisabled());
});
