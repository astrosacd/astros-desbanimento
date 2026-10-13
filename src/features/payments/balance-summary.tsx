import {Wallet} from 'lucide-react';
import { ServicePrice } from './service-price';
import { useQuery } from '@tanstack/react-query';
import { Link, useRouteContext } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { getWallet } from './actions';
export function BalanceSummary(){const {client}=useRouteContext({from:'__root__'});const query=useQuery({queryKey:['wallet',client?.id],queryFn:()=>getWallet(),retry:false,refetchInterval:15000});return <section className="form-section balance-card mt-7 flex flex-wrap items-center justify-between gap-4"><div><div className="balance-card-label"><Wallet size={18}/><p>Seu saldo disponível</p></div><strong className="text-2xl">{query.isPending?'Consultando…':query.isError?'Saldo indisponível':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(query.data!.balanceCents/100)}</strong><ServicePrice/></div><Button asChild variant="outline"><Link to="/carteira">Carteira e recargas</Link></Button></section>;}
