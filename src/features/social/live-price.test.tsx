import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {useState} from 'react';
vi.mock('./actions',()=>({socialEstimate:vi.fn(async({data}:any)=>({...data,priceCents:data.quantity===100?103:1600}))}));
import {socialEstimate} from './actions';
import {LivePrice,AverageDelivery,useSocialEstimate} from './live-price';
const service={id:1,title:'Test',network:'instagram',category:'Instagram',description:'',minimum:100,maximum:1000,refill:false,cancel:false};
afterEach(()=>{cleanup();vi.clearAllMocks();});
function Harness(){const [quantity,setQuantity]=useState('');const estimate=useSocialEstimate(service,quantity,'own',null);return <><input aria-label="Quantidade teste" value={quantity} onChange={e=>setQuantity(e.target.value)}/><LivePrice {...estimate} balance={5000} quantity={quantity}/></>;}
it('debounces quantity, hides stale totals and never estimates outside limits',async()=>{render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})}><Harness/></QueryClientProvider>);const input=screen.getByLabelText('Quantidade teste');fireEvent.change(input,{target:{value:'10'}});await new Promise(r=>setTimeout(r,500));expect(socialEstimate).not.toHaveBeenCalled();fireEvent.change(input,{target:{value:'100'}});expect(screen.getByText('Calculando…')).toBeTruthy();await screen.findByText('R$ 1,03');expect(screen.getByText('R$ 48,97')).toBeTruthy();fireEvent.change(input,{target:{value:'1000'}});expect(screen.queryByText('R$ 1,03')).toBeNull();await screen.findByText('R$ 16,00');await waitFor(()=>expect(socialEstimate).toHaveBeenCalledTimes(2));});
it('shows insufficient estimate without a negative wallet and labels average as an estimate',()=>{render(<><LivePrice price={6000} valid loading={false} error="" balance={5000} quantity="1000"/><AverageDelivery service={{...service,averageTime:'15 minutos',deliveryMetrics:{average_time:'3 dias'}}}/></>);expect(screen.getByText('Saldo insuficiente')).toBeTruthy();expect(screen.getByText('15 minutos')).toBeTruthy();expect(screen.queryByText('3 dias')).toBeNull();});
