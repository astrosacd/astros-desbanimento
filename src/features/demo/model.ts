import { z } from 'zod';
export const COST = 397;
export const TYPES = ['WhatsApp Business', 'WhatsApp Messenger', 'WhatsApp Business (Internacional)', 'WhatsApp Messenger (Internacional)', 'Rebanimento'] as const;
export const requestSchema = z.object({ id: z.string(), number: z.string(), type: z.enum(TYPES), status: z.enum(['Em andamento', 'Concluída', 'Não aprovada']), date: z.string(), cost: z.number().int().nonnegative() });
export type DemoRequest = z.infer<typeof requestSchema>;
export const stateSchema = z.object({ version: z.literal(2), requests: z.array(requestSchema), movements: z.array(z.object({ id: z.string(), label: z.string(), value: z.number().int(), date: z.string() })), profile: z.object({ name: z.string(), email: z.string(), company: z.string() }) });
export type DemoState = z.infer<typeof stateSchema>;
export const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export const dateLabel = (date: string, time = false) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'America/Sao_Paulo' }).format(new Date(date));
export const digits = (s: string) => s.replace(/\D/g, '');
export function normalizeNumber(number: string, type: string) { const n = digits(number); return type.includes('Internacional') || (type === 'Rebanimento' && number.trim().startsWith('+')) ? `+${n}` : `+55${n}`; }
export function validateNumber(number: string, type: string) {
  const n = digits(number);
  if (type.includes('Internacional') || (type === 'Rebanimento' && number.trim().startsWith('+'))) {
    if (!/^\+[1-9][\d\s().-]*$/.test(number.trim()) || n.length < 8 || n.length > 15) return 'Informe +código do país e número, de 8 a 15 dígitos no total.';
    return '';
  }
  if (!/^[\d\s().-]+$/.test(number) || !/^[1-9]\d(?:[2-8]\d{7}|9\d{8})$/.test(n)) return 'Informe DDD + número brasileiro: 10 dígitos para fixo ou 11 para celular (iniciado por 9), sem +55.';
  return '';
}
export const balance = (s: DemoState) => s.movements.reduce((sum, m) => sum + m.value, 0);
export function validateRequest(s: DemoState, number: string, type: string) {
  const error = validateNumber(number, type); if (error) return error;
  const normalized = normalizeNumber(number, type);
  if (s.requests.some(r => r.number === normalized && r.status === 'Em andamento')) return 'Este número já possui uma solicitação em andamento na demonstração.';
  if (type === 'Rebanimento' && !s.requests.some(r => r.number === normalized)) return 'Rebanimento exige um número já registrado na demonstração.';
  if (balance(s) < COST) return 'Saldo demonstrativo insuficiente. Simule uma recarga antes de continuar.';
  return '';
}
export function addRequest(s: DemoState, number: string, type: typeof TYPES[number], id: string, date: string): DemoState {
  const error = validateRequest(s, number, type); if (error) throw new Error(error);
  return { ...s, requests: [{ id, number: normalizeNumber(number, type), type, status: 'Em andamento', date, cost: COST }, ...s.requests], movements: [{ id: `M-${id}`, label: `Solicitação ${id}`, value: -COST, date }, ...s.movements] };
}
export function addRecharge(s: DemoState, value: number, id: string, date: string): DemoState {
  if (!Number.isInteger(value) || value < 100 || value > 100000) throw new Error('Informe um valor entre R$ 1,00 e R$ 1.000,00.');
  return { ...s, movements: [{ id, label: 'Recarga simulada', value, date }, ...s.movements] };
}
export function createSeed(): DemoState {
  const rows: DemoRequest[] = [
    { id: 'AST-1048', number: '+5511998761048', type: 'WhatsApp Business', status: 'Em andamento', date: '2026-10-11T13:20:00Z', cost: COST },
    { id: 'AST-1047', number: '+5521987651047', type: 'WhatsApp Messenger', status: 'Concluída', date: '2026-10-11T11:45:00Z', cost: COST },
    { id: 'AST-1046', number: '+351912345678', type: 'WhatsApp Business (Internacional)', status: 'Em andamento', date: '2026-10-10T16:30:00Z', cost: COST },
    { id: 'AST-1045', number: '+5531987651045', type: 'WhatsApp Business', status: 'Não aprovada', date: '2026-10-10T10:10:00Z', cost: COST },
    { id: 'AST-1044', number: '+5541998761044', type: 'Rebanimento', status: 'Concluída', date: '2026-10-09T15:05:00Z', cost: COST },
    { id: 'AST-1043', number: '+12025550143', type: 'WhatsApp Messenger (Internacional)', status: 'Concluída', date: '2026-10-08T12:20:00Z', cost: COST },
    { id: 'AST-1042', number: '+5585998761042', type: 'WhatsApp Business', status: 'Em andamento', date: '2026-10-07T14:00:00Z', cost: COST },
    { id: 'AST-1041', number: '+5511987651041', type: 'WhatsApp Messenger', status: 'Concluída', date: '2026-10-06T09:30:00Z', cost: COST },
    { id: 'AST-1040', number: '+5561998761040', type: 'WhatsApp Business', status: 'Concluída', date: '2026-10-05T11:00:00Z', cost: COST },
    { id: 'AST-1039', number: '+5548998761039', type: 'WhatsApp Messenger', status: 'Não aprovada', date: '2026-10-04T16:20:00Z', cost: COST },
    { id: 'AST-1038', number: '+5513998761038', type: 'WhatsApp Business', status: 'Concluída', date: '2026-10-03T13:00:00Z', cost: COST },
    { id: 'AST-1037', number: '+5571998761037', type: 'WhatsApp Messenger', status: 'Concluída', date: '2026-10-02T12:10:00Z', cost: COST },
  ];
  return { version: 2, requests: rows, movements: [...rows.map(r => ({ id: `M-${r.id}`, label: `Solicitação ${r.id}`, value: -r.cost, date: r.date })), { id: 'M-002', label: 'Recarga simulada', value: 5000, date: '2026-10-05T08:00:00Z' }, { id: 'M-001', label: 'Crédito inicial fictício', value: 10000, date: '2026-10-01T10:00:00Z' }], profile: { name: 'Alex Martins', email: 'alex@exemplo.test', company: 'Minha empresa' } };
}
export function exportCsv(rows: DemoRequest[]) {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return '\uFEFF' + [['ID', 'Número fictício', 'Tipo', 'Status demonstrativo', 'Data', 'Custo de referência'], ...rows.map(r => [r.id, r.number, r.type, r.status, dateLabel(r.date, true), money(r.cost)])].map(row => row.map(escape).join(';')).join('\r\n');
}
