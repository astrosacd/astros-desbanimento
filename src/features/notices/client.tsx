import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { getClientNotice } from './actions';
export function ClientNotice({userId}:{userId:string}){
 const query=useQuery({queryKey:['client-notice',userId],queryFn:()=>getClientNotice(),retry:false,refetchInterval:60000});
 const [open,setOpen]=useState(false);
 const notice=query.data;
 useEffect(()=>{if(!notice?.enabled){setOpen(false);return;}try{setOpen(sessionStorage.getItem(`astros-notice:${userId}:${notice.version}`)!=='seen');}catch{setOpen(true);}},[notice?.version,notice?.enabled,userId]);
 function dismiss(value:boolean){setOpen(value);if(!value&&notice){try{sessionStorage.setItem(`astros-notice:${userId}:${notice.version}`,'seen');}catch{}}}
 if(!notice?.enabled)return null;
 const safe=notice.buttonUrl.startsWith('https://')?notice.buttonUrl:'';
 return <><Button variant="ghost" size="icon" onClick={()=>setOpen(true)} aria-label="Ver comunicado da Astros"><Bell size={18}/></Button><Dialog open={open} onOpenChange={dismiss}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogTitle>{notice.title}</DialogTitle>{notice.imageUrl&&<img src={notice.imageUrl} alt={notice.title} className="max-h-72 w-full object-contain rounded-lg"/>}<DialogDescription className="whitespace-pre-wrap break-words leading-relaxed">{notice.body}</DialogDescription><div className="flex flex-wrap gap-3 mt-4">{safe&&notice.buttonLabel&&<Button asChild><a href={safe} target="_blank" rel="noopener noreferrer" onClick={()=>dismiss(false)}>{notice.buttonLabel}</a></Button>}<Button variant="outline" onClick={()=>dismiss(false)}>Entendi</Button></div></DialogContent></Dialog></>;
}
