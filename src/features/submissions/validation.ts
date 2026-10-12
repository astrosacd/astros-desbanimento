import { z } from 'zod';
import { canonicalPhone } from './phone';
export const submissionSchema=z.object({number:z.string().trim().max(40).regex(/^[+\d\s().-]+$/),country:z.string().length(2).default('BR'),requestId:z.string().uuid(),action:z.enum(['quote','submit']),expectedCents:z.number().int().min(0).max(1000000).optional()}).strict().transform((data,ctx)=>{try{return {...data,number:canonicalPhone(data.number,data.country)};}catch(e){ctx.addIssue({code:z.ZodIssueCode.custom,path:['number'],message:e instanceof Error?e.message:'Número inválido.'});return z.NEVER;}});
