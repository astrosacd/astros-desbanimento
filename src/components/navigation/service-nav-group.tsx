import {useId,type ReactNode} from 'react';
import {ShieldCheck,ChevronDown,type LucideIcon} from 'lucide-react';
export function ServiceNavGroup({open,onToggle,compact=false,active=false,label='Desbanimento',Icon=ShieldCheck,children}:{open:boolean;onToggle:()=>void;compact?:boolean;active?:boolean;label?:string;Icon?:LucideIcon;children:ReactNode}){
 const id=useId();
 return <div className="service-nav-group" data-nav-kind={label==='Ativações SMS'?'sms':label==='Pagamentos'?'payments':label==='Pesquisa digital'?'digital':label==='Prospecção'?'prospect':label==='Redes sociais'?'social':'desban'}><button type="button" className="nav-link service-nav-trigger" aria-label={label} title={compact?label:undefined} aria-expanded={open&&!compact} aria-controls={id} data-service-active={active||undefined} onClick={onToggle}><Icon/>{!compact&&<><span>{label}</span><ChevronDown className="service-nav-chevron" data-open={open}/></>}</button><div id={id} className="service-nav-items" hidden={!open||compact}>{children}</div></div>;
}
