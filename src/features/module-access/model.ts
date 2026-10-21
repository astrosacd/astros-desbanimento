import {z} from 'zod';
export const moduleNames={desbanimento:'Desbanimento de WhatsApp',sms:'Ativações SMS',social:'Redes sociais',prospecting:'Prospecção de Empresas'} as const;
export const moduleKey=z.enum(['desbanimento','sms','social','prospecting']);
export type ModuleKey=z.infer<typeof moduleKey>;
export const moduleState=z.object({module:moduleKey,globalEnabled:z.boolean(),clientEnabled:z.boolean(),enabled:z.boolean(),message:z.string().max(300)});
export type ModuleState=z.infer<typeof moduleState>;
export const moduleList=z.array(moduleState).length(4).refine(rows=>new Set(rows.map(r=>r.module)).size===4);
export const targetSchema=z.object({userId:z.string().uuid().nullable().default(null)}).strict();
export const saveSchema=z.object({module:moduleKey,enabled:z.boolean(),userId:z.string().uuid().nullable().default(null),message:z.string().trim().max(300).default('')}).strict();
