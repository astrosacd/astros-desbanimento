import { z } from 'zod';
export const emailSchema = z.string().trim().email('Informe um e-mail válido.').max(254);
export const passwordSchema = z.string().min(8, 'Use pelo menos 8 caracteres.').max(256);
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(256) });
export const signupSchema = z.object({
 name: z.string().trim().min(3).max(120).refine(v => v.split(/\s+/).length >= 2, 'Informe seu nome completo.'),
 email: emailSchema,
 whatsapp: z.string().max(30).transform(v => { const digits = v.replace(/\D/g, ''); return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits; }).refine(v => /^[1-9]\d{9,14}$/.test(v), 'Informe um WhatsApp válido com DDD.'),
 password: passwordSchema,
});
