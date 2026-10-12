import { createServerFn } from '@tanstack/react-start';
import { submissionSchema } from './validation';
export const submitNumber=createServerFn({method:'POST'}).inputValidator(submissionSchema).handler(async({data})=>(await import('./server')).send(data));
export const getSubmissionHistory=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).history());
