import {createServerFn} from '@tanstack/react-start';
import {bannerSchema} from './validation';
export const getOverviewBanner=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).readBanner());
export const getAdminBanner=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).readBanner(true));
export const updateOverviewBanner=createServerFn({method:'POST'}).inputValidator(bannerSchema).handler(async({data})=>(await import('./server')).saveBanner(data));
