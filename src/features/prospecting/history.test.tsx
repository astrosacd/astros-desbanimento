import { afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const api = vi.hoisted(() => ({ history: vi.fn(), stage: vi.fn() }));
vi.mock("./actions", () => ({ prospectHistory: api.history, prospectLeadStatus: api.stage }));
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
});

