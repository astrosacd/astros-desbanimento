import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { getClientNotice, getClientNotices } from './actions';
import type { Notice } from './server';
export function ClientNotice({userId}:{userId:string}){
 const query=useQuery({queryKey:['client-notice',userId],queryFn:()=>getClientNotice(),retry:false,refetchInterval:60000});
 const [selected,setSelected]=useState<Notice|null>(null);const [historyOpen,setHistoryOpen]=useState(false);const [page,setPage]=useState(1);
 const history=useQuery({queryKey:['client-notices',userId,page],queryFn:()=>getClientNotices({data:{page}}),enabled:historyOpen,retry:false});
 const latest=query.data;
 useEffect(()=>{if(!latest?.enabled)return;try{if(sessionStorage.getItem(`astros-notice:${userId}:${latest.version}`)!=='seen')setSelected(latest);}catch{setSelected(latest);}},[latest?.version,latest?.enabled,userId]);
 function dismiss(){if(selected){try{sessionStorage.setItem(`astros-notice:${userId}:${selected.version}`,'seen');}catch{}}setSelected(null);}
 return <><Button variant="ghost" size="icon" onClick={()=>{setHistoryOpen(true);setPage(1);}} aria-label="Ver histórico de comunicados"><Bell size={18}/></Button>
 <Dialog open={!!selected} onOpenChange={value=>{if(!value)dismiss();}}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogTitle>{selected?.title}</DialogTitle>{selected?.imageUrl&&<img src={selected.imageUrl} alt={selected.title} className="max-h-72 w-full object-contain rounded-lg"/>}<DialogDescription className="whitespace-pre-wrap break-words leading-relaxed">{selected?.body}</DialogDescription><div className="flex flex-wrap gap-3 mt-4">{selected?.buttonUrl.startsWith('https://')&&selected.buttonLabel&&<Button asChild><a href={selected.buttonUrl} target="_blank" rel="noopener noreferrer" onClick={dismiss}>{selected.buttonLabel}</a></Button>}<Button variant="outline" onClick={dismiss}>Entendi</Button></div></DialogContent></Dialog>
 <Dialog open={historyOpen} onOpenChange={setHistoryOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogTitle>Comunicados da Astros</DialogTitle><DialogDescription>Atualizações e informações, da mais recente para a mais antiga.</DialogDescription>{history.isPending?<p role="status">Carregando…</p>:history.isError?<p role="alert" className="text-destructive">{history.error.message}</p>:<><div className="space-y-3">{history.data?.rows.map(notice=><button type="button" key={notice.id} className="w-full rounded-lg border border-border p-4 text-left hover:bg-accent" onClick={()=>{setHistoryOpen(false);setSelected(notice);}}><p className="text-xs text-muted-foreground">{notice.publishedAt?new Date(notice.publishedAt).toLocaleString('pt-BR'):''}</p><h3 className="font-semibold mt-1">{notice.title}</h3><p className="text-sm text-muted-foreground mt-2 line-clamp-2 break-words">{notice.body}</p><span className="text-xs text-primary mt-3 block">Ler comunicado</span></button>)}{!history.data?.rows.length&&<p className="text-sm text-muted-foreground">Nenhum comunicado publicado.</p>}</div>{history.data&&history.data.total>20&&<div className="flex justify-between items-center gap-3"><Button variant="outline" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Anterior</Button><span className="text-xs">Página {page}</span><Button variant="outline" disabled={page*20>=history.data.total} onClick={()=>setPage(p=>p+1)}>Próxima</Button></div>}</>}</DialogContent></Dialog>
 </>;
}
