import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const mocks=vi.hoisted(()=>({getClientNotice:vi.fn(),getClientNotices:vi.fn()}));
vi.mock('./actions',()=>mocks);
vi.mock('../workspace/notifications',()=>({ActivityCount:()=>null,ActivityFeed:()=> <p>Atividades pessoais</p>}));
import { ClientNotice } from './client';
beforeEach(()=>{cleanup();vi.resetAllMocks();sessionStorage.clear();});
it('automatically opens only the latest notice and exposes older notices through the bell',async()=>{
 const latest={id:'latest',version:'latest-version',title:'Último comunicado',body:'Mensagem nova',buttonUrl:'',buttonLabel:'',imageUrl:'',enabled:true,status:'published',publishedAt:'2026-10-11T12:00:00Z',createdAt:'2026-10-11T12:00:00Z'};
 const old={...latest,id:'old',version:'old-version',title:'Comunicado anterior'};
 mocks.getClientNotice.mockResolvedValue(latest);mocks.getClientNotices.mockResolvedValue({rows:[latest,old],total:2,page:1,pageSize:20});
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ClientNotice userId="own"/></QueryClientProvider>);
 await screen.findByText('Último comunicado');expect(screen.queryByText('Comunicado anterior')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Entendi'}));expect(sessionStorage.getItem('astros-notice:own:latest-version')).toBe('seen');
 fireEvent.click(screen.getByRole('button',{name:'Ver notificações e comunicados'}));await screen.findByText('Atividades pessoais');expect(mocks.getClientNotices).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Comunicados',exact:true}));await screen.findByText('Comunicado anterior');
});
