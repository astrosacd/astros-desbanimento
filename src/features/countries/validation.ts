import {z} from 'zod';
import {getCountries,getCountryCallingCode} from 'libphonenumber-js';
export const standardDdis=new Set<string>(getCountries().map(code=>getCountryCallingCode(code)));
export const countrySchema=z.object({id:z.string().uuid().optional(),name:z.string().trim().min(2,'Informe o nome do país.').max(80),ddi:z.string().trim().regex(/^[1-9]\d{0,2}$/,'Informe um DDI de 1 a 3 dígitos, sem + e sem zero no início.').refine(v=>!standardDdis.has(v),'Este DDI já existe na lista padrão de países.')}).strict();
export type CustomCountry={id:string;name:string;ddi:string};
