import {createServerFn} from '@tanstack/react-start';
import {supportSettingsSchema,supportPhoneSchema} from './validation';
export const getSupportSettings=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).settings());
export const getAdminSupportSettings=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).settings(true));
export const saveSupportSettings=createServerFn({method:'POST'}).inputValidator(supportSettingsSchema).handler(async({data})=>(await import('./server')).save(data));
export const prepareSupport=createServerFn({method:'POST'}).inputValidator(supportPhoneSchema).handler(async({data})=>(await import('./server')).identity(data));
