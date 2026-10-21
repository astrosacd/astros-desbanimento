import {useEffect,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {smsProviders,smsSelectSupplier} from './actions';
import {SmsFieldLabel,SmsFieldHelp} from './field-help';
export function SmsProvidersAdmin({adminId}:{adminId:string}){
 const cache=useQueryClient(),q=useQuery({queryKey:['sms-providers',adminId],queryFn:()=>smsProviders(),retry:false});
 const [dirty,setDirty]=useState(false),[supplier,setSupplier]=useState<'smspool'|'five_sim'>('smspool'),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{if(q.data&&!dirty){setSupplier(q.data.supplier);setEnabled(q.data.enabled);}},[q.data,dirty]);
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{
  await smsSelectSupplier({data:{supplier,enabled}});setDirty(false);
  await Promise.all(['sms-providers','sms-admin-settings','sms-admin-catalog','sms-catalog','sms-supplier-balance'].map(key=>cache.invalidateQueries({queryKey:[key]})));
  setMessage('Funcionamento atualizado. Pedidos anteriores continuam no fornecedor de origem.');
 }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.');}finally{setBusy(false);}}
 return <section className="sms-purchase sms-routing-card"><div className="sms-section-heading"><div><span className="eyebrow">1 · FUNCIONAMENTO DO SERVIÇO</span><h2>Controle de novas compras</h2><p>Ative ou pause as compras aqui e escolha quem fornece os novos números.</p></div></div>
  {q.isPending?<p role="status">Carregando funcionamento…</p>:q.isError?<p role="alert" className="error-text">{q.error.message}</p>:<>
   <div className="sms-routing-status" aria-label="Funcionamento salvo"><span data-enabled={q.data?.enabled}>{q.data?.enabled?'Compras liberadas':'Compras pausadas'}</span><strong>Fornecedor salvo: {q.data?.supplier==='five_sim'?'5SIM':'SMSPool'}</strong><span>Acompanhamento automático: {q.data?.workerReady?'em funcionamento':'aguardando execução'}</span></div>
   <form onSubmit={save} onChange={()=>setDirty(true)}><fieldset disabled={busy} className="sms-routing-fields"><div><SmsFieldLabel htmlFor="sms-supplier" label="Fornecedor das novas compras" help="Escolha SMSPool ou 5SIM. A escolha só passa a valer ao salvar. Catálogo, preço e novas compras usarão esse fornecedor. Pedidos já comprados continuam no fornecedor original; não há troca automática se faltar estoque."/><select id="sms-supplier" className="field" value={supplier} onChange={e=>setSupplier(e.target.value as 'smspool'|'five_sim')}><option value="smspool">SMSPool</option><option value="five_sim">5SIM</option></select></div>
   <div className="sms-routing-toggle"><div className="sms-field-title"><label htmlFor="sms-purchases-enabled"><input id="sms-purchases-enabled" type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Permitir novas compras de SMS</label><SmsFieldHelp label="Permitir novas compras de SMS" help="Este é o único controle para liberar novas compras nas configurações. Marcado: o cliente pode comprar pelo fornecedor escolhido, se a configuração estiver pronta. Desmarcado: pausa novas compras. Pedidos antigos continuam recebendo acompanhamento e podem ser consultados."/></div><p className="sms-help">Salve abaixo para aplicar. Configurar uma API não ativa as compras.</p></div></fieldset>
   <div className="sms-save-bar"><p>{dirty?'Alteração ainda não aplicada.':'Cada pedido existente continua no fornecedor em que foi comprado.'}</p><Button type="submit" disabled={busy}>{busy?'Salvando…':'Salvar funcionamento'}</Button></div></form>
  </>}{error&&<p role="alert" className="error-text mt-4">{error}</p>}{message&&<p role="status" className="sms-help mt-4">{message}</p>}
 </section>;
}
