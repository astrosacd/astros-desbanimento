import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
const page=z.object({page:z.number().int().min(0).max(100000).default(0)});
export const smsCatalog=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).smsCall('catalog'));
export const smsQuote=createServerFn({method:'POST'}).inputValidator(z.object({serviceId:z.number().int().positive(),countryId:z.number().int().positive()})).handler(async({data})=>(await import('./server')).smsCall('quote',data));
export const smsBuy=createServerFn({method:'POST'}).inputValidator(z.object({quoteId:z.string().uuid(),requestId:z.string().uuid()})).handler(async({data})=>(await import('./server')).smsCall('buy',data));
export const smsCheck=createServerFn({method:'POST'}).inputValidator(z.object({orderId:z.string().uuid(),cancel:z.boolean().default(false)})).handler(async({data})=>(await import('./server')).smsCall(data.cancel?'cancel':'check',{orderId:data.orderId}));
export const smsHistory=createServerFn({method:'GET'}).inputValidator(page).handler(async({data})=>(await import('./server')).smsCall('history',data));
export const smsAdminSettings=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).smsCall('admin-settings',{},true));
export const smsSaveSettings=createServerFn({method:'POST'}).inputValidator(z.object({enabled:z.boolean(),apiKey:z.string().max(200),usdBrlUnits:z.number().int().min(1).max(10000000),marginBps:z.number().int().min(0).max(100000),feeCents:z.number().int().min(0).max(100000),fxMode:z.enum(['manual','auto']),depositBps:z.number().int().min(0).max(5000),conversionBps:z.number().int().min(0).max(5000),extraBps:z.number().int().min(0).max(5000),fixedUsdUnits:z.number().int().min(0).max(100000000),depositUsdUnits:z.number().int().min(1000000).max(10000000000)})).handler(async({data})=>(await import('./server')).smsCall('save-settings',data,true));
export const smsAdminOrders=createServerFn({method:'GET'}).inputValidator(page).handler(async({data})=>(await import('./server')).smsCall('admin-orders',data,true));
export const smsAdminCatalog=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).smsCall('admin-catalog',{},true));
export const smsAdminPrice=createServerFn({method:'POST'}).inputValidator(z.object({serviceId:z.number().int().positive(),countryId:z.number().int().positive()})).handler(async({data})=>(await import('./server')).smsCall('admin-price',data,true));

export const smsRefreshFx=createServerFn({method:'POST'}).handler(async()=>(await import('./server')).smsCall('refresh-fx',{},true));
