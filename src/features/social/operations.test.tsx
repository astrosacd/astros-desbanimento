vi.mock('./incidents',()=>({SocialIncidents:()=>null}));
import {it,expect,vi,afterEach} from 'vitest';import {render,screen,cleanup} from '@testing-library/react';
const state=vi.hoisted(()=>({error:false}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({isPending:false,isError:state.error,error:Error('Consulta indisponível'),data:state.error?undefined:{total:8,active:3,completed:2,partial:1,refunded:1,review:1,attentionCount:1,attention:[{id:'review',title:'Pedido em conferência',state:'review',created_at:'2026-10-15T12:00:00Z'}]},refetch:vi.fn()})}));
vi.mock('./actions',()=>({socialAdminOperations:vi.fn()}));vi.mock('./orders',()=>({SocialOrderDetail:()=>null}));
import {SocialOperations} from './operations';afterEach(()=>{cleanup();state.error=false;});
it('shows operational totals and an actionable attention queue without fake revenue',()=>{render(<SocialOperations adminId="admin"/>);expect(screen.getByText('8')).toBeTruthy();expect(screen.getByText('Pedido em conferência')).toBeTruthy();expect(screen.getByRole('button',{name:'Analisar pedido'})).toBeTruthy();expect(screen.queryByText(/R\$/)).toBeNull();});
it('shows query failure instead of presenting zero totals as confirmed',()=>{state.error=true;render(<SocialOperations adminId="admin"/>);expect(screen.getByRole('alert').textContent).toBe('Consulta indisponível');expect(screen.queryByText('Pedidos registrados')).toBeNull();});
