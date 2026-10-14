import {z} from 'zod';
export const PANEL_ORIGINS=['https://mais.astroscomunicacaodigital.com','https://desbanimento-de-numeros.lovable.app','https://desbanimento.astroscomunicacaodigital.com'] as const;
export const addressSchema=z.object({origin:z.enum(PANEL_ORIGINS)}).strict();
export function panelOrigin(value:unknown){return z.enum(PANEL_ORIGINS).parse(value);}
