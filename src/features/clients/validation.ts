import {z} from 'zod';
export const clientSearchSchema=z.object({search:z.string().trim().min(2,'Digite pelo menos 2 caracteres.').max(120),field:z.enum(['email','nome']),page:z.number().int().min(1).max(100000).default(1)}).strict();
export const clientCreditSchema=z.object({requestId:z.string().uuid(),clientId:z.string().uuid(),amountCents:z.number().int().min(1).max(1000000),reason:z.string().trim().min(3).max(500)}).strict();
export const creditHistorySchema=z.object({clientId:z.string().uuid(),page:z.number().int().min(1).max(100000).default(1)}).strict();
