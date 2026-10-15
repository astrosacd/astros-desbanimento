import {beforeEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
const api=vi.hoisted(()=>({saveIntegration:vi.fn(),savePrices:vi.fn(),getPrices:vi.fn()}));
vi.mock('./actions',()=>({getPaymentSettings:vi.fn(),getAdminPrices:api.getPrices,savePaymentSettings:api.saveIntegration,saveAdminPrices:api.savePrices}));
vi.mock('@tanstack/react-query',()=>({useQuery:({queryKey}:any)=>({data:queryKey[0]==='admin-prices'?{servicePriceCents:500,minimumEnabled:true,minimumRechargeCents:1000}:{enabled:true,liveMode:false,hasAccessToken:true,hasWebhookSecret:true,webhookUrl:'https://example.com/webhook'},isPending:false,isError:false,refetch:async()=>({isError:false})})}));
import {PaymentSettings} from './admin-settings';
beforeEach(()=>{cleanup();vi.resetAllMocks();api.saveIntegration.mockResolvedValue({});api.savePrices.mockResolvedValue({});api.getPrices.mockResolvedValue({servicePriceCents:500,minimumEnabled:true,minimumRechargeCents:1000});});
it('saves the price/minimum independently without resubmitting credentials',async()=>{render(<PaymentSettings/>);fireEvent.change(screen.getByLabelText(/Taxa por desbanimento permanente/),{target:{value:'7,50'}});fireEvent.click(screen.getByRole('button',{name:'Salvar taxa e mínimo'}));await waitFor(()=>expect(api.savePrices).toHaveBeenCalledWith({data:{servicePriceCents:750,minimumEnabled:true,minimumRechargeCents:1000}}));expect(api.saveIntegration).not.toHaveBeenCalled();});
it('saving integration preserves persisted pricing instead of applying unsaved price edits',async()=>{render(<PaymentSettings/>);fireEvent.change(screen.getByLabelText(/Taxa por desbanimento permanente/),{target:{value:'99,99'}});fireEvent.click(screen.getByRole('button',{name:'Salvar integração do Mercado Pago'}));await waitFor(()=>expect(api.saveIntegration).toHaveBeenCalledWith({data:{accessToken:'',webhookSecret:'',enabled:true,liveMode:false,servicePriceCents:500,minimumEnabled:true,minimumRechargeCents:1000}}));expect(api.savePrices).not.toHaveBeenCalled();});

it('global gateway hides the service fee and preserves its latest value when saving the minimum',async()=>{
 api.getPrices.mockResolvedValue({servicePriceCents:850,minimumEnabled:true,minimumRechargeCents:1000});
 render(<PaymentSettings scope="gateway"/>);
 expect(screen.queryByLabelText(/Taxa por desbanimento permanente/)).toBeNull();
 expect(screen.getByRole('heading',{name:'Integração do Mercado Pago'})).toBeTruthy();
 expect(screen.getByRole('heading',{name:'Notificações de pagamento'})).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Recarga mínima (R$)'),{target:{value:'20'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar mínimo de recarga'}));
 await waitFor(()=>expect(api.savePrices).toHaveBeenCalledWith({data:{servicePriceCents:850,minimumEnabled:true,minimumRechargeCents:2000}}));
 expect(api.saveIntegration).not.toHaveBeenCalled();
});
it('service settings hide credentials and preserve the latest global minimum',async()=>{
 api.getPrices.mockResolvedValue({servicePriceCents:500,minimumEnabled:false,minimumRechargeCents:2500});
 render(<PaymentSettings scope="service"/>);
 expect(screen.queryByLabelText('Recarga mínima (R$)')).toBeNull();
 expect(screen.queryByLabelText('Access Token')).toBeNull();
 expect(screen.queryByRole('heading',{name:'Notificações de pagamento'})).toBeNull();
 fireEvent.change(screen.getByLabelText(/Taxa por desbanimento permanente/),{target:{value:'7,50'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar taxa de desbanimento'}));
 await waitFor(()=>expect(api.savePrices).toHaveBeenCalledWith({data:{servicePriceCents:750,minimumEnabled:false,minimumRechargeCents:2500}}));
 expect(api.saveIntegration).not.toHaveBeenCalled();
});
it('integration save preserves fresh global and service prices',async()=>{
 api.getPrices.mockResolvedValue({servicePriceCents:990,minimumEnabled:false,minimumRechargeCents:2000});
 render(<PaymentSettings scope="gateway"/>);
 fireEvent.click(screen.getByRole('button',{name:'Salvar integração do Mercado Pago'}));
 await waitFor(()=>expect(api.saveIntegration).toHaveBeenCalledWith({data:{accessToken:'',webhookSecret:'',enabled:true,liveMode:false,servicePriceCents:990,minimumEnabled:false,minimumRechargeCents:2000}}));
});
