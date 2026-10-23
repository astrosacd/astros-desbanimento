import { syncBetterStack } from "./betterstack.ts";
/** Read-only provider checks, with optional status-only publication to Better Stack. Never calls transaction handlers. */
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (handler: (r: Request) => Promise<Response>) => void;
};
export type Sample = { key: string; result: "ok" | "failed" | "unknown"; diagnostic: string };
const keys = ["panel", "auth", "desbanimento", "sms", "social", "prospect_maps", "prospect_cnpj"];
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Astros-Status-Worker",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};
export async function boundedJson(response: Response): Promise<any> {
  if (!response.ok || !response.body) throw Error("unreachable");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 262144) throw Error("invalid_response");
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    bytes.set(p, at);
    at += p.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function fresh(value: unknown, minutes = 10) {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    Date.parse(value) <= Date.now() + 60000 &&
    Date.now() - Date.parse(value) < minutes * 60000
  );
}
export function validBalance(value: unknown) {
  return (
    (typeof value === "number" || (typeof value === "string" && /^\d+(\.\d+)?$/.test(value))) &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0
  );
}
async function sameSecret(a: string, b: string) {
  const hash = async (s: string) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([hash(a), hash(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
export function createHandler(
  env: (key: string) => string | undefined,
  fetcher: typeof fetch = fetch,
) {
  const fetchJson = (url: string, init: RequestInit = {}, timeoutMs = 8000) =>
    fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(timeoutMs) }).then(
      boundedJson,
    );
  return async (request: Request): Promise<Response> => {
    const reply = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: cors });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!["GET", "POST"].includes(request.method))
      return reply({ error: "Método não permitido" }, 405);
    const base = env("SUPABASE_URL"),
      service = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!base || !service) return reply({ error: "Monitoramento indisponível" }, 503);
    const db = async (path: string, body?: unknown) =>
      fetchJson(base + "/rest/v1/" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          apikey: service,
          Authorization: "Bearer " + service,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    try {
      if (request.method === "GET") return reply(await db("rpc/astros_status_public", {}));
      const supplied = request.headers.get("X-Astros-Status-Worker");
      if (!supplied || supplied.length > 128) return reply({ error: "Não autorizado" }, 401);
      const privateRows = await db("astros_status_private?id=eq.true&select=worker_secret");
      if (
        !privateRows[0]?.worker_secret ||
        !(await sameSecret(supplied, privateRows[0].worker_secret))
      )
        return reply({ error: "Não autorizado" }, 401);
      const token = await db("rpc/astros_status_claim", {});
      if (!token) return reply({ skipped: true });
      const row = async (table: string) => {
        const data = await db(table + "?id=eq.true&select=*");
        return data[0] ?? null;
      };
      const form = (data: Record<string, string>) => ({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(data).toString(),
      });
      const check = async (key: string): Promise<Sample> => {
        const result = (result: Sample["result"], diagnostic: string): Sample => ({
          key,
          result,
          diagnostic,
        });
        try {
          if (key === "panel") {
            const p = await fetchJson("https://mais.astroscomunicacaodigital.com/status-health");
            return p?.service === "astros-mais" && p?.status === "ok" && fresh(p?.timestamp, 2)
              ? result("ok", "ok")
              : result("failed", "invalid_response");
          }
          if (key === "auth") {
            const p = await fetchJson(base + "/auth/v1/settings", { headers: { apikey: service } });
            return p &&
              typeof p.external === "object" &&
              p.external !== null &&
              typeof p.disable_signup === "boolean"
              ? result("ok", "ok")
              : result("failed", "invalid_response");
          }
          if (key === "desbanimento") {
            const token = env("ASTROS_BASEROW_WRITE_TOKEN");
            if (!token) return result("unknown", "configuration_missing");
            const heartbeat = await db("astros_service_worker_status?id=eq.true&select=last_seen");
            if (!fresh(heartbeat[0]?.last_seen, 5)) return result("failed", "worker_stale");
            const fields = await fetchJson(
              "https://baserow.astroscomunicacaodigital.com/api/database/fields/table/511/",
              { headers: { Authorization: "Token " + token } },
            );
            return Array.isArray(fields) &&
              fields.length > 0 &&
              fields.every((f) => typeof f.id === "number" && typeof f.name === "string")
              ? result("ok", "ok")
              : result("failed", "invalid_response");
          }
          const table =
            key === "sms"
              ? "astros_sms"
              : key === "social"
                ? "astros_social"
                : key === "prospect_maps"
                  ? "astros_prospect"
                  : "astros_cnpj";
          const settings = await row(table + "_settings");
          if (!settings) return result("unknown", "configuration_missing");
          if (!settings.enabled) return result("unknown", "paused");
          const secret = await row(table + "_private");
          if (!secret) return result("unknown", "configuration_missing");
          if (key === "sms") {
            if (!fresh(settings.worker_at, 3)) return result("failed", "worker_stale");
            const five = settings.active_supplier === "five_sim";
            const apiKey = five ? secret.five_sim_key : secret.api_key;
            if (!apiKey) return result("unknown", "configuration_missing");
            const p = five
              ? await fetchJson(
                  "https://5sim.net/v1/user/profile",
                  {
                    headers: { Authorization: "Bearer " + apiKey, Accept: "application/json" },
                  },
                  15000,
                )
              : await fetchJson(
                  "https://api.smspool.net/user/balance",
                  {
                    method: "POST",
                    body: (() => {
                      const data = new FormData();
                      data.set("key", apiKey);
                      return data;
                    })(),
                  },
                  20000,
                );
            if (!validBalance(p?.balance) || (five && !(Number.isSafeInteger(p?.id) && p.id > 0)))
              return result("failed", "invalid_response");
            return Number(p.balance) > 0
              ? result("ok", "ok")
              : result("failed", "capacity_unavailable");
          }
          if (!secret.api_key) return result("unknown", "configuration_missing");
          if (key === "social") {
            if (!fresh(settings.worker_at, 3)) return result("failed", "worker_stale");
            const p = await fetchJson(
              "https://www.smmraja.com/api/v3",
              form({ key: secret.api_key, action: "balance" }),
            );
            if (!validBalance(p?.balance) || p?.currency !== "USD" || p?.error)
              return result("failed", "invalid_response");
            return Number(p.balance) > 0
              ? result("ok", "ok")
              : result("failed", "capacity_unavailable");
          }
          if (key === "prospect_maps") {
            const capacity = await row("astros_prospect_capacity");
            if (!fresh(capacity?.worker_seen_at, 4)) return result("failed", "worker_stale");
            const p = await fetchJson(
              "https://serpapi.com/account.json?api_key=" + encodeURIComponent(secret.api_key),
            );
            if (!validBalance(p?.total_searches_left)) return result("failed", "invalid_response");
            return Number(p.total_searches_left) > 0
              ? result("ok", "ok")
              : result("failed", "capacity_unavailable");
          }
          const p = await fetchJson("https://api.casadosdados.com.br/v5/saldo", {
            headers: { "api-key": secret.api_key, Accept: "application/json" },
          });
          if (
            typeof p?.saldo_total !== "number" ||
            !validBalance(p.saldo_total) ||
            !p.saldos ||
            typeof p.saldos !== "object" ||
            Array.isArray(p.saldos)
          )
            return result("failed", "invalid_response");
          return p.saldo_total > 0 ? result("ok", "ok") : result("failed", "capacity_unavailable");
        } catch {
          return result("failed", "unreachable");
        }
      };
      const samples = await Promise.all(keys.map(check));
      await db("rpc/astros_status_finish", { lease_token: token, samples });
      // Optional bridge failures cannot discard the local health checks.
      let bridge: unknown = { synced: false };
      try {
        bridge = await syncBetterStack({
          apiKey: env("ASTROS_BETTERSTACK_API_TOKEN"),
          db,
          fetcher,
          readJson: boundedJson,
        });
      } catch {
        /* Private sync diagnostics are persisted by the bridge. */
      }
      return reply({ checked: samples.length, bridge });
    } catch {
      return reply({ error: "Não foi possível concluir a verificação" }, 503);
    }
  };
}
if (typeof Deno !== "undefined" && typeof Deno.serve === "function")
  Deno.serve(createHandler((key) => Deno.env.get(key)));
