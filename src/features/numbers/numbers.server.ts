import { getCookie, setResponseHeader } from '@tanstack/react-start/server';
import { request } from '../admin/auth.server';
import { listSchema } from './validation';
import { z } from 'zod';
import { retiredSim } from '../../../supabase/functions/astros-submit-number/core';
import { fetchNumberRows } from './transport.server';
const rowSchema = z.object({ id: z.number().int(), field_4773: z.string(), field_4784: z.string().nullish(), field_4741: z.string().nullish(), field_4827: z.string().nullish(), field_4828: z.string().nullish(), field_4831: z.object({ value: z.string() }).nullish() });
const responseSchema = z.object({ count: z.number().int().nonnegative(), results: z.array(rowSchema).max(200) });
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
 const token = process.env['BASEROW_API_TOKEN']?.trim();
 if (token && /[\r\n]/.test(token)) return { error: 'A conexão está com uma credencial mal formatada. Entre em contato com o suporte. (N12)' };
 if (!token) throw new Error('A consulta ainda não está configurada. Entre em contato com o suporte.');
 const url = new URL('https://baserow.astroscomunicacaodigital.com/api/database/rows/table/511/');
 url.searchParams.set('filter__field_4773__equal', email);
 url.searchParams.set('page', '1');
 url.searchParams.set('size', '200');
 try {
  const visible: z.infer<typeof rowSchema>[] = [];
  const ids = new Set<number>();
  let expected: number | undefined;
  for (let providerPage = 1; providerPage <= 100; providerPage++) {
  url.searchParams.set('page', String(providerPage));
  const result = await fetchNumberRows(url, token);
  if (!result.ok) {
   const code = result.status;
   console.error('[numbers] provider HTTP', code);
   return { error: code === 401 || code === 403 ? 'A conexão com o serviço não está autorizada. Entre em contato com o suporte. (N01)' : code === 400 ? 'O servidor recusou a consulta. Entre em contato com o suporte. (N02)' : 'O serviço está indisponível no momento. Tente atualizar em alguns instantes. (N03)' };
  }
  let payload: unknown;
  try { payload = await result.json(); } catch { return { error: 'O servidor retornou uma resposta inválida. Tente novamente. (N11)' }; }
  const data = responseSchema.parse(payload);
  // Independently enforce ownership even if a provider ignores the filter.
  if (data.results.some(row => row.field_4773.trim().toLowerCase() !== email)) throw new Error('ownership');
  expected ??= data.count;
  if (data.count !== expected || expected > 20000 || data.results.some(row => ids.has(row.id))) throw new Error('incomplete');
  for (const row of data.results) { ids.add(row.id); if (!retiredSim(row.field_4784)) visible.push(row); }
  if (ids.size === expected) break;
  if (!data.results.length || ids.size > expected || providerPage === 100) throw new Error('incomplete');
  }
  return { count: visible.length, page, pageSize: 25, rows: visible.slice((page - 1) * 25, page * 25).map(row => ({ id: row.id, number: row.field_4741 || '', registeredAt: row.field_4827 || '', consultedAt: row.field_4828 || '', status: row.field_4831?.value || 'Sem status' })) };
 } catch (error) {
  const cause = error instanceof Error ? (error as Error & { cause?: { code?: string } }).cause?.code : undefined;
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  const detail = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  let code = 'N06';
  let message = 'Não foi possível estabelecer conexão com o servidor. Tente novamente ou entre em contato com o suporte.';
  if (error instanceof z.ZodError) { code = 'N04'; message = 'O servidor retornou dados em um formato inesperado. Entre em contato com o suporte.'; }
  else if (error instanceof Error && error.message === 'ownership') { code = 'N05'; message = 'Não foi possível validar os registros da sua conta. Entre em contato com o suporte.'; }
  else if (name === 'TimeoutError' || name === 'AbortError' || cause === 'ETIMEDOUT' || cause === 'UND_ERR_CONNECT_TIMEOUT') { code = 'N07'; message = 'O servidor demorou para responder. Tente atualizar em alguns instantes.'; }
  else if (cause === 'ENOTFOUND' || cause === 'EAI_AGAIN') { code = 'N09'; message = 'Não foi possível localizar o servidor do serviço. Entre em contato com o suporte.'; }
  else if (cause && ['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(cause)) { code = 'N08'; message = 'A conexão segura com o servidor falhou. Entre em contato com o suporte.'; }
  if (code === 'N06' && /header|ByteString|character|argument/i.test(detail)) { code = 'N12'; message = 'O servidor não conseguiu preparar a conexão. Verifique a credencial da integração com o suporte.'; }
  else if (code === 'N06' && /redirect/i.test(detail)) { code = 'N10'; message = 'O endereço do serviço redirecionou a consulta. Entre em contato com o suporte.'; }
  else if (code === 'N06' && /cache|not implemented|unsupported/i.test(detail)) { code = 'N13'; message = 'O servidor encontrou uma incompatibilidade na conexão. Entre em contato com o suporte.'; }
  else if (code === 'N06' && /fetch failed|network|connection|socket/i.test(detail)) { code = 'N14'; message = 'A conexão entre o painel e o serviço falhou. Tente novamente ou entre em contato com o suporte.'; }
  console.error('[numbers] consultation failed', code);
  return { error: `${message} (${code})` };
 }
}
