import {SupportSessionGuard} from '../support/session-guard';
import {Outlet,useMatches} from '@tanstack/react-router';
import {AppShell} from '../demo/shell';
import {Toaster} from 'sonner';
import type {ClientIdentity} from '../auth/session.server';
const standalonePaths=new Set(['/login','/cadastro','/recuperar-senha','/reset-password','/termos','/alterar-senha','/admin']);
export function ClientRouteFrame({identity}:{identity?:ClientIdentity|null}){
 // The requested URL can change while Outlet still presents the previous page.
 // Use the same presented route matches as Outlet to choose its surrounding layout.
 const standalone=useMatches({select:matches=>{const path=matches.at(-1)?.pathname;return matches.length<2||!path||standalonePaths.has(path)||path.startsWith('/admin/');}});
 return standalone?<Outlet/>:<><SupportSessionGuard userId={identity?.id}/><AppShell identity={identity??null}><Outlet/></AppShell><Toaster theme="dark" position="bottom-right" richColors/></>;
}
