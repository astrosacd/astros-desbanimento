import {CircleHelp} from 'lucide-react';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
export function SmsFieldHelp({label,help}:{label:string;help:string}){
 return <Popover><PopoverTrigger asChild><button type="button" className="sms-field-help" aria-label={`Ajuda: ${label}`} title={help}><CircleHelp size={16}/></button></PopoverTrigger><PopoverContent align="start" className="sms-field-help-content" aria-label={`Ajuda sobre ${label}`}><strong>{label}</strong><p>{help}</p></PopoverContent></Popover>;
}
export function SmsFieldLabel({htmlFor,label,help}:{htmlFor:string;label:string;help:string}){
 return <div className="sms-field-title"><label className="field-label" htmlFor={htmlFor}>{label}</label><SmsFieldHelp label={label} help={help}/></div>;
}
