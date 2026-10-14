import {z} from 'zod';
export const temporaryPassword=z.string().min(8,'Use pelo menos 8 caracteres.').refine(value=>new TextEncoder().encode(value).length<=72,'A senha está muito longa. Use menos caracteres.');
export const manualResetSchema=z.object({clientId:z.string().uuid(),requestId:z.string().uuid(),password:temporaryPassword,reason:z.string().trim().min(3,'Informe o motivo.').max(300)}).strict();
export const changeRequiredSchema=z.object({currentPassword:z.string().min(1).max(256),newPassword:temporaryPassword}).strict().refine(x=>x.currentPassword!==x.newPassword,'Escolha uma senha diferente da temporária.');
