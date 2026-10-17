import {getCookie,setResponseHeader} from '@tanstack/react-start/server';
import {requireAdmin,request} from '../admin/auth.server';
import {whatsappSettingsSchema,type WhatsappSettings} from './whatsapp';
export async function whatsappSettings(admin=false){
 setResponseHeader('Cache-Control','private, no-store');
 if(admin)await requireAdmin();
 const token=getCookie(admin?'astros_admin_session':'astros_client_session');
 if(!token)throw Error('Entre novamente para consultar o atendimento.');
 if(!admin){const r=await request('/auth/v1/user',token);const user=r.ok?await r.json():null;if(!user?.id||!user.email_confirmed_at)throw Error('Entre novamente com uma conta confirmada.');}
 const r=await request('/rest/v1/astros_support_whatsapp?select=enabled,links&limit=1',token);
 if(!r.ok){if(admin)throw Error('Ative o SQL de WhatsApp do suporte no Supabase para configurar os contatos.');return {enabled:false,links:[]} as WhatsappSettings;}
 const rows=await r.json();const parsed=whatsappSettingsSchema.safeParse(rows[0]);
 return parsed.success?parsed.data:{enabled:false,links:[]} as WhatsappSettings;
}
export async function saveWhatsapp(input:unknown){
 await requireAdmin();setResponseHeader('Cache-Control','private, no-store');
 const data=whatsappSettingsSchema.parse(input);
 const r=await request('/rest/v1/rpc/astros_save_support_whatsapp',getCookie('astros_admin_session'),{method:'POST',body:JSON.stringify({active:data.enabled,contacts:data.links})});
 if(!r.ok)throw Error('Não foi possível salvar os contatos. Confira os links e a ativação do SQL de WhatsApp do suporte.');
 return {success:true};
}
