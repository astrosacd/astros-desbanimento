import {z} from 'zod';
const date=z.string().refine(v=>{if(v==='')return true;if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;},'Data inválida.').default('');
export const smsHistoryFilter=z.object({page:z.number().int().min(0).max(100000).default(0),search:z.string().trim().max(80).default(''),state:z.enum(['all','dispatching','pending','received','refunded','review']).default('all'),from:date,until:date,email:z.string().trim().max(254).default('')}).strict().refine(v=>!v.from||!v.until||v.from<=v.until,'A data inicial deve ser anterior à final.');
export type SmsHistoryFilter=z.infer<typeof smsHistoryFilter>;
