import { createServerFn } from '@tanstack/react-start';
import { noticeSchema, uploadSchema } from './validation';
export const getClientNotice=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).readNotice());
export const getAdminNotice=createServerFn({method:'GET'}).handler(async()=>(await import('./server')).readNotice(true));
export const updateNotice=createServerFn({method:'POST'}).inputValidator(noticeSchema).handler(async({data})=>(await import('./server')).saveNotice(data));

export const uploadImage=createServerFn({method:'POST'}).inputValidator(uploadSchema).handler(async({data})=>(await import('./server')).uploadNoticeImage(data));
