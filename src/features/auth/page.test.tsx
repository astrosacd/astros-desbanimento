import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
const mocks=vi.hoisted(()=>({resetClient:vi.fn(),navigate:vi.fn(),invalidate:vi.fn()}));
vi.mock('./actions',()=>({resetClient:mocks.resetClient,loginClient:vi.fn(),signupClient:vi.fn(),recoverClient:vi.fn()}));
vi.mock('@tanstack/react-router',()=>({useRouter:()=>({navigate:mocks.navigate,invalidate:mocks.invalidate}),Link:({children,to}:{children:ReactNode;to:string})=><a href={to}>{children}</a>}));
vi.mock('@/features/demo/shell',()=>({Wordmark:()=> <div>Astros</div>}));
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
