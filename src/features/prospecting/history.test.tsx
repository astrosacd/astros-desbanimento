import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const api = vi.hoisted(() => ({ history: vi.fn(), stage: vi.fn(), summary: vi.fn() }));
vi.mock("./actions", () => ({ prospectLeadSummary:api.summary, prospectHistory: api.history, prospectLeadStatus: api.stage }));
vi.mock("./outreach", () => ({ LeadOutreach: () => <div>Preparar mensagem</div> }));
import { ProspectHistory } from "./history";
const lead = { id:"lead-1",status:"new",snapshot:{name:"Empresa de exemplo",address:"Fortaleza, CE",phone:"85999999999",website:"https://example.com",mapsUrl:"https://maps.google.com",websiteStatus:"online",websiteReason:"Página acessível",checkedAt:"2026-10-19T12:00:00Z",rating:4.9,reviews:10} };
function mount(){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<QueryClientProvider client={client}><div className="prospect-page"><ProspectHistory userId="owner" /></div></QueryClientProvider>);}
afterEach(()=>{cleanup();vi.resetAllMocks();});
it("keeps complete contacts behind accessible compact cards and supports closing details",async()=>{
 api.history.mockResolvedValue({leads:[lead],hasMore:false});mount();
 await screen.findByRole('button',{name:'Ver detalhes de Empresa de exemplo'});
 expect(screen.queryByText('Página acessível')).toBeNull();
 expect(screen.queryByRole('link',{name:/Abrir endereço informado/})).toBeNull();
 expect(screen.getByLabelText('Legenda das etapas do contato')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Ver detalhes de Empresa de exemplo'}));
 const dialog=screen.getByRole('dialog');
 expect(within(dialog).getByRole('link',{name:/Abrir endereço informado/})).toHaveAttribute('href','https://example.com');
 expect(within(dialog).getByText('Página acessível')).toBeTruthy();
 fireEvent.click(within(dialog).getByRole('button',{name:'Close'}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
});
it("saves the selected stage and refreshes card text and color from the server",async()=>{
 let status='new';api.history.mockImplementation(async()=>({leads:[{...lead,status}],hasMore:false}));
 api.stage.mockImplementation(async({data})=>{status=data.status;return {saved:true};});
 mount();fireEvent.click(await screen.findByRole('button',{name:'Ver detalhes de Empresa de exemplo'}));
 fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Etapa do contato'),{target:{value:'won'}});
 await waitFor(()=>expect(api.stage).toHaveBeenCalledWith({data:{id:'lead-1',status:'won'}}));
 await waitFor(()=>expect(document.querySelector('.prospect-lead-compact')).toHaveClass('prospect-stage-won'));
  await waitFor(()=>expect(api.summary.mock.calls.length).toBeGreaterThanOrEqual(2));
});


it('moves a lead by dragging and loads each column using its server stage filter',async()=>{
 let status='new';
 api.history.mockImplementation(async({data})=>({leads:data.status==='all'||data.status===status?[{...lead,status}]:[],hasMore:false}));
 api.stage.mockImplementation(async({data})=>{status=data.status;return {saved:true};});
 mount();await screen.findByRole('button',{name:'Ver detalhes de Empresa de exemplo'});
 fireEvent.click(screen.getByRole('button',{name:'Quadro de etapas'}));
 const handle=await screen.findByRole('button',{name:'Arrastar Empresa de exemplo'});
 const transfer={effectAllowed:'',dropEffect:'',setData:vi.fn(),getData:()=>lead.id};
 fireEvent.dragStart(handle,{dataTransfer:transfer});
 fireEvent.dragOver(screen.getByRole('region',{name:'Quadro de acompanhamento'}).querySelector('.prospect-stage-negotiating')!,{dataTransfer:transfer});
 fireEvent.drop(screen.getByRole('region',{name:'Etapa Em negociação'}),{dataTransfer:transfer});
 await waitFor(()=>expect(api.stage).toHaveBeenCalledWith({data:{id:lead.id,status:'negotiating'}}));
 await waitFor(()=>expect(within(screen.getByRole('region',{name:'Etapa Em negociação'})).getByRole('button',{name:'Ver detalhes de Empresa de exemplo'})).toBeTruthy());
 for(const stage of ['new','contacted','negotiating','won','discarded'])expect(api.history).toHaveBeenCalledWith({data:{page:0,search:'',status:stage}});
});
it('shows a failed save and keeps the lead in its original column',async()=>{
 api.history.mockImplementation(async({data})=>({leads:data.status==='all'||data.status==='new'?[lead]:[],hasMore:false}));
 api.stage.mockRejectedValue(Error('Não foi possível salvar a etapa.'));
 mount();await screen.findByRole('button',{name:'Ver detalhes de Empresa de exemplo'});
 fireEvent.click(screen.getByRole('button',{name:'Quadro de etapas'}));
 const select=await screen.findByLabelText('Etapa de Empresa de exemplo');
 fireEvent.change(select,{target:{value:'won'}});
 await screen.findByText('Não foi possível salvar a etapa.');
 expect(select).toHaveValue('new');
 expect(within(screen.getByRole('region',{name:'Etapa Novo'})).getByRole('button',{name:'Ver detalhes de Empresa de exemplo'})).toBeTruthy();
 expect(screen.queryByText('Etapa atualizada para Fechado.')).toBeNull();
});
it('paginates columns independently and ignores drops without a matching local drag',async()=>{
 api.history.mockImplementation(async({data})=>({leads:data.status==='all'||data.status==='new'?[lead]:[],hasMore:data.status==='new'&&data.page===0}));
 mount();await screen.findByRole('button',{name:'Ver detalhes de Empresa de exemplo'});
 fireEvent.click(screen.getByRole('button',{name:'Quadro de etapas'}));
 const column=screen.getByRole('region',{name:'Etapa Novo'});
 await waitFor(()=>expect(within(column).getByRole('button',{name:'Próxima'})).not.toBeDisabled());
 fireEvent.click(within(column).getByRole('button',{name:'Próxima'}));
 await waitFor(()=>expect(api.history).toHaveBeenCalledWith({data:{page:1,search:'',status:'new'}}));
 expect(within(screen.getByRole('region',{name:'Etapa Fechado'})).getByText('Pág. 1')).toBeTruthy();
 fireEvent.drop(screen.getByRole('region',{name:'Etapa Fechado'}),{dataTransfer:{getData:()=>lead.id}});
 expect(api.stage).not.toHaveBeenCalled();
});

beforeEach(()=>{api.summary.mockResolvedValue({total:130,new:100,contacted:10,negotiating:12,won:5,discarded:3});});
it('shows account totals beyond the current page and preserves the same totals in board view',async()=>{
 api.history.mockResolvedValue({leads:[lead],hasMore:false});mount();
 const summary=await screen.findByRole('region',{name:'Quantidades de todos os seus leads'});
 expect(within(summary).getByText('130')).toBeTruthy();expect(within(summary).getByText('100')).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Etapa'),{target:{value:'won'}});
 expect(within(summary).getByText('130')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Quadro de etapas'}));
 expect(within(summary).getByText('130')).toBeTruthy();
});
it('does not show fabricated zero totals if the summary is unavailable',async()=>{
 api.summary.mockRejectedValue(Error('Unavailable'));api.history.mockResolvedValue({leads:[],hasMore:false});mount();
 await screen.findByText('Não foi possível carregar as quantidades de leads.');
 expect(screen.queryByRole('region',{name:'Quantidades de todos os seus leads'})).toBeNull();
});
