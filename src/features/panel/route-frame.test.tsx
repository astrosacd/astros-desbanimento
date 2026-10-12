import {expect,it,vi} from 'vitest';
import {render,screen,waitFor,act,cleanup} from '@testing-library/react';
import {createRootRoute,createRoute,createRouter,createMemoryHistory,RouterProvider} from '@tanstack/react-router';
import type {ReactNode} from 'react';
vi.mock('../demo/shell',()=>({AppShell:({children}:{children:ReactNode})=><div data-testid="client-shell">{children}</div>}));
vi.mock('sonner',()=>({Toaster:()=>null}));
import {ClientRouteFrame} from './route-frame';
function setup(initial:string,target:string){
 let release!:()=>void;const loading=new Promise<void>(resolve=>release=resolve);
 const root=createRootRoute({component:()=> <ClientRouteFrame identity={{id:'own',name:'Cliente',email:'own@example.com'}}/>});
 const routes=['/login','/','/admin'].map(path=>createRoute({getParentRoute:()=>root,path,loader:()=>path===target?loading:undefined,component:()=> <div data-testid={path==='/login'?'login-page':path==='/admin'?'admin-page':'dashboard-page'}>{path}</div>}));
 const router=createRouter({routeTree:root.addChildren(routes),history:createMemoryHistory({initialEntries:[initial]}),defaultPendingMs:100000,defaultPendingMinMs:0});
 render(<RouterProvider router={router}/>);return {router,release};
}
it('keeps the login outside the client shell while the dashboard is still loading',async()=>{const {router,release}=setup('/login','/');await screen.findByTestId('login-page');let navigation:Promise<void>;act(()=>{navigation=router.navigate({to:'/'});});await waitFor(()=>expect(router.state.location.pathname).toBe('/'));expect(screen.getByTestId('login-page')).toBeInTheDocument();expect(screen.queryByTestId('client-shell')).not.toBeInTheDocument();await act(async()=>{release();await navigation!;});expect(await screen.findByTestId('dashboard-page')).toBeInTheDocument();expect(screen.getByTestId('client-shell')).toContainElement(screen.getByTestId('dashboard-page'));expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();cleanup();});
it('keeps the dashboard layout until the login page is actually presented',async()=>{const {router,release}=setup('/','/login');await screen.findByTestId('dashboard-page');let navigation:Promise<void>;act(()=>{navigation=router.navigate({to:'/login'});});await waitFor(()=>expect(router.state.location.pathname).toBe('/login'));expect(screen.getByTestId('client-shell')).toContainElement(screen.getByTestId('dashboard-page'));await act(async()=>{release();await navigation!;});expect(await screen.findByTestId('login-page')).toBeInTheDocument();expect(screen.queryByTestId('client-shell')).not.toBeInTheDocument();cleanup();});
it('presents the admin page without squeezing it inside the client shell',async()=>{const {router,release}=setup('/','/admin');await screen.findByTestId('dashboard-page');let navigation:Promise<void>;act(()=>{navigation=router.navigate({to:'/admin'});});await waitFor(()=>expect(router.state.location.pathname).toBe('/admin'));expect(screen.getByTestId('client-shell')).toBeInTheDocument();await act(async()=>{release();await navigation!;});expect(await screen.findByTestId('admin-page')).toBeInTheDocument();expect(screen.queryByTestId('client-shell')).not.toBeInTheDocument();cleanup();});
