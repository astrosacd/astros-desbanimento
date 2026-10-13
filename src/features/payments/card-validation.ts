import {z} from 'zod';
export const cardPaymentSchema=z.object({orderId:z.string().uuid(),token:z.string().min(10).max(256).regex(/^[A-Za-z0-9_-]+$/),paymentMethodId:z.string().min(1).max(50).regex(/^[A-Za-z0-9_-]+$/),issuerId:z.string().regex(/^\d{1,20}$/).optional(),installments:z.number().int().min(1).max(12),identification:z.object({type:z.enum(['CPF','CNPJ']),number:z.string().regex(/^\d{11}(\d{3})?$/)}).strict()}).strict();
export const prepareCardSchema=z.object({amountCents:z.number().int().min(1).max(1000000),requestId:z.string().uuid()}).strict();
