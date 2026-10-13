import {z} from 'zod';
import {createServerFn} from '@tanstack/react-start';
import {bannerSchema} from './validation';
export const getOverviewBanner=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).readBanner());
export const getAdminBanner=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).readBanner(true));
export const updateOverviewBanner=createServerFn({method:'POST'}).inputValidator(bannerSchema).handler(async({data})=>(await import('./server')).saveBanner(data));

export const getBannerHistory=createServerFn({method:'GET'}).inputValidator(z.object({page:z.number().int().min(1).max(100000)}).strict()).handler(async({data})=>(await import('./server')).listBanners(data.page));
export const removeOverviewBanner=createServerFn({method:'POST'}).inputValidator(z.object({id:z.string().uuid()}).strict()).handler(async({data})=>(await import('./server')).deleteBanner(data.id));
