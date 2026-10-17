import {z} from 'zod';
export const defaultWhatsappLinks=[{label:'WhatsApp 1',url:'https://wa.me/message/2BTTLFPLWDDDE1'},{label:'WhatsApp 2',url:'https://wa.me/message/2WX4V6YSBBUAB1'}];
// Fixed host and paths: never accept executable URLs or arbitrary redirect destinations.
export const whatsappUrl=z.string().trim().max(200).regex(/^https:\/\/wa\.me\/(?:message\/[A-Za-z0-9]{6,40}|[1-9][0-9]{7,14})$/, 'Use um link https://wa.me/message/... ou https://wa.me/ com DDI e número.');
export const whatsappSettingsSchema=z.object({enabled:z.boolean(),links:z.array(z.object({label:z.string().trim().min(2).max(60),url:whatsappUrl}).strict()).min(1).max(2)}).strict().refine(v=>new Set(v.links.map(l=>l.url)).size===v.links.length,{message:'Informe links diferentes para cada contato.'});
export type WhatsappSettings=z.infer<typeof whatsappSettingsSchema>;
