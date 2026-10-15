import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
const data={enabled:true,hasKey:true,workerReady:true,fxMode:'manual',usdBrlUnits:55000,marginBps:5000,feeCents:100};
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({invalidateQueries:vi.fn()}),useQuery:()=>({data,isPending:false,isError:false,refetch:vi.fn()})}));
vi.mock('./actions',()=>({smsAdminSettings:vi.fn(),smsSaveSettings:vi.fn(),smsRefreshFx:vi.fn()}));
vi.mock('./supplier-balance',()=>({SmsSupplierBalance:()=> <p>Saldo do fornecedor</p>}));
vi.mock('./operations',()=>({SmsOperations:()=> <p>Indicadores da operação</p>}));
vi.mock('./orders',()=>({SmsHistory:()=> <p>Histórico administrativo</p>}));
vi.mock('./admin-preview',()=>({SmsAdminPreview:()=> <p>Simulador de custos</p>}));
import {SmsAdmin} from './admin';
afterEach(cleanup);
async function tab(name:string){const el=screen.getByRole('tab',{name});fireEvent.mouseDown(el,{button:0,ctrlKey:false});fireEvent.click(el);await waitFor(()=>expect(el.getAttribute('aria-selected')).toBe('true'));}
it('separates operation, orders and simulator into distinct visible areas',async()=>{render(<SmsAdmin adminId="admin"/>);expect(screen.getByText('Saldo do fornecedor')).toBeTruthy();expect(screen.queryByText('Histórico administrativo')).toBeNull();await tab('Pedidos');expect(screen.getByText('Histórico administrativo')).toBeTruthy();expect(screen.queryByText('Saldo do fornecedor')).toBeNull();await tab('Simulador de preços');expect(screen.getByText('Simulador de custos')).toBeTruthy();});
it('preserves unsaved settings while navigating tabs without submitting',async()=>{render(<SmsAdmin adminId="admin"/>);await tab('Configurações');const input=screen.getByLabelText('Acréscimo sobre o custo (%)') as HTMLInputElement;fireEvent.change(input,{target:{value:'65'}});await tab('Operação');await tab('Configurações');expect((screen.getByLabelText('Acréscimo sobre o custo (%)') as HTMLInputElement).value).toBe('65');expect(screen.getByText('Você tem alterações ainda não salvas.')).toBeTruthy();});
