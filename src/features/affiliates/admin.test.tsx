import {beforeEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const m=vi.hoisted(()=>({getAffiliateSettings:vi.fn(),saveAffiliateSettings:vi.fn(),saveAffiliateAccount:vi.fn(),getAdminAffiliation:vi.fn(),runAffiliates:vi.fn()}));
vi.mock('./actions',()=>m);
import {AffiliateAdmin} from './admin';
beforeEach(()=>{cleanup();vi.resetAllMocks();m.getAffiliateSettings.mockResolvedValue({enabled:true,rateBps:3000,minimumCents:0,maximumCents:0,pendingCount:0,errorCount:0,workerAt:null});});
it('preserves the commission draft and does not run or save when navigating',async()=>{render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><AffiliateAdmin adminId="admin"/></QueryClientProvider>);const rate=await screen.findByRole('textbox',{name:/Comissão global/});fireEvent.change(rate,{target:{value:'35'}});fireEvent.keyDown(screen.getByRole('tab',{name:/Conferência/}),{key:'Enter'});expect(screen.getByRole('button',{name:'Executar conferência agora'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Salvar regras'})).toBeNull();fireEvent.keyDown(screen.getByRole('tab',{name:/Regras de comissão/}),{key:'Enter'});expect(screen.getByRole('textbox',{name:/Comissão global/})).toHaveProperty('value','35');expect(m.saveAffiliateSettings).not.toHaveBeenCalled();expect(m.runAffiliates).not.toHaveBeenCalled();expect(m.getAffiliateSettings).toHaveBeenCalledOnce();});
