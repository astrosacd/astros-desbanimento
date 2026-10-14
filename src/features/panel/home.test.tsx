import {afterEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import type {ReactNode} from 'react';
vi.mock('@tanstack/react-router',()=>({useRouteContext:()=>({client:{name:'Maria Costa'}}),Link:({children,to}: {children:ReactNode;to:string})=><a href={to}>{children}</a>}));
import {ClientHome,AdminHome} from './home';
afterEach(cleanup);
it('client entrance shows the platform and directs to the dedicated service dashboard',()=>{render(<ClientHome/>);expect(screen.getByRole('heading',{name:'Olá, Maria.'})).toBeTruthy();expect(screen.getByRole('link',{name:'Acessar desbanimento'}).getAttribute('href')).toBe('/desbanimento');expect(screen.getByRole('link',{name:'Abrir atendimento'}).getAttribute('href')).toBe('/suporte');expect(screen.queryByText('Taxa por desbanimento permanente:')).toBeNull();expect(screen.queryByText('Seus números')).toBeNull();});
it('administrator explicitly selects service or shared support',()=>{const onService=vi.fn(),onSupport=vi.fn();render(<AdminHome name="Maria Costa" onService={onService} onSupport={onSupport}/>);fireEvent.click(screen.getByRole('button',{name:'Gerenciar desbanimento'}));expect(onService).toHaveBeenCalledOnce();expect(onSupport).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Gerenciar atendimento'}));expect(onSupport).toHaveBeenCalledOnce();});
