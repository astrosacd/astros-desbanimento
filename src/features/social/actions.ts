import {createServerFn} from '@tanstack/react-start';import {z} from 'zod';
const catalog=z.object({page:z.number().int().min(0).max(10000).default(0),search:z.string().trim().max(80).default(''),category:z.string().trim().max(180).default(''),serviceType:z.enum(['all','followers','likes','views','comments','shares','subscribers','other']).default('all'),network:z.enum(['all','undefined','instagram','facebook','youtube','tiktok','x','telegram','twitch','linkedin','spotify','threads','website','snapchat','whatsapp','kick','pinterest']).default('all'),state:z.enum(['all','enabled','hidden','unavailable','unclassified','review']).default('all')});
const history=z.object({page:z.number().int().min(0).default(0),search:z.string().trim().max(80).default(''),email:z.string().trim().max(254).default(''),state:z.enum(['all','dispatching','pending','processing','completed','partial','refunded','review']).default('all')});
const order=z.object({orderId:z.string().uuid()});const intent=z.object({quoteId:z.string().uuid(),requestId:z.string().uuid()});
export const socialCatalog=createServerFn({method:'POST'}).inputValidator(catalog).handler(async({data})=>(await import('./server')).socialCall('catalog',data));
export const socialQuote=createServerFn({method:'POST'}).inputValidator(z.object({serviceId:z.number().int().positive(),quantity:z.number().int().positive().max(100000000),link:z.string().url().max(1500)})).handler(async({data})=>(await import('./server')).socialCall('quote',data));
export const socialBuy=createServerFn({method:'POST'}).inputValidator(intent).handler(async({data})=>(await import('./server')).socialCall('buy',data));
export const socialRelease=createServerFn({method:'POST'}).inputValidator(intent).handler(async({data})=>(await import('./server')).socialCall('release',data));
export const socialHistory=createServerFn({method:'POST'}).inputValidator(history).handler(async({data})=>(await import('./server')).socialCall('history',data));
export const socialCheck=createServerFn({method:'POST'}).inputValidator(order.extend({admin:z.boolean().default(false)})).handler(async({data})=>(await import('./server')).socialCall(data.admin?'admin-check':'check',{orderId:data.orderId},data.admin));
export const socialDetail=createServerFn({method:'POST'}).inputValidator(order.extend({admin:z.boolean().default(false)})).handler(async({data})=>(await import('./server')).socialCall(data.admin?'admin-detail':'detail',{orderId:data.orderId},data.admin));
export const socialOrderAction=createServerFn({method:'POST'}).inputValidator(order.extend({requestId:z.string().uuid(),mode:z.enum(['cancel','refill']),admin:z.boolean().default(false)})).handler(async({data})=>(await import('./server')).socialCall(data.admin?'admin-order-action':'order-action',data,data.admin));
export const socialAdminSettings=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).socialCall('admin-settings',{},true));
export const socialSaveSettings=createServerFn({method:'POST'}).inputValidator(z.object({apiKey:z.string().max(200),enabled:z.boolean(),fxUnits:z.number().int().min(1).max(10000000),marginBps:z.number().int().min(0).max(100000),feeCents:z.number().int().min(0).max(100000)})).handler(async({data})=>(await import('./server')).socialCall('admin-configure',data,true));
export const socialAdminBalance=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).socialCall('admin-balance',{},true));
export const socialSync=createServerFn({method:'POST'}).handler(async()=>(await import('./server')).socialCall('admin-sync',{},true));
export const socialAdminCatalog=createServerFn({method:'POST'}).inputValidator(catalog).handler(async({data})=>(await import('./server')).socialCall('admin-catalog',data,true));
export const socialCurate=createServerFn({method:'POST'}).inputValidator(z.object({serviceId:z.number().int().positive(),title:z.string().trim().min(3).max(180),network:z.enum(['instagram','facebook','youtube','tiktok','x','telegram','twitch','linkedin','spotify','threads','website','snapchat','whatsapp','kick','pinterest']),customerDescription:z.string().max(4000).default(''),categoryCode:z.enum(['followers','likes','views','comments','shares','subscribers','other']).default('other'),enabled:z.boolean()})).handler(async({data})=>(await import('./server')).socialCall('admin-curate',data,true));
export const socialAdminHistory=createServerFn({method:'POST'}).inputValidator(history).handler(async({data})=>(await import('./server')).socialCall('admin-history',data,true));
export const socialAdminNote=createServerFn({method:'POST'}).inputValidator(order.extend({requestId:z.string().uuid(),note:z.string().trim().min(10).max(500)})).handler(async({data})=>(await import('./server')).socialCall('admin-note',data,true));

export const socialVisibility=createServerFn({method:'POST'}).inputValidator(z.object({serviceIds:z.array(z.number().int().positive().max(1000000000)).min(1).max(100),enabled:z.boolean()})).handler(async({data})=>(await import('./server')).socialCall('admin-visibility',data,true));

export const socialAdminOperations=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).socialCall('admin-operations',{},true));

export const socialAutoCatalog=createServerFn({method:'POST'}).inputValidator(z.object({enabled:z.boolean()})).handler(async({data})=>(await import('./server')).socialCall('admin-auto-catalog',data,true));

export const socialCatalogFacets=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).socialCall('catalog-facets'));

export const socialSourceCatalog=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).socialCall('admin-source-catalog',{},true));
