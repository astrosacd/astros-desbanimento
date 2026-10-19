import {afterEach,expect,it,vi} from 'vitest';
import {render,screen,cleanup,fireEvent,within,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const api=vi.hoisted(()=>({refresh:vi.fn(),status:vi.fn(),config:vi.fn().mockResolvedValue({})}));vi.mock('../actions',()=>({cnpjRefresh:api.refresh,cnpjStatus:api.status,cnpjConfig:api.config}));
import {CnpjDetails,displayCnpj,displayCnpjDate,displayCnpjMoney} from './details';
import type {Lead} from '../types';
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('formats identifiers, date-only source values and BRL without shifting the calendar date',()=>{expect(displayCnpj('11222333000181')).toBe('11.222.333/0001-81');expect(displayCnpjDate('2023-12-17T00:00:00Z')).toBe('17/12/2023');expect(displayCnpjDate('17/12/2023')).toBe('17/12/2023');expect(displayCnpjDate('2023-02-31')).toBe('2023-02-31');expect(displayCnpjMoney('5000')).toMatch(/5\.000,00/);expect(displayCnpjMoney('0')).toMatch(/0,00/);expect(displayCnpjMoney('5.000,00')).toMatch(/5\.000,00/);expect(displayCnpjMoney(undefined)).toBe('Não informado');});
it('requires confirmation for a free refresh, returns updated fields and never starts on opening details',async()=>{const updated={name:'Empresa atualizada',cnpj:'11222333000181'};api.refresh.mockResolvedValue({state:'completed',leadSnapshot:updated,charged_cents:0});const onUpdated=vi.fn();const lead={id:'00000000-0000-4000-8000-000000000001',snapshot:{source:'cnpj',cnpj:'11222333000181',name:'Empresa',openedAt:'2023-12-17T00:00:00Z',capitalSocial:'5000',registrationStatus:'ATIVA'}} as Lead;render(<QueryClientProvider client={new QueryClient()}><CnpjDetails userId="owner" lead={lead} onUpdated={onUpdated}/></QueryClientProvider>);expect(screen.getByText('17/12/2023')).toBeTruthy();expect(api.refresh).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Atualizar dados cadastrais'}));expect(api.refresh).not.toHaveBeenCalled();fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Confirmar atualização cadastral'}));await waitFor(()=>expect(onUpdated).toHaveBeenCalledWith(updated));expect(api.refresh.mock.calls[0][0].data).toEqual({leadId:lead.id,requestId:expect.stringMatching(/^[a-f\d-]{36}$/)});});
it('shows the quota clock and blocks a new cadastral refresh when quota is exhausted',async()=>{
 api.config.mockResolvedValue({dailyQuota:{limit:5,used:5,remaining:0,serverNow:'2026-10-19T22:00:00Z',resetsAt:'2026-10-20T03:00:00Z'}});
 const lead={id:'lead',snapshot:{source:'cnpj',cnpj:'11222333000181',name:'Empresa'}} as Lead;
 render(<QueryClientProvider client={new QueryClient()}><CnpjDetails userId="owner" lead={lead}/></QueryClientProvider>);
 await screen.findByText('Limite diário de consultas CNPJ atingido');
 expect(screen.getByRole('button',{name:'Atualizar dados cadastrais'})).toBeDisabled();expect(api.refresh).not.toHaveBeenCalled();
});
