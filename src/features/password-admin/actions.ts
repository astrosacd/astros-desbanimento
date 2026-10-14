import {createServerFn} from '@tanstack/react-start';import {z} from 'zod';import {manualResetSchema,changeRequiredSchema} from './validation';
export const manuallyResetPassword=createServerFn({method:'POST'}).inputValidator(manualResetSchema).handler(async({data})=>(await import('./server')).resetPassword(data));
export const getPasswordResetHistory=createServerFn({method:'GET'}).inputValidator(z.object({clientId:z.string().uuid()}).strict()).handler(async({data})=>(await import('./server')).resetHistory(data.clientId));
export const completeRequiredPasswordChange=createServerFn({method:'POST'}).inputValidator(changeRequiredSchema).handler(async({data})=>(await import('./server')).changeRequiredPassword(data));
