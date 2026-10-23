import { z } from "zod";
export const STATUS_URL = "https://astros-mais.betteruptime.com";
export const ENDPOINT = "https://tevljvidqbvrcgzqypwf.supabase.co/functions/v1/astros-status";
export const phases = {
  investigating: "Investigando",
  identified: "Causa identificada",
  monitoring: "Acompanhando recuperação",
  resolved: "Resolvido",
} as const;
const detailsSchema = z.object({
  phase: z.enum(["investigating", "identified", "monitoring", "resolved"]),
  impact: z.string().trim().max(300),
  nextUpdate: z.string().datetime({ offset: true }).nullable(),
  startsAt: z.string().datetime({ offset: true }).nullable(),
});
export const state = z.enum(["operational", "degraded", "unavailable", "maintenance", "unknown"]);
export const labels: Record<z.infer<typeof state> | "automatic", string> = {
  operational: "Operacional",
  degraded: "Instabilidade",
  unavailable: "Indisponível",
  maintenance: "Em manutenção",
  unknown: "Sem confirmação",
  automatic: "Automático",
};
export const snapshotSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  components: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        status: state,
        message: z.string(),
        source: z.enum(["automatic", "manual", "module"]),
        checkedAt: z.string().nullable(),
        startsAt: z.string().nullable().optional(),
        scheduled: z
          .object({ startsAt: z.string(), endsAt: z.string(), message: z.string() })
          .nullable()
          .optional(),
      }),
    )
    .length(7),
  events: z
    .array(
      z.object({
        id: z.number(),
        component: z.string(),
        status: state.or(z.literal("automatic")),
        message: z.string(),
        source: z.enum(["automatic", "manual"]),
        createdAt: z.string(),
      }),
    )
    .max(40),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const saveSchema = z
  .object({
    key: z.enum([
      "panel",
      "auth",
      "desbanimento",
      "sms",
      "social",
      "prospect_maps",
      "prospect_cnpj",
    ]),
    status: state.exclude(["unknown"]).nullable(),
    message: z.string().trim().max(500),
    expires: z.string().datetime({ offset: true }).nullable(),
    details: detailsSchema.optional(),
  })
  .refine((v) => !v.status || v.status === "operational" || v.message.length >= 5, {
    message: "Escreva um aviso público com pelo menos 5 caracteres.",
  });
export type Save = z.infer<typeof saveSchema>;
export const MONITOR_HEALTH_URL = ENDPOINT + "?health=monitor";
export function brasiliaInput(iso: string | null | undefined) {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "";
  return new Date(Date.parse(iso) - 3 * 3600000).toISOString().slice(0, 16);
}
export function fromBrasiliaInput(value: string) {
  if (!value) return null;
  const parsed = new Date(value + ":00-03:00");
  if (!Number.isFinite(parsed.getTime())) throw Error("Confira a data e o horário de Brasília.");
  return parsed.toISOString();
}
export function visibleSnapshot(data: Snapshot, now = Date.now()): Snapshot {
  const stale =
    now - Date.parse(data.generatedAt) > 600000 || Date.parse(data.generatedAt) > now + 60000;
  return {
    ...data,
    components: data.components.map((c) =>
      c.source === "automatic" &&
      (stale ||
        !c.checkedAt ||
        now - Date.parse(c.checkedAt) > 600000 ||
        !Number.isFinite(Date.parse(c.checkedAt)))
        ? { ...c, status: "unknown" }
        : c,
    ),
  };
}
export function overall(data: Snapshot) {
  return (
    (["unavailable", "maintenance", "degraded", "unknown", "operational"] as const).find((s) =>
      data.components.some((c) => c.status === s),
    ) ?? "unknown"
  );
}
