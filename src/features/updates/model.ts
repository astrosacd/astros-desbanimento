import { z } from 'zod';
export const categories = { new: 'Novidade', improvement: 'Melhoria', fix: 'Correção' } as const;
export const listSchema = z.object({ page: z.number().int().min(1).max(10000).default(1), search: z.string().trim().max(100).default(''), category: z.enum(['all','new','improvement','fix']).default('all') }).strict();
export const updateSchema = z.object({ id: z.string().uuid(), version: z.number().int().min(0), title: z.string().trim().min(3).max(160), summary: z.string().trim().min(3).max(400), body: z.string().trim().min(3).max(12000), category: z.enum(['new','improvement','fix']), status: z.enum(['draft','published','archived']) }).strict();
export type Update = Omit<z.infer<typeof updateSchema>,'version'> & { version:number; published_at:string|null; created_at:string };
export type UpdateList = { rows:Update[]; total:number; page:number };
export const dateLabel = (value:string) => new Date(value).toLocaleDateString('pt-BR',{timeZone:'America/Fortaleza',day:'2-digit',month:'long',year:'numeric'});
export const deleteSchema=z.object({id:z.string().uuid(),version:z.number().int().min(1)}).strict();
