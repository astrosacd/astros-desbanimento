import { z } from 'zod';
export const phoneSearchSchema=z.string().trim().max(40).regex(/^[+\d\s().-]*$/,'Digite apenas o número, com DDD ou DDI.').transform(v=>v.replace(/\D/g,'')).refine(v=>v.length<=15,'Informe até 15 dígitos.');
export const listSchema = z.object({ page: z.number().int().min(1).max(100000).default(1), number:phoneSearchSchema.default(''),pageSize:z.union([z.literal(10),z.literal(25)]).default(25) }).strict();
export const historySearchSchema=z.object({page:z.number().int().min(1).max(100000).default(1),number:phoneSearchSchema.default('')}).strict();
