import { z } from "zod";
export const sourceSchema = z.enum(["maps", "cnpj"]);
export const leadKeySchema = z.object({ leadId: z.string().uuid(), source: sourceSchema }).strict();
export const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T12:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Confira a data.");
export const followupSchema = leadKeySchema
  .extend({
    note: z.string().max(2000),
    dueOn: isoDay.nullable(),
    done: z.boolean(),
    version: z.number().int().min(0),
  })
  .strict();
export const statementSchema = z
  .object({ from: isoDay, until: isoDay })
  .strict()
  .refine(
    (d) => d.until >= d.from && (Date.parse(d.until) - Date.parse(d.from)) / 86400000 <= 365,
    "Escolha um período de até 366 dias.",
  );
export const noteResult = z.object({
  note: z.string(),
  dueOn: z.string().nullable(),
  done: z.boolean(),
  version: z.number().int(),
});
export type Followup = z.infer<typeof noteResult>;
export const agendaResult = z.object({
  today: isoDay,
  total: z.number().int(),
  rows: z.array(
    noteResult.extend({ id: z.string().uuid(), source: sourceSchema, name: z.string() }),
  ),
});
export const activityResult = z.object({
  rows: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      area: z.string(),
      target: z.enum([
        "/carteira",
        "/ativacoes-sms",
        "/redes-sociais",
        "/solicitacoes",
        "/prospeccao",
      ]),
      date: z.string(),
      read: z.boolean(),
    }),
  ),
  windowDays: z.literal(30),
  limit: z.literal(50),
});
export type Activity = z.infer<typeof activityResult>;
export const statementResult = z.object({
  rows: z.array(
    z.object({
      id: z.string().uuid(),
      created_at: z.string(),
      amount_cents: z.number().int().safe(),
      kind: z.string(),
      description: z.string(),
    }),
  ),
  from: isoDay,
  until: isoDay,
  timezone: z.literal("America/Fortaleza"),
});
export type Statement = z.infer<typeof statementResult>;
export function localDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"].map((k) => parts.find((p) => p.type === k)!.value).join("-");
}
export function csvCell(value: string) {
  return (
    '"' +
    (/^[\s]*[=+\-@]/.test(value) && !/^-?\d+(?:[.,]\d+)?$/.test(value)
      ? "'" + value
      : value
    ).replace(/"/g, '""') +
    '"'
  );
}
export function statementCsv(data: Statement) {
  const lines = [
    ["Data (Brasília)", "Descrição", "Tipo", "Valor (R$)", "Referência da movimentação"],
    ...data.rows.map((r) => [
      new Date(r.created_at).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" }),
      r.description,
      r.kind === "credit" ? "Crédito" : r.kind === "debit" ? "Débito" : "Estorno",
      (r.amount_cents / 100).toFixed(2).replace(".", ","),
      r.id,
    ]),
  ];
  return "\uFEFF" + lines.map((row) => row.map(csvCell).join(";")).join("\r\n");
}
