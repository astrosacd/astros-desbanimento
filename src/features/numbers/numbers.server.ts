import { getCookie, setResponseHeader } from '@tanstack/react-start/server';
import { request } from '../admin/auth.server';
import { listSchema } from './validation';
import { z } from 'zod';
const rowSchema = z.object({ id: z.number().int(), field_4773: z.string(), field_4741: z.string().nullish(), field_4827: z.string().nullish(), field_4828: z.string().nullish(), field_4831: z.object({ value: z.string() }).nullish() });
const responseSchema = z.object({ count: z.number().int().nonnegative(), results: z.array(rowSchema).max(25) });
export async function listOwnNumbers(input: unknown) {
 const { page } = listSchema.parse(input);
 setResponseHeader('Cache-Control', 'private, no-store');
 const session = getCookie('astros_client_session');
 if (!session) throw new Error('Sua sessão expirou. Entre novamente.');
 const auth = await request('/auth/v1/user', session).catch(() => null);
 if (!auth?.ok) throw new Error('Sua sessão expirou. Entre novamente.');
 const user = await auth.json();
 const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
 if (!user.id || !email || !user.email_confirmed_at) throw new Error('Confirme seu e-mail e entre novamente.');
 const token = process.env['BASEROW_API_TOKEN'];
 if (!token) throw new Error('A consulta ainda não está configurada. Entre em contato com o suporte.');
 const url = new URL('https://baserow.astroscomunicacaodigital.com/api/database/rows/table/511/');
 url.searchParams.set('filter__field_4773__equal', email);
 url.searchParams.set('page', String(page));
 url.searchParams.set('size', '25');
 try {
  const result = await fetch(url, { headers: { Authorization: `Token ${token}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000) });
  if (!result.ok) {
   const code = result.status;
   console.error('[numbers] provider HTTP', code);
   return { error: code === 401 || code === 403 ? 'A conexão com o serviço não está autorizada. Entre em contato com o suporte. (N01)' : code === 400 ? 'O servidor recusou a consulta. Entre em contato com o suporte. (N02)' : 'O serviço está indisponível no momento. Tente atualizar em alguns instantes. (N03)' };
  }
  const data = responseSchema.parse(await result.json());
  // Independently enforce ownership even if a provider ignores the filter.
  if (data.results.some(row => row.field_4773.trim().toLowerCase() !== email)) throw new Error('ownership');
  return { count: data.count, page, pageSize: 25, rows: data.results.map(row => ({ id: row.id, number: row.field_4741 || '', registeredAt: row.field_4827 || '', consultedAt: row.field_4828 || '', status: row.field_4831?.value || 'Sem status' })) };
 } catch (error) {
  const code = error instanceof z.ZodError ? 'N04' : error instanceof Error && error.message === 'ownership' ? 'N05' : 'N06';
  console.error('[numbers] consultation failed', code);
  return { error: `Não foi possível conectar ao serviço ou validar a resposta. Tente atualizar em alguns instantes. (${code})` };
 }
}
