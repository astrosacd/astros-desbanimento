import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const mocks=vi.hoisted(()=>({getAdminNotices:vi.fn(),setNoticeStatus:vi.fn(),removeNotice:vi.fn(),updateNotice:vi.fn(),uploadImage:vi.fn()}));
vi.mock('./actions',()=>mocks);
import { NoticeSettings } from './admin';
beforeEach(()=>{cleanup();vi.resetAllMocks();});
it('clears the form after a successful save and reloads saved fields only when Edit is clicked',async()=>{
 let saved={title:'Aviso antigo',body:'Mensagem antiga',buttonLabel:'',buttonUrl:'',imageUrl:'',enabled:true,version:'old',id:'00000000-0000-4000-8000-000000000001',status:'published',publishedAt:'2026-10-11T12:00:00Z',createdAt:'2026-10-11T12:00:00Z'};
 mocks.getAdminNotices.mockImplementation(async()=>({rows:[saved],page:1,total:1,pageSize:20}));
 mocks.updateNotice.mockImplementation(async({data})=>{saved={...data,version:'new'};return {version:'new'};});
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><NoticeSettings adminId="admin"/></QueryClientProvider>);
 await screen.findByText('Aviso antigo');
 expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('');
 fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Novo aviso'}});
 fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Nova mensagem'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar comunicado'}));
 await waitFor(()=>expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe(''));
 expect(mocks.updateNotice).toHaveBeenCalledTimes(1);
 await screen.findByText('Novo aviso');
 fireEvent.click(screen.getByRole('button',{name:'Editar'}));
 expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('Novo aviso');
});

it('requires the in-panel confirmation and leaves the notice intact on Cancel',async()=>{
 const notice={id:'00000000-0000-4000-8000-000000000001',title:'Teste',body:'Mensagem',buttonUrl:'',buttonLabel:'',imageUrl:'',enabled:true,version:'v',status:'published',createdAt:'2026-10-11T12:00:00Z',publishedAt:'2026-10-11T12:00:00Z'};
 mocks.getAdminNotices.mockResolvedValue({rows:[notice],total:1,page:1,pageSize:20});mocks.removeNotice.mockResolvedValue({success:true});
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><NoticeSettings adminId="admin"/></QueryClientProvider>);
 await screen.findByText('Teste');fireEvent.click(screen.getByRole('button',{name:'Excluir'}));
 expect(screen.getByRole('alertdialog')).toBeTruthy();expect(mocks.removeNotice).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));expect(mocks.removeNotice).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Excluir'}));fireEvent.click(screen.getByRole('button',{name:'Excluir comunicado'}));
 await waitFor(()=>expect(mocks.removeNotice).toHaveBeenCalledWith({data:{id:notice.id}}));
});
