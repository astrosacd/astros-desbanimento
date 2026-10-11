import { BalanceSummary } from '../payments/balance-summary';
import { Link, useRouteContext } from '@tanstack/react-router';
import { ArrowUpRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeading } from '../panel/heading';
import { StatusGuide } from '../numbers/status-guide';
import { NumbersList } from '../numbers/list';
export function DashboardPage() {
 const { client } = useRouteContext({ from: '__root__' });
 const firstName = client?.name.trim().split(/\s+/)[0] || 'Cliente';
 return <><PageHeading title="Central de solicitações" subtitle={`Bem-vindo, ${firstName}. Acompanhe sua operação em um só lugar.`}/>
 <section className="hero-band"><div className="hero-copy"><span className="eyebrow">ASTROS / PAINEL DE DESBANIMENTO</span><h2>Mais controle.<br/>Clareza em cada etapa.</h2><p>Seu espaço para organizar solicitações e acompanhar cada etapa com a Astros.</p><div className="flex flex-wrap gap-3"><Button asChild><Link to="/nova-solicitacao"><Plus/>Nova solicitação</Link></Button><Button asChild variant="outline"><Link to="/perfil">Meu perfil<ArrowUpRight/></Link></Button></div></div></section>
 <BalanceSummary/>
 <StatusGuide/>
 <div className="mt-7"><NumbersList/></div></>;
}
