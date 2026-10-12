import { z } from 'zod';
import { createServerFn } from '@tanstack/react-start';
import { noticeSchema, uploadSchema, noticeListSchema, noticeStatusSchema } from './validation';
export const getClientNotice=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).readNotice());
export const getAdminNotice=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).readNotice(true));
export const updateNotice=createServerFn({method:'POST'}).inputValidator(noticeSchema).handler(async({data})=>(await import('./server')).saveNotice(data));

export const uploadImage=createServerFn({method:'POST'}).inputValidator(uploadSchema).handler(async({data})=>(await import('./server')).uploadNoticeImage(data));

export const getClientNotices=createServerFn({method:'GET'}).inputValidator(noticeListSchema).handler(async({data})=>(await import('./server')).listNotices(data));
export const getAdminNotices=createServerFn({method:'GET'}).inputValidator(noticeListSchema).handler(async({data})=>(await import('./server')).listNotices(data,true));
export const setNoticeStatus=createServerFn({method:'POST'}).inputValidator(noticeStatusSchema).handler(async({data})=>(await import('./server')).changeNoticeStatus(data));
export const removeNotice=createServerFn({method:'POST'}).inputValidator(z.object({id:z.string().uuid()}).strict()).handler(async({data})=>(await import('./server')).deleteNotice(data.id));
