import {DigitalResearchAdmin} from '../digital-research/admin';
import {Compass} from 'lucide-react';
import {AdminPanels} from './panels';
import {adminSectionInfo} from './section-info';
import './organization.css';
import {UpdatesAdmin} from '../updates/admin';
import {AffiliateAdmin} from '../affiliates/admin';
import {StatusAdmin} from '../service-status/admin';
import {ModuleControls} from '../module-access/admin';
import {PwaInstallButton} from "@/features/pwa/provider";
import {ProspectingAdmin} from '../prospecting/admin';
import {Search} from 'lucide-react';
import {AssistantAdmin} from '../assistant/page';import {Bot} from 'lucide-react';
import {SocialAdmin} from '../social/admin';
import {Share2} from 'lucide-react';
import {FinanceDashboard} from '../finance/admin';
import {SmsAdmin} from '../sms/admin';
import {MessageSquare} from 'lucide-react';
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
import { ShieldCheck, LockKeyhole, LogOut, ArrowLeft, Settings2, LayoutDashboard, Eye, EyeOff, ReceiptText, ArrowUpRight, CreditCard, Bell, Globe2, Headphones, Users, Menu, LoaderCircle, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {Sheet,SheetContent,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import { Wordmark } from '@/features/demo/shell';
import { loginAdmin, logoutAdmin } from './auth';
import type { AdminSession } from './auth.server';
export function AdminArea({ session }: { session: AdminSession }) {
  const router = useRouter();
  const queryClient=useQueryClient();
  function warmSection(id:string){if((id!=='settings'&&id!=='gateway')||!session.admin)return;void queryClient.prefetchQuery({queryKey:['admin-payment-settings'],queryFn:()=>getPaymentSettings(),staleTime:15000});void queryClient.prefetchQuery({queryKey:['admin-prices'],queryFn:()=>getAdminPrices(),staleTime:15000});void queryClient.prefetchQuery({queryKey:['panel-address',session.admin.id],queryFn:()=>getPanelAddress(),staleTime:15000});}

  const [digitalOpen,setDigitalOpen]=useState(false);
  const [prospectOpen,setProspectOpen]=useState(false);
  const [socialOpen,setSocialOpen]=useState(false);
  const [smsOpen,setSmsOpen]=useState(false);
  const [paymentsOpen,setPaymentsOpen]=useState(false);
  const [serviceOpen,setServiceOpen]=useState(false);
  const [mobileMenu,setMobileMenu]=useState(false);
  const menuTrigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{const media=window.matchMedia('(min-width:851px)');const close=()=>{if(media.matches)setMobileMenu(false);};media.addEventListener('change',close);return ()=>media.removeEventListener('change',close);},[]);
  const [section,setSection]=useState<'home'|'overview'|'payments'|'settings'|'notices'|'countries'|'submissions'|'history'|'support'|'clients'|'apiLogs'|'sms'|'social'|'gateway'|'finance'|'assistant'|'prospect'|'modules'|'serviceStatus'|'affiliates'|'panelAddress'|'updates'|'digital'>('home');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [visible, setVisible] = useState(false);
  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setOpening(false); setError('');
    try { await loginAdmin({ data: { email, password } }); setPassword(''); setOpening(true); await router.invalidate({ sync: true }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível acessar. Tente novamente.'); setPassword(''); }
    finally { setBusy(false); setOpening(false); }
  }
  async function logout() { setBusy(true); setError(''); try { await logoutAdmin(); await router.invalidate(); } catch { setError('Não foi possível sair. Tente novamente.'); } finally { setBusy(false); } }
  if (!session.admin) return <main className="admin-login"><Link to="/" className="admin-back"><ArrowLeft size={16}/>Voltar ao painel do cliente</Link><section className="admin-login-card"><Wordmark/><div className="admin-lock"><LockKeyhole/></div><span className="eyebrow">ACESSO RESTRITO</span><h1>Área administrativa</h1><p>Entre com sua conta de administrador para acessar a gestão do painel.</p>{!session.configured && <div className="notice">O login ainda aguarda a conexão com seu Supabase. O acesso permanece bloqueado.</div>}<form onSubmit={login} aria-busy={busy}><label className="field-label" htmlFor="admin-email">E-mail</label><input id="admin-email" type="email" className="field" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} required disabled={busy}/><label className="field-label" htmlFor="admin-password">Senha</label><div className="admin-password"><input id="admin-password" type={visible?'text':'password'} className="field" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} maxLength={256} required disabled={busy}/><button type="button" aria-label={visible?'Ocultar senha':'Mostrar senha'} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div><p role="alert" className="error-text">{error || session.error}</p><Button type="submit" className="w-full mt-6 min-h-11" disabled={busy || !session.configured}>{busy&&<LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true"/>}{busy?(opening?'Abrindo administração…':'Verificando acesso…'):'Entrar na administração'}</Button>{busy&&<p role="status" className="text-sm text-muted-foreground mt-3 text-center">{opening?'Acesso confirmado. Aguarde enquanto abrimos o painel.':'Validando sua conta e permissão administrativa…'}</p>}</form><div className="admin-login-foot"><ShieldCheck size={15}/>Somente contas com permissão administrativa.</div></section></main>;
  const admin=session.admin;
  const sections=[{id:'digital' as const,title:'Pesquisa digital',Icon:Compass},{id:'updates' as const,title:'Novidades',Icon:Bell},{id:'panelAddress' as const,title:'Endereço do painel',Icon:Globe2},{id:'affiliates' as const,title:'Afiliação',Icon:Users},{id:'serviceStatus' as const,title:'Status dos serviços',Icon:Globe2},{id:'modules' as const,title:'Controle de módulos',Icon:Settings2},{id:'assistant' as const,title:'Assistente ASTRA',Icon:Bot},{id:'home' as const,title:'Início',Icon:LayoutDashboard},{id:'overview' as const,title:'Visão geral',Icon:LayoutDashboard},{id:'clients' as const,title:'Gestão de contas',Icon:Users},{id:'apiLogs' as const,title:'Logs da API',Icon:ReceiptText},{id:'payments' as const,title:'Histórico de pagamentos',Icon:ReceiptText},{id:'settings' as const,title:'Configurações do desbanimento',Icon:Settings2},{id:'gateway' as const,title:'Gateway de pagamentos',Icon:CreditCard},{id:'finance' as const,title:'Dashboard financeiro',Icon:LayoutDashboard},{id:'notices' as const,title:'Comunicados',Icon:Bell},{id:'support' as const,title:'Central de suporte',Icon:Headphones},{id:'countries' as const,title:'Países e DDIs',Icon:Globe2},{id:'history' as const,title:'Histórico de solicitações',Icon:ReceiptText},{id:'submissions' as const,title:'Envios em conferência',Icon:ReceiptText}];
  const adminLink=(id: typeof section, label:string, Icon:typeof Users) => <button type="button" className="nav-link admin-nav-button" data-status={section===id?'active':undefined} aria-current={section===id?'page':undefined} onPointerEnter={()=>warmSection(id)} onFocus={()=>warmSection(id)} onClick={()=>{setSection(id);setMobileMenu(false);}}><Icon size={18}/>{label}</button>;
  const sidebar=()=> <><Wordmark/><span className="admin-role"><ShieldCheck size={14}/>ADMINISTRAÇÃO</span><nav aria-label="Menu administrativo">
    {adminLink('home','Início',LayoutDashboard)}
    <div className="nav-section-label">Clientes</div>
    {adminLink('clients','Gestão de contas',Users)}{adminLink('affiliates','Afiliação',Users)}
    <div className="nav-section-label">Serviços</div>
    <ServiceNavGroup open={serviceOpen} active={['overview','apiLogs','settings','countries','history','submissions'].includes(section)} onToggle={()=>setServiceOpen(!serviceOpen)}>
      {adminLink('overview','Visão geral',LayoutDashboard)}{adminLink('history','Histórico de solicitações',ReceiptText)}{adminLink('submissions','Envios em conferência',ReceiptText)}{adminLink('settings','Configurações do desbanimento',Settings2)}{adminLink('countries','Países e DDIs',Globe2)}{adminLink('apiLogs','Logs da API',ReceiptText)}
    </ServiceNavGroup>
    <ServiceNavGroup label="Ativações SMS" Icon={MessageSquare} open={smsOpen} active={section==='sms'} onToggle={()=>setSmsOpen(!smsOpen)}><button type="button" className="nav-link admin-nav-button" data-status={section==='sms'?'active':undefined} onClick={()=>{setSection('sms');setMobileMenu(false);}}><MessageSquare size={18}/>Gestão de ativações</button></ServiceNavGroup><ServiceNavGroup label="Redes sociais" Icon={Share2} open={socialOpen} active={section==='social'} onToggle={()=>setSocialOpen(!socialOpen)}><button type="button" className="nav-link admin-nav-button" data-status={section==='social'?'active':undefined} onClick={()=>{setSection('social');setMobileMenu(false);}}><Share2 size={18}/>Gestão de serviços</button></ServiceNavGroup><ServiceNavGroup label="Prospecção" Icon={Search} open={prospectOpen} active={section==='prospect'} onToggle={()=>setProspectOpen(!prospectOpen)}><button type="button" className="nav-link admin-nav-button" data-status={section==='prospect'?'active':undefined} onClick={()=>{setSection('prospect');setMobileMenu(false);}}><Search size={18}/>Gestão de prospecção</button></ServiceNavGroup>
    <ServiceNavGroup label="Pesquisa digital" Icon={Compass} open={digitalOpen} active={section==='digital'} onToggle={()=>setDigitalOpen(!digitalOpen)}>{adminLink('digital','Gestão de pesquisas',Compass)}</ServiceNavGroup>
    <div className="nav-section-label">Financeiro</div>
    <ServiceNavGroup label="Pagamentos" Icon={CreditCard} open={paymentsOpen} active={['gateway','payments','finance'].includes(section)} onToggle={()=>setPaymentsOpen(!paymentsOpen)}>
      {adminLink('finance','Dashboard financeiro',LayoutDashboard)}{adminLink('gateway','Gateway e recargas',CreditCard)}{adminLink('payments','Histórico de pagamentos',ReceiptText)}
    </ServiceNavGroup>
    <div className="nav-section-label">Operação</div>
    {adminLink('panelAddress','Endereço do painel',Globe2)}{adminLink('serviceStatus','Status dos serviços',Globe2)}{adminLink('modules','Controle de módulos',Settings2)}{adminLink('notices','Comunicados',Bell)}{adminLink('updates','Novidades',Bell)}{adminLink('assistant','Assistente ASTRA',Bot)}
    <div className="nav-section-label">Conta e atendimento</div>
    {adminLink('support','Central de suporte',Headphones)}<Link to="/perfil" className="nav-link admin-nav-button" onClick={()=>setMobileMenu(false)}><UserRound size={18}/>Perfil</Link><PwaInstallButton/>
  </nav><div className="admin-sidebar-account"><p className="text-sm font-medium">{admin.name}</p><p className="text-xs text-muted-foreground mt-1 break-all">{admin.email}</p></div><Link to="/" className="admin-back" onClick={()=>setMobileMenu(false)}><ArrowLeft size={16}/>Painel do cliente</Link></>;
  return <div className="admin-shell"><aside className="admin-sidebar admin-desktop-sidebar">{sidebar()}</aside>
  <main className="admin-content admin-organized" data-admin-section={section}><header className="admin-header"><Button ref={menuTrigger} className="admin-mobile-menu" variant="outline" size="icon" aria-label="Abrir menu administrativo" onClick={()=>setMobileMenu(true)}><Menu/></Button><div><span className="eyebrow">ADMINISTRAÇÃO / {adminSectionInfo[section]?.group??'Astros Mais'}</span><h1>{section==='prospect'?'Prospecção':section==='social'?'Redes sociais':section==='sms'?'Ativações SMS':sections.find(item=>item.id===section)?.title}</h1><p className="text-sm text-muted-foreground mt-2">{adminSectionInfo[section]?.description}</p></div><Button variant="outline" onClick={logout} disabled={busy}><LogOut/>Sair</Button></header>{error&&<p role="alert" className="error-text">{error}</p>}
  {section==='digital'&&<DigitalResearchAdmin adminId={admin.id}/>}
  {section==='prospect'&&<ProspectingAdmin adminId={admin.id}/>}
  {section==='assistant'&&<AssistantAdmin/>}{section==='updates'&&<UpdatesAdmin adminId={admin.id}/>}
  {section==='home'&&<AdminHome adminId={session.admin.id} name={admin.name} onService={()=>{setSection('overview');setServiceOpen(true);}} onProspect={()=>{setSection('prospect');setProspectOpen(true);}} onSocial={()=>{setSection('social');setSocialOpen(true);}} onSms={()=>{setSection('sms');setSmsOpen(true);}} onSupport={()=>setSection('support')}/>}
  {section==='overview'&&<><section className="admin-welcome"><div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider"><ShieldCheck size={17}/>Acesso administrativo</div><h2>Bem-vindo, {admin.name.split(/\s+/)[0]}.</h2><p>Organize os recebimentos e as configurações do serviço em um só lugar.</p><div className="flex flex-wrap gap-3 mt-5"><Button onClick={()=>{setSection('payments');setPaymentsOpen(true);}}><ReceiptText/>Ver pagamentos</Button><Button variant="outline" onClick={()=>{setSection('gateway');setPaymentsOpen(true);}}><CreditCard/>Configurar pagamentos</Button></div></section>
  <section className="admin-workspace"><div className="workspace-heading"><span className="eyebrow">ÁREAS DE GESTÃO</span><h2>O que você precisa gerenciar?</h2><p>Acesse os registros e as configurações do painel.</p></div><div className="admin-workspace-grid">{[
 {id:'clients' as const,title:'Gestão de contas',description:'Gerencie saldo, histórico e permissões de API por conta.',Icon:Users},
 {id:'history' as const,title:'Solicitações',description:'Acompanhe o histórico dos números enviados.',Icon:LayoutDashboard},
 {id:'support' as const,title:'Atendimento',description:'Configure a central de suporte dos clientes.',Icon:Headphones},
 {id:'settings' as const,title:'Configurações',description:'Defina a taxa cobrada pelo desbanimento.',Icon:Settings2}
 ].map(({id,title,description,Icon})=><button key={id} type="button" className="admin-action-card" onClick={()=>setSection(id)}><span className="workspace-icon"><Icon size={21}/></span><div><h2>{title}</h2><p>{description}</p></div><ArrowUpRight size={18} className="workspace-arrow"/></button>)}</div></section></>}
  {section==='affiliates'&&<AffiliateAdmin adminId={admin.id}/>} {section==='serviceStatus'&&<StatusAdmin adminId={admin.id}/>} {section==='social'&&<SocialAdmin adminId={session.admin.id}/>} {section==='sms'&&<SmsAdmin adminId={session.admin.id}/>} {section==='modules'&&<ModuleControls adminId={admin.id}/>} {section==='apiLogs'&&<ApiLogs adminId={session.admin.id}/>} {section==='clients'&&<ClientBalances adminId={session.admin.id}/>} {section==='support'&&<SupportSettings adminId={session.admin.id}/>} {section==='history'&&<AdminSubmissionHistory adminId={session.admin.id}/>} {section==='submissions'&&<AdminSubmissions adminId={session.admin.id}/>} {section==='countries'&&<CountrySettings adminId={session.admin.id}/>} {section==='notices'&&<AdminPanels label="Organização dos comunicados" items={[{id:'highlights',label:'Destaque no painel',description:'Mensagem de destaque',content:<BannerSettings adminId={admin.id}/>},{id:'notices',label:'Comunicados',description:'Publicações e histórico',content:<NoticeSettings adminId={admin.id}/>} ]}/>} {section==='payments'&&<PaymentHistory adminId={session.admin.id}/>} {section==='finance'&&<FinanceDashboard adminId={session.admin.id}/>} {section==='gateway'&&<><section className="admin-welcome"><h2>Pagamentos para toda a Astros Mais</h2><p>Uma integração do Mercado Pago para receber recargas. O saldo da carteira é compartilhado entre desbanimento, ativações SMS e serviços futuros integrados à carteira.</p></section><PaymentSettings scope="gateway"/></>} {section==='panelAddress'&&<PanelAddressSettings adminId={session.admin.id}/>} {section==='settings'&&<PaymentSettings scope="service"/>}
  </main><Sheet open={mobileMenu} onOpenChange={setMobileMenu}><SheetContent side="left" className="admin-menu-sheet w-[min(88vw,320px)] p-0" onCloseAutoFocus={event=>{event.preventDefault();if(window.innerWidth<=850)menuTrigger.current?.focus();}}><SheetTitle className="sr-only">Menu administrativo</SheetTitle><SheetDescription className="sr-only">Navegação das áreas de administração Astros.</SheetDescription><aside className="admin-sidebar">{sidebar()}</aside></SheetContent></Sheet></div>;
}
