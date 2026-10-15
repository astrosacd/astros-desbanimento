import {z} from 'zod';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;},'Data inválida.');
export const financialFilter=z.object({from:date,until:date}).strict().refine(v=>v.from<=v.until&&Date.parse(v.until)-Date.parse(v.from)<=365*86400000,'Escolha um período de até 366 dias.');
const n=z.number().int().safe();
export const financialReport=z.object({from:date,until:date,generatedAt:z.string(),receivedCents:n,paymentRefundsCents:n,netReceiptsCents:n,manualCreditsCents:n,manualReversalsCents:n,unclassifiedCount:n,currentBalanceCents:n,desban:z.object({debitsCents:n,refundsCents:n,netCents:n,paidCount:n,freeCount:n,completedSalesCents:n,openCents:n}),sms:z.object({debitsCents:n,refundsCents:n,netCents:n,completedCount:n,openCents:n,completedSalesCents:n,knownCostCents:n,knownGainCents:n,missingCostCount:n}),daily:z.array(z.object({date,receivedCents:n,consumedCents:n,returnedCents:n})).max(366)});
export type FinancialReport=z.infer<typeof financialReport>;
