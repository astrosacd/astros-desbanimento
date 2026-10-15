import type {SmsOption} from './types';
const names=new Intl.DisplayNames(['pt-BR'],{type:'region'});
export function countryIso(value:unknown){const iso=String(value??'').trim().toUpperCase();return /^[A-Z]{2}$/.test(iso)?iso:null;}
export function countryOptions(options:SmsOption[]){return options.map(option=>{const iso=countryIso(option.iso);if(!iso)return option;const name=names.of(iso);return {...option,iso,name:name&&name!==iso?name:option.name};}).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));}
