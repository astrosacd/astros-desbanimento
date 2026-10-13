import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Copy,Check} from 'lucide-react';

export function CopyButton({value,label}:{value:string;label:string}){
 const [state,setState]=useState<'idle'|'copying'|'copied'|'failed'>('idle');
 useEffect(()=>{if(state!=='copied'&&state!=='failed')return;const timer=setTimeout(()=>setState('idle'),3000);return()=>clearTimeout(timer);},[state]);
 async function copy(){setState('copying');try{await navigator.clipboard.writeText(value);setState('copied');}catch{setState('failed');}}
 return <div className="api-copy-feedback"><Button size="sm" variant="outline" disabled={state==='copying'} onClick={copy}>{state==='copied'?<Check className="text-success"/>:<Copy/>}<span aria-live="polite">{state==='copied'?'Copiado!':state==='copying'?'Copiando…':state==='failed'?'Não foi possível copiar':label}</span></Button>{state==='failed'&&<p role="status" className="text-xs text-destructive mt-2">Selecione o texto acima e copie manualmente.</p>}</div>;
}
