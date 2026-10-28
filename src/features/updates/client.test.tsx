import {beforeEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const m=vi.hoisted(()=>({clientUpdates:vi.fn()}));
vi.mock('./actions',()=>m);
vi.mock('@tanstack/react-router',()=>({Link:({children,to,...props}:any)=><a href={to} {...props}>{children}</a>}));
import {UpdatesButton} from './client';
const row={id:'new-id',version:1,title:'Nova busca',summary:'Resumo da mudança',body:'<script>alert(1)</script>',category:'new',status:'published',published_at:'2026-10-28T12:00:00Z',created_at:'2026-10-28T12:00:00Z'};
beforeEach(()=>{cleanup();vi.resetAllMocks();localStorage.clear();});
function view(id='own'){return <QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><UpdatesButton userId={id}/></QueryClientProvider>;}
it('does not open automatically; exposes details as text and marks only this account as read',async()=>{m.clientUpdates.mockResolvedValue({rows:[row],total:1,page:1});render(view());await screen.findByLabelText('Há novidades não lidas');expect(screen.queryByRole('dialog')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Novidades da Astros Mais'}));await screen.findByText('Nova busca');expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy();expect(document.querySelector('script')).toBeNull();expect(localStorage.getItem('astros-updates-seen:own')).toBe('new-id:1');expect(localStorage.getItem('astros-updates-seen:other')).toBeNull();expect(screen.getByRole('link',{name:/Ver todas/}).getAttribute('href')).toBe('/novidades');});
it('keeps the trigger usable when the optional database is unavailable',async()=>{m.clientUpdates.mockRejectedValue(Error('Indisponível'));render(view());fireEvent.click(screen.getByRole('button',{name:'Novidades da Astros Mais'}));await screen.findByText('Indisponível');expect(screen.getByRole('button',{name:'Tentar novamente'})).toBeTruthy();});
