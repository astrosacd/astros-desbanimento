import {z} from 'zod';
import { createServerFn } from '@tanstack/react-start';
import { submissionSchema } from './validation';
export const submitNumber=createServerFn({method:'POST'}).inputValidator(submissionSchema).handler(async({data})=>(await import('./server')).send(data));
export const getSubmissionHistory=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).history());
export const getAdminSubmissions=createServerFn({method:'GET'}).handler(async()=>(await import('./admin.server')).adminJobs());
export const checkAdminSubmission=createServerFn({method:'POST'}).inputValidator(z.object({id:z.string().uuid()}).strict()).handler(async({data})=>(await import('./admin.server')).checkAdminJob(data.id));
