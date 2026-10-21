import {useQuery} from '@tanstack/react-query';
import {Wallet,RefreshCw,ExternalLink} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {smsProviderBalance} from './actions';
import {SmsFieldHelp} from './field-help';
export type SmsSupplier='smspool'|'five_sim';
export function SmsSupplierBalance({adminId,supplier}:{adminId:string;supplier?:SmsSupplier}){
 if(supplier)return <SupplierBalanceCard adminId={adminId} supplier={supplier}/>;
 return <div className="sms-supplier-grid" aria-label="Saldos independentes dos fornecedores"><SupplierBalanceCard adminId={adminId} supplier="smspool"/><SupplierBalanceCard adminId={adminId} supplier="five_sim"/></div>;
}
function SupplierBalanceCard({adminId,supplier}:{adminId:string;supplier:SmsSupplier}){
 const five=supplier==='five_sim',name=five?'5SIM':'SMSPool';
 const q=useQuery({queryKey:['sms-supplier-balance',adminId,supplier],queryFn:()=>smsProviderBalance({data:{supplier}}),retry:false,refetchInterval:60000,refetchIntervalInBackground:false});
 const valid=q.data&&(q.data.currency==='USD'||five&&q.data.currency==='5SIM')&&Number.isSafeInteger(q.data.balanceUnits)&&q.data.balanceUnits>=0;
 const unavailable=q.isError||!q.isPending&&!valid;
 const format=(units:number)=>(units/1000000).toLocaleString('pt-BR',{style:'currency',currency:'USD',maximumFractionDigits:6});
 return <section className="sms-supplier-balance sms-independent-balance" aria-label={`Saldo ${name}`}>
  <div className="sms-supplier-title"><span className="sms-supplier-icon"><Wallet size={22}/></span><div><span className="eyebrow">CONTA DO FORNECEDOR</span><div className="sms-field-title"><h2>Saldo {name}</h2><SmsFieldHelp label={`Saldo ${name}`} help={`Saldo disponível na sua conta do ${name}. Serve para comprar números nesse fornecedor e é separado da carteira dos clientes e do outro fornecedor. Recarregar um não abastece o outro.`}/></div><p>{five?'Dólares disponíveis na conta 5SIM.':'Dólares disponíveis na API SMSPool.'}</p></div></div>
  <div className="sms-supplier-data"><div aria-live="polite"><span className="sms-label">{unavailable?'Saldo não confirmado':'Disponível nesta conta'}</span><strong>{q.isPending?'Consultando…':unavailable?'Indisponível':format(q.data!.balanceUnits)}</strong>{valid&&!unavailable&&<p className="sms-help">Atualizado em {new Date(q.data!.checkedAt).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'})}</p>}</div></div>
  <div className="sms-actions"><Button type="button" variant="outline" disabled={q.isFetching} onClick={()=>q.refetch()}><RefreshCw size={16} className={q.isFetching?'animate-spin motion-reduce:animate-none':''}/>{q.isFetching?'Consultando…':'Atualizar saldo'}</Button><Button type="button" variant="outline" asChild><a href={five?'https://5sim.net/':'https://www.smspool.net/balance/deposit'} target="_blank" rel="noopener noreferrer">Recarregar {name}<ExternalLink size={15}/><span className="sr-only"> (abre em nova aba)</span></a></Button></div>
  {unavailable?<p className="sms-supplier-warning" role="alert">{q.isError?q.error.message:'Não foi possível validar o saldo retornado.'} Confira se a chave deste fornecedor foi salva.</p>:valid&&q.data?.lowBalance&&<p className="sms-supplier-warning" role="status">Saldo baixo: abaixo de {format(q.data.lowThresholdUnits)}. O aviso se refere somente ao {name}.</p>}
  <p className="sms-help">Consulta automática a cada minuto. Depósitos são feitos diretamente no {name}.</p>
 </section>;
}
