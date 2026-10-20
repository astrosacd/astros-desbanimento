import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,within} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const api=vi.hoisted(()=>({config:vi.fn(),history:vi.fn(),search:vi.fn(),status:vi.fn(),adminConfig:vi.fn(),save:vi.fn(),adminHistory:vi.fn(),enrich:vi.fn()}));
vi.mock('../actions',()=>({cnpjConfig:api.config,cnpjHistory:api.history,cnpjSearch:api.search,cnpjStatus:api.status,cnpjAdminConfig:api.adminConfig,cnpjAdminSave:api.save,cnpjAdminHistory:api.adminHistory,cnpjEnrich:api.enrich}));
import {CnpjPanel,CnpjAdmin} from './ui';
const config={installed:true,enabled:true,unitCents:50,enrichEnabled:false,enrichCents:25,dailyRequests:5,dailyCalls:20,minuteCalls:5,cacheDays:7,hasKey:true};
function mount(child:React.ReactNode){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{child}</QueryClientProvider>);}
beforeEach(()=>{api.config.mockResolvedValue(config);api.history.mockResolvedValue({requests:[],hasMore:false});api.adminConfig.mockResolvedValue(config);api.adminHistory.mockResolvedValue({requests:[],hasMore:false});});afterEach(()=>{cleanup();vi.resetAllMocks();vi.unstubAllGlobals();});
it('keeps CNPJ disabled without dispatch while Maps remains an independent option',async()=>{api.config.mockResolvedValue({...config,installed:false,enabled:false});mount(<CnpjPanel userId="owner"/>);await screen.findByText('Pesquisa por CNPJ ainda não disponível');expect(api.search).not.toHaveBeenCalled();expect(api.history).not.toHaveBeenCalled();});
it('shows the charge before dispatch and uses one stable UUID for the request',async()=>{api.search.mockResolvedValue({id:'ref',state:'completed',delivered:1,charged_cents:50});mount(<CnpjPanel userId="owner"/>);fireEvent.click(await screen.findByRole('button',{name:'Consultar um CNPJ'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Conferir consulta CNPJ'})).not.toBeDisabled());fireEvent.change(screen.getByLabelText('CNPJ numérico (14 dígitos)'),{target:{value:'11222333000181'}});fireEvent.click(screen.getByRole('button',{name:'Conferir consulta CNPJ'}));expect(api.search).not.toHaveBeenCalled();const dialog=screen.getByRole('dialog');expect(within(dialog).getByText('Máximo a descontar da carteira')).toBeTruthy();fireEvent.click(within(dialog).getByRole('button',{name:'Confirmar consulta'}));await screen.findByText('1 novos leads entregues');expect(api.search).toHaveBeenCalledTimes(1);expect(api.search.mock.calls[0][0].data).toMatchObject({mode:'lookup',cnpj:'11222333000181',quantity:1,expectedUnitCents:50,requestId:expect.stringMatching(/^[\da-f-]{36}$/)});});
it('does not prefill or expose credentials and preserves the existing key on settings edits',async()=>{api.save.mockResolvedValue({saved:true});mount(<CnpjAdmin adminId="admin"/>);const key=await screen.findByLabelText(/Chave da Casa dos Dados/);expect(key).toHaveValue('');fireEvent.click(screen.getByRole('button',{name:'Salvar configuração CNPJ'}));await waitFor(()=>expect(api.save).toHaveBeenCalled());expect(api.save.mock.calls[0][0].data.apiKey).toBe('');});
it('searches states by name or abbreviation in a bounded list and keeps the saved state code',async()=>{
 vi.stubGlobal('ResizeObserver',class{observe(){} unobserve(){} disconnect(){}});
 Element.prototype.scrollIntoView=vi.fn();
 mount(<CnpjPanel userId="owner"/>);
 const state=await screen.findByRole('combobox',{name:'Estado'});
 await waitFor(()=>expect(state).not.toBeDisabled());
 fireEvent.click(state);
 const search=screen.getByLabelText('Pesquisar estado');
 fireEvent.change(search,{target:{value:'Ceará'}});
 expect(screen.getByRole('option',{name:/Ceará \(CE\)/})).toBeTruthy();
 expect(screen.queryByRole('option',{name:/São Paulo/})).toBeNull();
 fireEvent.change(search,{target:{value:'CE'}});
 fireEvent.click(screen.getByRole('option',{name:/Ceará \(CE\)/}));
 expect(state).toHaveTextContent('Ceará (CE)');
 expect(screen.queryByLabelText('Pesquisar estado')).toBeNull();
 expect(api.search).not.toHaveBeenCalled();
});
it.each(['unavailable','balance'])('shows safe customer feedback for %s without supplier diagnostics',async(reason)=>{
 api.search.mockResolvedValue({id:'ref',state:'failed',delivered:0,charged_cents:0,failureReason:reason});mount(<CnpjPanel userId="owner"/>);
 fireEvent.click(await screen.findByRole('button',{name:'Consultar um CNPJ'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Conferir consulta CNPJ'})).not.toBeDisabled());fireEvent.change(screen.getByLabelText('CNPJ numérico (14 dígitos)'),{target:{value:'11222333000181'}});fireEvent.click(screen.getByRole('button',{name:'Conferir consulta CNPJ'}));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Confirmar consulta'}));
 await screen.findByText(reason==='balance'?'Saldo insuficiente na carteira':'Não foi possível concluir sua consulta agora');expect(screen.queryByText(/HTTP|Credencial recusada|Fornecedor recusou/)).toBeNull();
 if(reason==='balance')expect(screen.getByRole('link',{name:'Ir para carteira e recargas'})).toHaveAttribute('href','/carteira');
});
async function submitLookup(){
 fireEvent.click(await screen.findByRole('button',{name:'Consultar um CNPJ'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Conferir consulta CNPJ'})).not.toBeDisabled());
 fireEvent.change(screen.getByLabelText('CNPJ numérico (14 dígitos)'),{target:{value:'11222333000181'}});
 fireEvent.click(screen.getByRole('button',{name:'Conferir consulta CNPJ'}));
 fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Confirmar consulta'}));
}
it('does not poll a nonexistent request after a definite daily quota rejection',async()=>{
 api.search.mockRejectedValue(new Error('Limite diário de consultas CNPJ atingido'));
 mount(<CnpjPanel userId="owner"/>);await submitLookup();
 await screen.findByText(/Você atingiu o limite diário de consultas CNPJ desta conta/);
 expect(screen.getByRole('button',{name:'Conferir consulta CNPJ'})).not.toBeDisabled();
 expect(screen.queryByRole('button',{name:'Verificar consulta CNPJ'})).toBeNull();expect(api.status).not.toHaveBeenCalled();
});
it('keeps an uncertain request for status verification without sending it twice',async()=>{
 api.search.mockRejectedValue(new Error('Failed to fetch'));
 api.status.mockResolvedValue({id:'ref',state:'completed',delivered:1,charged_cents:50});
 mount(<CnpjPanel userId="owner"/>);await submitLookup();
 const verify=await screen.findByRole('button',{name:'Verificar consulta CNPJ'});
 await waitFor(()=>expect(verify).not.toBeDisabled());fireEvent.click(verify);
 await screen.findByText('1 novos leads entregues');
 expect(api.search).toHaveBeenCalledTimes(1);expect(api.status.mock.calls[0][0].data.requestId).toBe(api.search.mock.calls[0][0].data.requestId);
});
it('shows server quota and blocks both search modes before dispatch',async()=>{
 api.config.mockResolvedValue({...config,dailyQuota:{limit:5,used:5,remaining:0,serverNow:'2026-10-19T22:00:00Z',resetsAt:'2026-10-20T03:00:00Z'}});
 mount(<CnpjPanel userId="owner"/>);
 await screen.findByText('Limite diário de consultas CNPJ atingido');
 expect(screen.getByLabelText('Tempo até a renovação do limite')).toHaveTextContent('05:00:00');
 fireEvent.click(screen.getByRole('button',{name:'Consultar um CNPJ'}));
 expect(screen.getByRole('button',{name:'Conferir consulta CNPJ'})).toBeDisabled();
 expect(api.search).not.toHaveBeenCalled();
});
it('offers a direct action to the leads after successful CNPJ delivery without a second query',async()=>{
 const onLeads=vi.fn();api.search.mockResolvedValue({id:'ref',state:'completed',delivered:1,charged_cents:50});
 mount(<CnpjPanel userId="owner" onLeads={onLeads}/>);await submitLookup();
 fireEvent.click(await screen.findByRole('button',{name:'Ver meus leads'}));
 expect(onLeads).toHaveBeenCalledOnce();expect(api.search).toHaveBeenCalledOnce();
});
