import { createServerFn } from '@tanstack/react-start';
import { noticeSchema } from './validation';
export const getClientNotice=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).readNotice());
export const getAdminNotice=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).readNotice(true));
export const updateNotice=createServerFn({method:'POST'}).inputValidator(noticeSchema).handler(async({data})=>(await import('./server')).saveNotice(data));
