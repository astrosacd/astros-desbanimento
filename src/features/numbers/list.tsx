import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useRouteContext } from '@tanstack/react-router';
import { RefreshCw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { listNumbers, exportNumbers } from './actions';
export function NumbersList() {
 const { client } = useRouteContext({ from: '__root__' });
 const [page, setPage] = useState(1);
 const [search,setSearch]=useState('');const [number,setNumber]=useState('');
 const [exporting, setExporting] = useState(false);
 const [exportMessage, setExportMessage] = useState('');
 async function downloadNumbers() {
  if (exporting) return;
  setExporting(true); setExportMessage('');
  try {
   const result = await exportNumbers();
   if ('error' in result) { setExportMessage(result.error || 'Não foi possível exportar.'); return; }
   if (!result.numbers.length) { setExportMessage('Você ainda não tem números para exportar.'); return; }
   const url = URL.createObjectURL(new Blob([result.numbers.join('\r\n') + '\r\n'], { type: 'text/plain;charset=utf-8' }));
   const anchor = document.createElement('a'); anchor.href = url; anchor.download = `astros-numeros-${new Date().toISOString().slice(0, 10)}.txt`;
   document.body.appendChild(anchor); anchor.click(); anchor.remove();
   setTimeout(() => URL.revokeObjectURL(url), 1000);
   setExportMessage(`${result.numbers.length} números exportados.`);
  } catch { setExportMessage('Não foi possível exportar os números agora. Tente novamente.'); }
  finally { setExporting(false); }
 }
 const query = useQuery({ queryKey: ['own-numbers', client?.id, page, number, 10], queryFn: () => listNumbers({ data: { page, number, pageSize:10 } }), enabled: !!client, staleTime: 15000, retry: false });
 return <section className="table-section p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3 mb-5"><div><h2 className="font-semibold text-lg">Seus números</h2><p className="text-sm text-muted-foreground">{query.data && !('error' in query.data) ? `${query.data.count} registros vinculados à sua conta` : 'Acompanhe o andamento das solicitações.'}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={downloadNumbers} disabled={exporting || query.isFetching || !query.data || 'error' in query.data || query.data.count === 0}><Download/>{exporting ? 'Exportando…' : 'Exportar números'}</Button><Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw className={query.isFetching ? 'animate-spin' : ''}/>{query.isFetching ? 'Consultando…' : 'Atualizar'}</Button></div></div>
 <form className="number-search" onSubmit={e=>{e.preventDefault();setNumber(search.trim());setPage(1);}}><label htmlFor="own-number-search" className="sr-only">Pesquisar seus números</label><input id="own-number-search" className="field" type="tel" value={search} maxLength={40} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar número ou parte dele…"/><Button type="submit" variant="outline" disabled={query.isFetching}>Pesquisar</Button>{number&&<Button type="button" variant="ghost" onClick={()=>{setSearch('');setNumber('');setPage(1);}}>Limpar</Button>}</form>
 {exportMessage && <p role="status" className="mb-4 text-sm text-muted-foreground">{exportMessage}</p>}
 {query.isFetching && !query.isPending && <p role="status" className="mb-4 text-sm text-muted-foreground">Fazendo uma nova consulta ao servidor…</p>}
 {query.dataUpdatedAt > 0 && <p className="mb-4 text-xs text-muted-foreground">Última tentativa: {new Date(query.dataUpdatedAt).toLocaleTimeString('pt-BR')}</p>}
 {query.isPending ? <p role="status" className="py-10 text-center text-muted-foreground">Consultando seus números…</p> : query.isError ? <p role="alert" className="py-8 text-center text-destructive">{query.error.message}</p> : query.data && 'error' in query.data ? <p role="alert" className="py-8 text-center text-destructive">{query.data.error}</p> : !query.data?.rows.length ? <p className="py-10 text-center text-muted-foreground">{number?'Nenhum número encontrado para essa busca.':'Você ainda não tem números cadastrados.'}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm text-left"><thead><tr className="border-b text-muted-foreground"><th className="p-3">Número</th><th className="p-3">Status</th><th className="p-3">Cadastro</th><th className="p-3">Última consulta</th></tr></thead><tbody>{query.data.rows.map(row => <tr key={row.id} className="border-b"><td className="p-3 font-medium whitespace-pre-wrap">{row.number || '—'}</td><td className="p-3"><span className="inline-block rounded-full bg-secondary px-3 py-1 text-xs font-medium">{row.status.trim().toUpperCase() === 'EXCLUIDO' ? 'Processo encerrado' : row.status}</span>{row.status.trim().toUpperCase() === 'EXCLUIDO' && <div className="mt-3 max-w-xs"><p className="text-xs leading-relaxed text-muted-foreground">Se este número foi banido permanentemente novamente, uma nova solicitação exige uma nova taxa.</p><Button asChild variant="outline" size="sm" className="mt-2"><Link to="/nova-solicitacao" search={{ numero: row.number }}>Solicitar novo desbanimento</Link></Button></div>}</td><td className="p-3">{row.registeredAt || '—'}</td><td className="p-3">{row.consultedAt || '—'}</td></tr>)}</tbody></table></div>}
 {query.data && !('error' in query.data) && query.data.count > query.data.pageSize && <div className="flex items-center justify-between gap-3 mt-5"><Button variant="outline" disabled={page === 1 || query.isFetching} onClick={() => setPage(p => p - 1)}>Anterior</Button><span className="text-sm">Página {page} de {Math.ceil(query.data.count / query.data.pageSize)}</span><Button variant="outline" disabled={page * query.data.pageSize >= query.data.count || query.isFetching} onClick={() => setPage(p => p + 1)}>Próxima</Button></div>}
 </section>;
}
