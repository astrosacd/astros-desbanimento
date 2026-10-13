import {historySearchSchema} from '../numbers/validation';
import {z} from 'zod';
import { createServerFn } from '@tanstack/react-start';
import { submissionSchema } from './validation';
export const submitNumber=createServerFn({method:'POST'}).inputValidator(submissionSchema).handler(async({data})=>(await import('./server')).send(data));
export const getSubmissionHistory=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).history());
export const getAdminSubmissions=createServerFn({method:'GET'}).handler(async()=>(await import('./admin.server')).adminJobs());
export const checkAdminSubmission=createServerFn({method:'POST'}).inputValidator(z.object({id:z.string().uuid()}).strict()).handler(async({data})=>(await import('./admin.server')).checkAdminJob(data.id));

export const getAdminSubmissionHistory=createServerFn({method:'GET'}).inputValidator(z.object({page:z.number().int().min(1).max(100000),number:z.string().regex(/^[0-9+]{0,20}$/),state:z.enum(['all','completed','processing','review','failed']),kind:z.enum(['all','new','renew','resend'])}).strict()).handler(async({data})=>(await import('./admin.server')).adminHistory(data));

export const searchSubmissionHistory=createServerFn({method:'GET'}).inputValidator(historySearchSchema).handler(async({data})=>(await import('./server')).searchedHistory(data));
