import {useState} from 'react';
import {History,MapPinned,Building2,Layers3} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {ProspectRequests} from './history';
import {CnpjOperations} from './cnpj/ui';
export type ProspectActivitySource='all'|'maps'|'cnpj';
export function ProspectActivityHistory({userId,adminId,initialSource='all'}:{userId?:string|undefined;adminId?:string|undefined;initialSource?:ProspectActivitySource}){
 const [source,setSource]=useState<ProspectActivitySource>(initialSource);
 const id=adminId||userId;
 if(!id)return <p role="alert">Não foi possível identificar a conta para consultar o histórico.</p>;
 return <div className="prospect-activity"><section className="prospect-card prospect-activity-header"><header className="prospect-section-heading"><div><span className="eyebrow">ACOMPANHAMENTO</span><h2>Atividade da prospecção</h2><p>{adminId?'Acompanhe as consultas dos clientes, entregas e valores de cada modalidade.':'Consulte suas buscas, entregas e atualizações cadastrais em um só lugar.'}</p></div><History size={22} aria-hidden="true"/></header><div className="prospect-activity-filters" role="group" aria-label="Modalidade do histórico">{[{id:'all' as const,label:'Todas as modalidades',Icon:Layers3},{id:'maps' as const,label:'Google Maps',Icon:MapPinned},{id:'cnpj' as const,label:'CNPJ',Icon:Building2}].map(({id,label,Icon})=><Button key={id} variant={source===id?'default':'outline'} aria-pressed={source===id} onClick={()=>setSource(id)}><Icon size={16} aria-hidden="true"/>{label}</Button>)}</div><p className="prospect-help">{source==='all'?'Os registros estão separados por modalidade, cada uma com sua própria paginação.':source==='cnpj'?'Inclui pesquisa por filtros, consulta por CNPJ, atualização cadastral e dados complementares.':'Inclui buscas por nicho e localização, fila de processamento e entregas.'}</p></section><div className="prospect-activity-results">{source!=='cnpj'&&<ProspectRequests userId={userId} adminId={adminId} title="Buscas Google Maps"/>}{source!=='maps'&&<div className="prospect-activity-cnpj"><CnpjOperations userId={id} admin={!!adminId}/></div>}</div></div>;
}
