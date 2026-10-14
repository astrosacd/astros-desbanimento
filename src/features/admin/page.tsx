import {useQueryClient} from '@tanstack/react-query';
import {getPaymentSettings,getAdminPrices} from '../payments/actions';
import {getPanelAddress} from '../panel-address/actions';
import {AdminHome} from '../panel/home';
import {ServiceNavGroup} from '@/components/navigation/service-nav-group';
import {ApiLogs} from '../client-api/logs';
import {ClientBalances} from '../clients/admin';
import { BannerSettings } from '../banners/admin';
import {SupportSettings} from '../support/admin';
import {AdminSubmissionHistory} from '../submissions/admin-history';
import {AdminSubmissions} from '../submissions/admin';
import {CountrySettings} from '../countries/admin';
import { NoticeSettings } from '../notices/admin';
import { PaymentHistory } from '../payments/admin-history';
import {PanelAddressSettings} from '../panel-address/admin';
import { PaymentSettings } from '../payments/admin-settings';
import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { ShieldCheck, LockKeyhole, LogOut, ArrowLeft, Settings2, LayoutDashboard, Eye, EyeOff, ReceiptText, ArrowUpRight, CreditCard, Bell, Globe2, Headphones, Users, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {Sheet,SheetContent,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import { Wordmark } from '@/features/demo/shell';
import { loginAdmin, logoutAdmin } from './auth';
import type { AdminSession } from './auth.server';
export function AdminArea({ session }: { session: AdminSession }) {
  const router = useRouter();
  const queryClient=useQueryClient();
  function warmSection(id:string){if(id!=='settings'||!session.admin)return;void queryClient.prefetchQuery({queryKey:['admin-payment-settings'],queryFn:()=>getPaymentSettings(),staleTime:15000});void queryClient.prefetchQuery({queryKey:['admin-prices'],queryFn:()=>getAdminPrices(),staleTime:15000});void queryClient.prefetchQuery({queryKey:['panel-address',session.admin.id],queryFn:()=>getPanelAddress(),staleTime:15000});}

  const [serviceOpen,setServiceOpen]=useState(false);
  const [mobileMenu,setMobileMenu]=useState(false);
  const menuTrigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{const media=window.matchMedia('(min-width:851px)');const close=()=>{if(media.matches)setMobileMenu(false);};media.addEventListener('change',close);return ()=>media.removeEventListener('change',close);},[]);
  const [section,setSection]=useState<'home'|'overview'|'payments'|'settings'|'notices'|'countries'|'submissions'|'history'|'support'|'clients'|'apiLogs'>('home');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [visible, setVisible] = useState(false);
  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await loginAdmin({ data: { email, password } }); setPassword(''); await router.invalidate(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível acessar. Tente novamente.'); setPassword(''); }
    finally { setBusy(false); }
  }
  async function logout() { setBusy(true); setError(''); try { await logoutAdmin(); await router.invalidate(); } catch { setError('Não foi possível sair. Tente novamente.'); } finally { setBusy(false); } }
  if (!session.admin) return <main className="admin-login"><Link to="/" className="admin-back"><ArrowLeft size={16}/>Voltar ao painel do cliente</Link><section className="admin-login-card"><Wordmark/><div className="admin-lock"><LockKeyhole/></div><span className="eyebrow">ACESSO RESTRITO</span><h1>Área administrativa</h1><p>Entre com sua conta de administrador para acessar a gestão do painel.</p>{!session.configured && <div className="notice">O login ainda aguarda a conexão com seu Supabase. O acesso permanece bloqueado.</div>}<form onSubmit={login}><label className="field-label" htmlFor="admin-email">E-mail</label><input id="admin-email" type="email" className="field" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} required disabled={busy}/><label className="field-label" htmlFor="admin-password">Senha</label><div className="admin-password"><input id="admin-password" type={visible?'text':'password'} className="field" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} maxLength={256} required disabled={busy}/><button type="button" aria-label={visible?'Ocultar senha':'Mostrar senha'} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div><p role="alert" className="error-text">{error || session.error}</p><Button type="submit" className="w-full mt-6 min-h-11" disabled={busy || !session.configured}>{busy?'Verificando acesso…':'Entrar na administração'}</Button></form><div className="admin-login-foot"><ShieldCheck size={15}/>Somente contas com permissão administrativa.</div></section></main>;
  const sections=[{id:'home' as const,title:'Início',Icon:LayoutDashboard},{id:'overview' as const,title:'Visão geral',Icon:LayoutDashboard},{id:'clients' as const,title:'Gestão de contas',Icon:Users},{id:'apiLogs' as const,title:'Logs da API',Icon:ReceiptText},{id:'payments' as const,title:'Histórico de pagamentos',Icon:ReceiptText},{id:'settings' as const,title:'Configurações',Icon:Settings2},{id:'notices' as const,title:'Comunicados',Icon:Bell},{id:'support' as const,title:'Central de suporte',Icon:Headphones},{id:'countries' as const,title:'Países e DDIs',Icon:Globe2},{id:'history' as const,title:'Histórico de solicitações',Icon:ReceiptText},{id:'submissions' as const,title:'Envios em conferência',Icon:ReceiptText}];
  const sidebar=()=> <><Wordmark/><span className="admin-role"><ShieldCheck size={14}/>ADMINISTRAÇÃO</span><nav aria-label="Menu administrativo"><button type="button" className="nav-link admin-nav-button" data-status={section==='home'?'active':undefined} aria-current={section==='home'?'page':undefined} onClick={()=>{setSection('home');setMobileMenu(false);}}><LayoutDashboard size={18}/>Início</button><ServiceNavGroup open={serviceOpen} active={section!=='support'&&section!=='home'} onToggle={()=>setServiceOpen(!serviceOpen)}>{sections.filter(item=>item.id!=='support'&&item.id!=='home').map(({id,title,Icon})=><button key={id} type="button" onPointerEnter={()=>warmSection(id)} onFocus={()=>warmSection(id)} className="nav-link admin-nav-button" data-status={section===id?'active':undefined} aria-current={section===id?'page':undefined} onClick={()=>{setSection(id);setMobileMenu(false);}}><Icon size={18}/>{title}</button>)}</ServiceNavGroup><button type="button" className="nav-link admin-nav-button" data-status={section==='support'?'active':undefined} aria-current={section==='support'?'page':undefined} onClick={()=>{setSection('support');setMobileMenu(false);}}><Headphones size={18}/>Central de suporte</button></nav><div className="admin-sidebar-account"><p className="text-sm font-medium">{session.admin.name}</p><p className="text-xs text-muted-foreground mt-1 break-all">{session.admin.email}</p></div><Link to="/" className="admin-back" onClick={()=>setMobileMenu(false)}><ArrowLeft size={16}/>Painel do cliente</Link></>;
  return <div className="admin-shell"><aside className="admin-sidebar admin-desktop-sidebar">{sidebar()}</aside>
  <main className="admin-content"><header className="admin-header"><Button ref={menuTrigger} className="admin-mobile-menu" variant="outline" size="icon" aria-label="Abrir menu administrativo" onClick={()=>setMobileMenu(true)}><Menu/></Button><div><span className="eyebrow">ASTROS / ADMINISTRAÇÃO</span><h1>{sections.find(item=>item.id===section)?.title}</h1><p className="text-sm text-muted-foreground mt-2">Gestão do painel e dos recebimentos da Astros.</p></div><Button variant="outline" onClick={logout} disabled={busy}><LogOut/>Sair</Button></header>{error&&<p role="alert" className="error-text">{error}</p>}
  {section==='home'&&<AdminHome name={session.admin.name} onService={()=>{setSection('overview');setServiceOpen(true);}} onSupport={()=>setSection('support')}/>}
  {section==='overview'&&<><section className="admin-welcome"><div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider"><ShieldCheck size={17}/>Acesso administrativo</div><h2>Bem-vindo, {session.admin.name.split(/\s+/)[0]}.</h2><p>Organize os recebimentos e as configurações do serviço em um só lugar.</p><div className="flex flex-wrap gap-3 mt-5"><Button onClick={()=>setSection('payments')}><ReceiptText/>Ver pagamentos</Button><Button variant="outline" onClick={()=>setSection('settings')}><Settings2/>Configurar pagamentos</Button></div></section>
  <section className="admin-workspace"><div className="workspace-heading"><span className="eyebrow">ÁREAS DE GESTÃO</span><h2>O que você precisa gerenciar?</h2><p>Acesse os registros e as configurações do painel.</p></div><div className="admin-workspace-grid">{[
 {id:'clients' as const,title:'Gestão de contas',description:'Gerencie saldo, histórico e permissões de API por conta.',Icon:Users},
 {id:'payments' as const,title:'Pagamentos',description:'Consulte valores, clientes e situações dos pagamentos.',Icon:ReceiptText},
 {id:'history' as const,title:'Solicitações',description:'Acompanhe o histórico dos números enviados.',Icon:LayoutDashboard},
 {id:'notices' as const,title:'Comunicados',description:'Organize os avisos e as faixas informativas.',Icon:Bell},
 {id:'support' as const,title:'Atendimento',description:'Configure a central de suporte dos clientes.',Icon:Headphones},
 {id:'settings' as const,title:'Configurações',description:'Gerencie pagamentos, taxa e mínimo de recarga.',Icon:Settings2}
 ].map(({id,title,description,Icon})=><button key={id} type="button" className="admin-action-card" onClick={()=>setSection(id)}><span className="workspace-icon"><Icon size={21}/></span><div><h2>{title}</h2><p>{description}</p></div><ArrowUpRight size={18} className="workspace-arrow"/></button>)}</div></section></>}
  {section==='apiLogs'&&<ApiLogs adminId={session.admin.id}/>} {section==='clients'&&<ClientBalances adminId={session.admin.id}/>} {section==='support'&&<SupportSettings adminId={session.admin.id}/>} {section==='history'&&<AdminSubmissionHistory adminId={session.admin.id}/>} {section==='submissions'&&<AdminSubmissions adminId={session.admin.id}/>} {section==='countries'&&<CountrySettings adminId={session.admin.id}/>} {section==='notices'&&<><BannerSettings adminId={session.admin.id}/><NoticeSettings adminId={session.admin.id}/></>} {section==='payments'&&<PaymentHistory adminId={session.admin.id}/>} {section==='settings'&&<><PanelAddressSettings adminId={session.admin.id}/><PaymentSettings/></>}
  </main><Sheet open={mobileMenu} onOpenChange={setMobileMenu}><SheetContent side="left" className="admin-menu-sheet w-[min(88vw,320px)] p-0" onCloseAutoFocus={event=>{event.preventDefault();if(window.innerWidth<=850)menuTrigger.current?.focus();}}><SheetTitle className="sr-only">Menu administrativo</SheetTitle><SheetDescription className="sr-only">Navegação das áreas de administração Astros.</SheetDescription><aside className="admin-sidebar">{sidebar()}</aside></SheetContent></Sheet></div>;
}
