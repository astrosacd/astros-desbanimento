import { OverviewBanner } from '../banners/client';
import { BalanceSummary } from '../payments/balance-summary';
import { Link, useRouteContext } from '@tanstack/react-router';
import { ArrowUpRight, Plus, ListChecks, Headphones } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeading } from '../panel/heading';
import { StatusGuide } from '../numbers/status-guide';
import { NumbersList } from '../numbers/list';
export function DashboardPage() {
 const { client } = useRouteContext({ from: '__root__' });
 const firstName = client?.name.trim().split(/\s+/)[0] || 'Cliente';
 return <div className="overview-page"><PageHeading title="Visão geral" subtitle={`Olá, ${firstName}. Acompanhe seus números e gerencie suas solicitações.`}/>
 <OverviewBanner/><div className="overview-top"><section className="overview-welcome"><span className="eyebrow">SEU PAINEL ASTROS</span><h2>Gerencie seus números.<br/>Acompanhe cada etapa.</h2><p>Envie um número para análise e acompanhe o andamento das suas solicitações pelo painel.</p><Button asChild><Link to="/nova-solicitacao"><Plus size={18}/>Enviar número<ArrowUpRight size={17}/></Link></Button></section><div className="overview-wallet"><BalanceSummary/></div></div>
 <nav className="overview-shortcuts" aria-label="Atalhos da visão geral"><Link to="/solicitacoes" className="overview-shortcut"><span className="overview-shortcut-icon"><ListChecks size={22}/></span><div><h2>Histórico de solicitações</h2><p>Consulte envios, datas e cobranças.</p></div><ArrowUpRight size={18} aria-hidden="true"/></Link><Link to="/suporte" className="overview-shortcut"><span className="overview-shortcut-icon"><Headphones size={22}/></span><div><h2>Central de suporte</h2><p>Converse com a equipe da Astros.</p></div><ArrowUpRight size={18} aria-hidden="true"/></Link></nav>
 <NumbersList/>
 <StatusGuide/>
 </div>;
}
