import {z} from 'zod';
import {createServerFn} from '@tanstack/react-start';
import {supportSettingsSchema,supportPhoneSchema} from './validation';
export const getSupportSettings=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).settings());
export const getAdminSupportSettings=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).settings(true));
export const saveSupportSettings=createServerFn({method:'POST'}).inputValidator(supportSettingsSchema).handler(async({data})=>(await import('./server')).save(data));
export const prepareSupport=createServerFn({method:'POST'}).inputValidator(supportPhoneSchema).handler(async({data})=>(await import('./server')).identity(data));

export const prepareSmsSupport=createServerFn({method:'POST'}).inputValidator(supportPhoneSchema.extend({smsOrderId:z.string().uuid()}).strict()).handler(async({data})=>{
 const order=await (await import('../sms/server')).smsCall('support-order',{orderId:data.smsOrderId});
 const identity=await (await import('./server')).identity({number:data.number,country:data.country});
 return {...identity,smsContext:{id:order.id,service:order.service,country:order.country}};
});

import {whatsappSettingsSchema} from './whatsapp';
export const getSupportWhatsapp=createServerFn({method:'GET'}).handler(async()=>(await import('./whatsapp.server')).whatsappSettings());
export const getAdminSupportWhatsapp=createServerFn({method:'GET'}).handler(async()=>(await import('./whatsapp.server')).whatsappSettings(true));
export const saveSupportWhatsapp=createServerFn({method:'POST'}).inputValidator(whatsappSettingsSchema).handler(async({data})=>(await import('./whatsapp.server')).saveWhatsapp(data));
