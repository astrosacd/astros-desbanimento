import { z } from 'zod';
export const noticeSchema=z.object({id:z.string().uuid().optional(),title:z.string().trim().min(1).max(120),body:z.string().trim().min(1).max(3000),buttonLabel:z.string().trim().max(80),buttonUrl:z.string().trim().max(2048).refine(v=>{if(!v)return true;try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}},'Use um link HTTPS válido.'),imageUrl:z.string().max(2048).refine(v=>!v||v.startsWith('https://tevljvidqbvrcgzqypwf.supabase.co/storage/v1/object/public/astros-notices/'),'Use uma imagem enviada pelo painel.').default(''),enabled:z.boolean()}).strict().refine(v=>!v.enabled||(v.title.length>0&&v.body.length>0),'Preencha título e mensagem antes de ativar.').refine(v=>!!v.buttonLabel===!!v.buttonUrl,'Preencha o texto e o link do botão, ou deixe ambos vazios.');

export const uploadSchema=z.object({mime:z.enum(['image/png','image/jpeg','image/webp']),base64:z.string().min(1).max(2796204).regex(/^[A-Za-z0-9+/]+={0,2}$/)}).strict();

export const noticeListSchema=z.object({page:z.number().int().min(1).max(100000).default(1)}).strict();
export const noticeStatusSchema=z.object({id:z.string().uuid(),status:z.enum(['published','archived'])}).strict();
