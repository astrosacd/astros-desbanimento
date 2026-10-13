import {z} from 'zod';
export const logSearchSchema=z.object({page:z.number().int().min(1).max(100000).default(1),operation:z.enum(['','saldo','validar','consultar','enviar','solicitacoes']).default(''),result:z.enum(['','error','completed','processing','review']).default(''),search:z.string().trim().max(40).regex(/^[+\d\s().-]*$/).transform(v=>v.replace(/\D/g,'')).default('')}).strict();
export const adminLogSearchSchema=logSearchSchema.extend({email:z.string().trim().max(254).default(''),userId:z.string().uuid().optional()}).strict();
