import { createServerFn } from '@tanstack/react-start';
import { listSchema, updateSchema, deleteSchema } from './model';
export const clientUpdates=createServerFn({method:'GET'}).inputValidator(listSchema).handler(async({data})=>(await import('./server')).listUpdates(data));
export const adminUpdates=createServerFn({method:'GET'}).inputValidator(listSchema).handler(async({data})=>(await import('./server')).listUpdates(data,true));
export const saveUpdate=createServerFn({method:'POST'}).inputValidator(updateSchema).handler(async({data})=>(await import('./server')).writeUpdate(data));

export const deleteUpdate=createServerFn({method:'POST'}).inputValidator(deleteSchema).handler(async({data})=>(await import('./server')).removeUpdate(data));
