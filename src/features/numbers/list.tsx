import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { listNumbers } from './actions';
export function NumbersList() {
 const { client } = useRouteContext({ from: '__root__' });
 const [page, setPage] = useState(1);
 const query = useQuery({ queryKey: ['own-numbers', client?.id, page], queryFn: () => listNumbers({ data: { page } }), enabled: !!client, staleTime: 15000, retry: false });
 return <section className="table-section p-4 sm:p-6"><div className="flex items-center justify-between gap-3 mb-5"><div><h2 className="font-semibold text-lg">Seus números</h2><p className="text-sm text-muted-foreground">{query.data && !('error' in query.data) ? `${query.data.count} registros vinculados à sua conta` : 'Acompanhe o andamento das solicitações.'}</p></div><Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw className={query.isFetching ? 'animate-spin' : ''}/>Atualizar</Button></div>
 {query.isPending ? <p role="status" className="py-10 text-center text-muted-foreground">Consultando seus números…</p> : query.isError ? <p role="alert" className="py-8 text-center text-destructive">{query.error.message}</p> : query.data && 'error' in query.data ? <p role="alert" className="py-8 text-center text-destructive">{query.data.error}</p> : !query.data?.rows.length ? <p className="py-10 text-center text-muted-foreground">Você ainda não tem números cadastrados.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm text-left"><thead><tr className="border-b text-muted-foreground"><th className="p-3">Número</th><th className="p-3">Status</th><th className="p-3">Cadastro</th><th className="p-3">Última consulta</th></tr></thead><tbody>{query.data.rows.map(row => <tr key={row.id} className="border-b"><td className="p-3 font-medium whitespace-pre-wrap">{row.number || '—'}</td><td className="p-3"><span className="inline-block rounded-full bg-secondary px-3 py-1 text-xs font-medium">{row.status}</span></td><td className="p-3">{row.registeredAt || '—'}</td><td className="p-3">{row.consultedAt || '—'}</td></tr>)}</tbody></table></div>}
 {query.data && !('error' in query.data) && query.data.count > 25 && <div className="flex items-center justify-between gap-3 mt-5"><Button variant="outline" disabled={page === 1 || query.isFetching} onClick={() => setPage(p => p - 1)}>Anterior</Button><span className="text-sm">Página {page} de {Math.ceil(query.data.count / 25)}</span><Button variant="outline" disabled={page * 25 >= query.data.count || query.isFetching} onClick={() => setPage(p => p + 1)}>Próxima</Button></div>}
 </section>;
}
