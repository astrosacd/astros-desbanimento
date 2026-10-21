import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {smsHistoryFilter} from './history-validation';
const page=smsHistoryFilter;
const optionId=z.union([z.number().int().positive(),z.string().regex(/^[a-z0-9]{1,80}$/)]);
export const smsCatalog=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).smsCall('catalog'));
export const smsQuote=createServerFn({method:'POST'}).inputValidator(z.object({serviceId:optionId,countryId:optionId,areaCode:z.string().regex(/^$|^[1-9][0-9]$/).optional()})).handler(async({data})=>(await import('./server')).smsCall('quote',data));
export const smsBuy=createServerFn({method:'POST'}).inputValidator(z.object({quoteId:z.string().uuid(),requestId:z.string().uuid()})).handler(async({data})=>(await import('./server')).smsCall('buy',data));
export const smsCheck=createServerFn({method:'POST'}).inputValidator(z.object({orderId:z.string().uuid(),cancel:z.boolean().default(false)})).handler(async({data})=>(await import('./server')).smsCall(data.cancel?'cancel':'check',{orderId:data.orderId}));
export const smsHistory=createServerFn({method:'GET'}).inputValidator(page).handler(async({data})=>(await import('./server')).smsCall('history',data));
export const smsAdminSettings=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).smsCall('admin-settings',{},true));
export const smsSaveSettings=createServerFn({method:'POST'}).inputValidator(z.object({apiKey:z.string().max(200),usdBrlUnits:z.number().int().min(1).max(10000000),marginBps:z.number().int().min(0).max(100000),feeCents:z.number().int().min(0).max(100000),fxMode:z.enum(['manual','auto']),depositBps:z.number().int().min(0).max(5000),conversionBps:z.number().int().min(0).max(5000),extraBps:z.number().int().min(0).max(5000),fixedUsdUnits:z.number().int().min(0).max(100000000),depositUsdUnits:z.number().int().min(1000000).max(10000000000)})).handler(async({data})=>{
 // Pricing forms have no availability switch. Preserve the current saved availability,
 // rather than sending the stale value from a form opened before a pause/provider switch.
 const {smsCall}=await import('./server');const current=await smsCall('admin-settings',{},true);
 if(typeof current?.enabled!=='boolean')throw Error('Atualize a situação do serviço antes de salvar.');
 return smsCall('save-settings',{...data,enabled:current.enabled},true);
});
export const smsAdminOrders=createServerFn({method:'GET'}).inputValidator(page).handler(async({data})=>(await import('./server')).smsCall('admin-orders',data,true));
export const smsAdminCatalog=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).smsCall('admin-catalog',{},true));
export const smsAdminPrice=createServerFn({method:'POST'}).inputValidator(z.object({serviceId:optionId,countryId:optionId})).handler(async({data})=>(await import('./server')).smsCall('admin-price',data,true));

export const smsRefreshFx=createServerFn({method:'POST'}).handler(async()=>(await import('./server')).smsCall('refresh-fx',{},true));

export const smsAdminBalance=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).smsCall('admin-balance',{},true));

export const smsReviewDetail=createServerFn({method:'GET'}).inputValidator(z.object({orderId:z.string().uuid()}).strict()).handler(async({data})=>(await import('./server')).smsCall('admin-review-detail',data,true));
export const smsReviewAction=createServerFn({method:'POST'}).inputValidator(z.object({orderId:z.string().uuid(),actionId:z.string().uuid(),mode:z.enum(['check','cancel','note']),reason:z.string().trim().min(10).max(500)}).strict()).handler(async({data})=>(await import('./server')).smsCall('admin-review',data,true));
export const smsReleaseQuote=createServerFn({method:'POST'}).inputValidator(z.object({quoteId:z.string().uuid(),requestId:z.string().uuid()}).strict()).handler(async({data})=>(await import('./server')).smsCall('release-quote',data));

export const smsOperations=createServerFn({method:'GET'}).inputValidator(z.object({from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),until:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict()).handler(async({data})=>(await import('./server')).smsCall('admin-dashboard',data,true));
export const smsPause=createServerFn({method:'POST'}).handler(async()=>(await import('./server')).smsCall('admin-pause',{},true));
export const smsSupportOrder=createServerFn({method:'GET'}).inputValidator(z.object({orderId:z.string().uuid()}).strict()).handler(async({data})=>(await import('./server')).smsCall('support-order',data));

export const smsAreaOptions=createServerFn({method:'POST'}).inputValidator(z.object({serviceId:optionId,countryId:optionId})).handler(async({data})=>(await import('./server')).smsCall('area-options',data));

export const smsProviders=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).smsCall('admin-providers',{},true));
export const smsSaveFive=createServerFn({method:'POST'}).inputValidator(z.object({apiKey:z.string().max(2000),nativeBrlUnits:z.number().int().min(1).max(10000000),marginBps:z.number().int().min(0).max(100000),feeCents:z.number().int().min(0).max(100000)}).strict()).handler(async({data})=>(await import('./server')).smsCall('save-five',data,true));
export const smsSelectSupplier=createServerFn({method:'POST'}).inputValidator(z.object({supplier:z.enum(['smspool','five_sim']),enabled:z.boolean()}).strict()).handler(async({data})=>(await import('./server')).smsCall('select-supplier',data,true));

export const smsFiveBalance=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).smsCall('admin-balance',{supplier:'five_sim'},true));

export const smsProviderBalance=createServerFn({method:'GET'}).inputValidator(z.object({supplier:z.enum(['smspool','five_sim'])}).strict()).handler(async({data})=>(await import('./server')).smsCall('admin-balance',data,true));

export const smsFiveCatalog=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).smsCall('admin-five-catalog',{},true));
export const smsFiveOffers=createServerFn({method:'POST'}).inputValidator(z.object({serviceId:z.string().regex(/^[a-z0-9]{1,80}$/),countryId:z.string().regex(/^[a-z0-9]{1,80}$/)}).strict()).handler(async({data})=>(await import('./server')).smsCall('admin-five-offers',data,true));
