import {expect,it,vi,beforeEach} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const mocks=vi.hoisted(()=>({getAdminCountries:vi.fn(),updateCountry:vi.fn(),removeCountry:vi.fn()}));
vi.mock('./actions',()=>mocks);
import {CountrySettings} from './admin';
beforeEach(()=>{vi.resetAllMocks();mocks.getAdminCountries.mockResolvedValue([]);mocks.updateCountry.mockResolvedValue({id:'saved'});});
it('shows a readable inline DDI error without submitting and allows correction',async()=>{render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><CountrySettings adminId="admin"/></QueryClientProvider>);await screen.findByText('Nenhum país adicional cadastrado.');fireEvent.change(screen.getByLabelText('Nome do país'),{target:{value:'Teste'}});fireEvent.change(screen.getByLabelText('DDI, sem +'),{target:{value:'000'}});fireEvent.click(screen.getByRole('button',{name:'Adicionar país'}));expect(screen.getByRole('alert')).toHaveTextContent('sem zero no início');expect(document.body.textContent).not.toContain('invalid_string');expect(mocks.updateCountry).not.toHaveBeenCalled();fireEvent.change(screen.getByLabelText('DDI, sem +'),{target:{value:'999'}});fireEvent.click(screen.getByRole('button',{name:'Adicionar país'}));await waitFor(()=>expect(mocks.updateCountry).toHaveBeenCalledWith({data:{name:'Teste',ddi:'999'}}));});
