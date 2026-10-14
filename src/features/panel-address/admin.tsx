import {useState,type FormEvent} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Globe2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {getPanelAddress,setPanelAddress} from './actions';
import {PANEL_ORIGINS} from './validation';
export function PanelAddressSettings({adminId}:{adminId:string}){
 const query=useQuery({queryKey:['panel-address',adminId],queryFn:()=>getPanelAddress(),retry:false,staleTime:15000});
 const [choice,setChoice]=useState<string|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 async function save(e:FormEvent){e.preventDefault();if(!query.data)return;setBusy(true);setError('');setMessage('');try{const origin=(choice??query.data.origin) as typeof PANEL_ORIGINS[number];await setPanelAddress({data:{origin}});const refreshed=await query.refetch();if(refreshed.isError||refreshed.data?.origin!==origin)throw Error('Endereço salvo, mas não foi possível atualizar a tela. Atualize para conferir.');setChoice(null);setMessage('Endereço principal salvo. Os próximos e-mails usarão este endereço.');}catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.');}finally{setBusy(false);}}
 return <section className="admin-settings mb-6"><div className="flex items-center gap-3"><Globe2 size={24}/><div><h2>Endereço principal do painel</h2><p className="text-sm text-muted-foreground mt-1">Escolha o acesso utilizado nos novos links de confirmação, recuperação de senha e retorno de pagamentos por link.</p></div></div>
 {query.isPending?<p role="status" className="mt-4">Carregando configuração…</p>:query.isError?<p role="alert" className="mt-4">{query.error.message}</p>:<form onSubmit={save} className="mt-5"><label htmlFor="panel-primary-origin" className="text-sm">Endereço utilizado<select id="panel-primary-origin" className="field mt-2" value={choice??query.data?.origin} onChange={e=>{setChoice(e.target.value);setMessage('');setError('');}} disabled={busy}><option value={PANEL_ORIGINS[0]}>Astros Mais — principal</option><option value={PANEL_ORIGINS[1]}>Acesso de contingência</option><option value={PANEL_ORIGINS[2]}>Endereço anterior — transição</option></select></label><p className="text-sm mt-3 break-all">{choice??query.data?.origin}</p><p className="text-xs text-muted-foreground leading-relaxed mt-3">A configuração é compartilhada pelas duas hospedagens. Ela não altera DNS nem desativa a VPS. E-mails e pagamentos por link já criados mantêm o endereço anterior. Antes de trocar, confira se o endereço escolhido abre normalmente.</p><Button className="mt-4" disabled={busy||!choice||choice===query.data?.origin}>{busy?'Salvando…':'Salvar endereço principal'}</Button></form>}
 {message&&<p role="status" className="text-sm mt-3">{message}</p>}{error&&<p role="alert" className="text-sm mt-3 text-destructive">{error}</p>}
 </section>;
}
