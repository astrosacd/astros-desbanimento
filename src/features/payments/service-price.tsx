import { useQuery } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { getPaymentPrices } from './actions';
export function ServicePrice(){const {client}=useRouteContext({from:'__root__'});const query=useQuery({queryKey:['payment-prices',client?.id],queryFn:()=>getPaymentPrices(),retry:false,refetchInterval:30000});return <p className="mt-3 text-sm text-muted-foreground">Taxa por desbanimento permanente: <strong className="text-foreground">{query.isPending?'Consultando…':query.isError?'Indisponível':query.data!.servicePriceCents>0?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(query.data!.servicePriceCents/100):'Ainda não configurada'}</strong></p>;}
