import {createServerFn} from '@tanstack/react-start';
import {targetSchema,saveSchema} from './model';
export const getMyModules=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).myModules());
export const getAdminModules=createServerFn({method:'GET'}).inputValidator(targetSchema).handler(async({data})=>(await import('./server')).adminModules(data));
export const saveModule=createServerFn({method:'POST'}).inputValidator(saveSchema).handler(async({data})=>(await import('./server')).updateModule(data));
