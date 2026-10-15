import {countryIso} from './countries';
import {useState} from 'react';
import {Check,ChevronsUpDown,Globe2} from 'lucide-react';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
import {Command,CommandInput,CommandList,CommandEmpty,CommandItem} from '@/components/ui/command';
import type {SmsOption} from './types';
function CountryFlag({iso}:{iso?:string|undefined}){
 const [failed,setFailed]=useState(false);const code=countryIso(iso)?.toLowerCase();
 if(!code||!/^[a-z]{2}$/.test(code))return null;
 return <span aria-hidden="true" className="sms-country-flag">{failed?<Globe2 size={18}/>:<img key={code} src={`https://flagcdn.com/${code}.svg`} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>}</span>;
}
export function SmsOptionPicker({id,label,placeholder,value,options,onChange,disabled=false}:{id:string;label:string;placeholder:string;value:string;options:SmsOption[];onChange:(value:string)=>void;disabled?:boolean}){
 const [open,setOpen]=useState(false);const selected=options.find(o=>String(o.id)===value);
 return <div className="min-w-0"><label className="field-label" htmlFor={id}>{label}</label><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><button id={id} type="button" role="combobox" aria-label={label} aria-expanded={open} disabled={disabled} className="field flex items-center justify-between gap-3 w-full text-left"><span className="flex items-center gap-2 min-w-0"><CountryFlag key={selected?.iso} iso={selected?.iso}/><span className="truncate">{selected?.name??placeholder}</span></span><ChevronsUpDown size={16} className="shrink-0 opacity-60"/></button></PopoverTrigger><PopoverContent align="start" className="p-0" style={{width:'var(--radix-popover-trigger-width)',maxWidth:'calc(100vw - 32px)'}}><Command><CommandInput placeholder="Digite para pesquisar…" aria-label={`Pesquisar ${label.toLowerCase()}`}/><CommandList style={{maxHeight:'min(280px, 45dvh, calc(var(--radix-popover-content-available-height) - 52px))',overflowY:'auto',overscrollBehavior:'contain'}}><CommandEmpty>Nenhuma opção encontrada.</CommandEmpty>{options.map(option=><CommandItem key={option.id} value={`${option.name} ${option.iso??''} ${option.id}`} onSelect={()=>{onChange(String(option.id));setOpen(false);}} className="min-h-11 gap-2"><Check size={15} className={String(option.id)===value?'shrink-0':'shrink-0 invisible'}/><CountryFlag iso={option.iso}/><span className="break-words min-w-0">{option.name}</span></CommandItem>)}</CommandList></Command></PopoverContent></Popover></div>;
}
