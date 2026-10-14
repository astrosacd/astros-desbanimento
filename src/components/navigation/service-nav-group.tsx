import {useId,type ReactNode} from 'react';
import {ShieldCheck,ChevronDown} from 'lucide-react';
export function ServiceNavGroup({open,onToggle,compact=false,active=false,children}:{open:boolean;onToggle:()=>void;compact?:boolean;active?:boolean;children:ReactNode}){
 const id=useId();
 return <div className="service-nav-group"><button type="button" className="nav-link service-nav-trigger" aria-label="Desbanimento" title={compact?'Desbanimento':undefined} aria-expanded={open&&!compact} aria-controls={id} data-service-active={active||undefined} onClick={onToggle}><ShieldCheck/>{!compact&&<><span>Desbanimento</span><ChevronDown className="service-nav-chevron" data-open={open}/></>}</button><div id={id} className="service-nav-items" hidden={!open||compact}>{children}</div></div>;
}
