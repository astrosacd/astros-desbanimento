import { listOwnNumbers } from './numbers.server';
export async function exportOwnNumbers() {
 const rows = new Map<number, string>();
 let expectedCount: number | undefined;
 const started = Date.now();
 for (let page = 1; page <= 200; page++) {
  if (Date.now() - started > 60000) return { error: 'A exportação demorou demais. Tente novamente em alguns instantes.' };
  const result = await listOwnNumbers({ page });
  if ('error' in result) return { error: result.error };
  if (result.count > 5000) return { error: 'Esta conta possui mais registros do que o limite de exportação. Entre em contato com o suporte.' };
  expectedCount ??= result.count;
  if (result.count !== expectedCount) return { error: 'Sua lista mudou durante a exportação. Atualize e tente novamente.' };
  for (const row of result.rows) {
   if (rows.has(row.id)) return { error: 'Sua lista mudou durante a exportação. Atualize e tente novamente.' };
   rows.set(row.id, row.number);
  }
  if (page * result.pageSize >= result.count) {
   if (rows.size !== result.count) return { error: 'Não foi possível obter a lista completa. Tente novamente.' };
   return { numbers: Array.from(rows.values()).flatMap(number => number.split(/\r?\n/).map(line => line.trim()).filter(Boolean)) };
  }
  if (!result.rows.length) break;
 }
 return { error: 'Não foi possível concluir a exportação. Tente novamente.' };
}
