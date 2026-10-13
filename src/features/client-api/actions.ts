import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
export const getApiStatus=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).status());
export const generateApiKey=createServerFn({method:'POST'}).handler(async()=>(await import('./server')).key());
export const revokeApiKey=createServerFn({method:'POST'}).handler(async()=>(await import('./server')).revoke());
export const getAdminApiStatus=createServerFn({method:'GET'}).inputValidator(z.object({userId:z.string().uuid()}).strict()).handler(async({data})=>(await import('./server')).adminStatus(data.userId));
export const setApiPermission=createServerFn({method:'POST'}).inputValidator(z.object({userId:z.string().uuid(),enabled:z.boolean()}).strict()).handler(async({data})=>(await import('./server')).permission(data.userId,data.enabled));

import {logSearchSchema,adminLogSearchSchema} from './log-validation';
export const getApiLogs=createServerFn({method:'GET'}).inputValidator(logSearchSchema).handler(async({data})=>(await import('./server')).logs(data));
export const getAdminApiLogs=createServerFn({method:'GET'}).inputValidator(adminLogSearchSchema).handler(async({data})=>(await import('./server')).logs(data,true));
