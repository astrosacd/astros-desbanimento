import {z} from 'zod';
export const countrySchema=z.object({id:z.string().uuid().optional(),name:z.string().trim().min(2,'Informe o nome do país.').max(80),ddi:z.string().trim().regex(/^[1-9]\d{0,2}$/,'Informe um DDI de 1 a 3 dígitos, sem + e sem zero no início.').refine(v=>v!=='55','Para o Brasil, use a opção padrão Brasil (+55).')}).strict();
export type CustomCountry={id:string;name:string;ddi:string};
