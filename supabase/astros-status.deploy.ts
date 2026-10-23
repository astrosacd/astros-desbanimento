// Only the owner's fixed status page is writable. Tokens never enter public payloads.
type BridgeDb = (path: string, body?: unknown) => Promise<any>;
type BridgeItem = {
  component: string;
  resource_id: string | null;
  report_id: string | null;
  report_type: "manual" | "maintenance" | null;
  title: string | null;
  pending: boolean;
  fingerprint: string | null;
};
const bridgeNames: Record<string, string> = {
  panel: "Painel e acesso",
  auth: "Autenticação",
  desbanimento: "Desbanimento",
  sms: "Ativações SMS",
  social: "Redes sociais",
  prospect_maps: "Prospecção · Google Maps",
  prospect_cnpj: "Prospecção · CNPJ",
};
const bridgeMessages: Record<string, string> = {
  operational: "Verificação técnica normalizada.",
  degraded: "Instabilidade detectada na verificação técnica.",
  unavailable: "Falhas consecutivas na verificação técnica. Novas solicitações podem ser afetadas.",
  maintenance: "Serviço em manutenção. Pedidos já iniciados continuam em acompanhamento.",
  unknown: "Não foi possível confirmar a disponibilidade técnica deste serviço.",
};
class BridgeError extends Error {
  constructor(readonly category: string) {
    super(category);
  }
}
const bridgeId = (v: unknown): v is string => typeof v === "string" && /^[0-9]{1,20}$/.test(v);
export function mapBridgeResources(payload: any) {
  if (!Array.isArray(payload) || payload.length > 200) throw new BridgeError("mapping_mismatch");
  const map: Record<string, string> = {};
  for (const [key, name] of Object.entries(bridgeNames)) {
    const found = payload.filter(
      (r) =>
        typeof r?.attributes?.public_name === "string" &&
        r.attributes.public_name.normalize("NFC").trim() === name,
    );
    if (
      found.length !== 1 ||
      found[0].attributes.resource_type !== "ManuallyTrackedItem" ||
      !bridgeId(found[0].id)
    )
      throw new BridgeError("mapping_mismatch");
    map[key] = found[0].id;
  }
  if (new Set(Object.values(map)).size !== 7) throw new BridgeError("mapping_mismatch");
  return map;
}
export function bridgeTarget(status: string) {
  if (!Object.prototype.hasOwnProperty.call(bridgeMessages, status))
    throw new BridgeError("invalid_response");
  return status === "operational"
    ? "resolved"
    : status === "maintenance"
      ? "maintenance"
      : status === "unavailable"
        ? "downtime"
        : "degraded";
}
export async function syncBetterStack(options: {
  apiKey: string | undefined;
  db: BridgeDb;
  fetcher: typeof fetch;
  readJson: (r: Response) => Promise<any>;
}) {
  const { apiKey, db, fetcher, readJson } = options;
  let batch: any;
  try {
    batch = await db("rpc/astros_status_bridge_claim", {});
  } catch {
    return { installed: false };
  }
  if (!batch) return { skipped: true };
  const finish = (result: string) =>
    db("rpc/astros_status_bridge_finish", { lease_token: batch.lease, result });
  if (!apiKey) {
    await finish("configuration_missing");
    return { synced: false };
  }
  let globalResult = "ok";
  const root = "https://incidents.betterstack.com/api/v2/status-pages/268731";
  const api = async (path: string, method = "GET", body?: unknown) => {
    let response: Response;
    try {
      response = await fetcher(root + path, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(8000),
        headers: {
          Authorization: "Bearer " + apiKey,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new BridgeError("api_unavailable");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new BridgeError(
        [400, 401, 403, 404, 405, 409, 422, 429].includes(response.status)
          ? "api_rejected"
          : "api_unavailable",
      );
    }
    try {
      const data = await readJson(response);
      if (
        method !== "GET" &&
        (!bridgeId(data?.data?.id) ||
          !data.data.attributes ||
          typeof data.data.attributes !== "object")
      )
        throw new BridgeError("invalid_response");
      if (method === "POST" && path.endsWith("/status-updates")) {
        const expected = path.split("/")[2];
        if (
          data.data.type !== "status_update" ||
          String(data.data.attributes.status_report_id) !== expected ||
          data.data.attributes.message !== (body as any)?.message
        )
          throw new BridgeError("invalid_response");
      }
      return data;
    } catch {
      throw new BridgeError("invalid_response");
    }
  };
  const list = async (path: string) => {
    const rows: any[] = [];
    for (let page = 1; page <= 4; page++) {
      const p = await api(path + "?per_page=50&page=" + page);
      if (!Array.isArray(p?.data) || p.data.length > 50) throw new BridgeError("invalid_response");
      rows.push(...p.data);
      if (!p.links?.next && p.data.length < 50) return rows;
      if (p.links && p.links.next === null) return rows;
    }
    throw new BridgeError("invalid_response");
  };
  const patch = async (item: BridgeItem, changes: Record<string, unknown>) => {
    await db("rpc/astros_status_bridge_checkpoint", {
      lease_token: batch.lease,
      component_key: item.component,
      patch: changes,
    });
    Object.assign(item, changes);
  };
  // Exact title + page + resource + type identify a possibly accepted create after a timeout.
  let reportsPromise: Promise<any[]> | undefined;
  const validateReport = (p: any, item: BridgeItem) => {
    const r = p?.data,
      a = r?.attributes;
    if (
      !bridgeId(r?.id) ||
      Number(a?.status_page_id) !== 268731 ||
      a?.title !== item.title ||
      a?.report_type !== item.report_type ||
      !Array.isArray(a?.affected_resources) ||
      a.affected_resources.length !== 1 ||
      String(a.affected_resources[0].status_page_resource_id) !== item.resource_id
    )
      throw new BridgeError("mapping_mismatch");
    return a;
  };
  const lastMessage = (p: any) => {
    if (!Array.isArray(p?.included)) return null;
    const updates = p.included.filter(
      (u: any) =>
        u?.type === "status_update" &&
        typeof u.attributes?.message === "string" &&
        Number.isFinite(Date.parse(u.attributes?.published_at)),
    );
    updates.sort(
      (a: any, b: any) =>
        Date.parse(b.attributes.published_at) - Date.parse(a.attributes.published_at) ||
        Number(b.id) - Number(a.id),
    );
    return updates[0]?.attributes?.message ?? null;
  };
  try {
    if (
      batch.pageId !== "268731" ||
      !Array.isArray(batch.items) ||
      batch.items.length !== 7 ||
      !Array.isArray(batch.snapshot?.components) ||
      batch.snapshot.components.length !== 7
    )
      throw new BridgeError("invalid_response");
    const page = await api("");
    if (page?.data?.attributes?.subdomain !== "astros-mais" || String(page.data.id) !== "268731")
      throw new BridgeError("mapping_mismatch");
    const resources = mapBridgeResources(await list("/resources"));
    const components = new Map(batch.snapshot.components.map((c: any) => [c.key, c]));
    if (components.size !== 7 || Object.keys(bridgeNames).some((k) => !components.has(k)))
      throw new BridgeError("invalid_response");
    // Validate every mapping before any report is modified.
    for (const item of batch.items) {
      if (
        !(item.component in bridgeNames) ||
        (item.resource_id && item.resource_id !== resources[item.component])
      )
        throw new BridgeError("mapping_mismatch");
    }
    const outcomes = await Promise.all(
      batch.items.map(async (item: BridgeItem) => {
        try {
          await patch(item, { resource_id: resources[item.component] });
          const c: any = components.get(item.component);
          let status = c.status;
          if (
            c.source === "automatic" &&
            (!c.checkedAt ||
              !Number.isFinite(Date.parse(c.checkedAt)) ||
              Date.now() - Date.parse(c.checkedAt) > 600000)
          )
            status = "unknown";
          const target = bridgeTarget(status),
            kind = target === "maintenance" ? "maintenance" : "manual";
          // Markdown escaping keeps the admin's public message plain text on Better Stack.
          const message = String(c.message || bridgeMessages[status]).replace(
            /[\\`*_{}\[\]<>#]/g,
            "\\$&",
          );
          const fingerprint = Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(JSON.stringify([status, message, c.source])),
              ),
            ),
          )
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          if (item.pending && !item.report_id) {
            const reports = await (reportsPromise ??= list("/status-reports"));
            const matches = reports.filter((r) => r?.attributes?.title === item.title);
            if (matches.length !== 1) throw new BridgeError("awaiting_confirmation");
            validateReport({ data: matches[0] }, item);
            await patch(item, { report_id: matches[0].id, pending: false });
          }
          let current: any = null;
          if (item.report_id) {
            current = await api("/status-reports/" + item.report_id);
            validateReport(current, item);
          }
          // A resolved manual notice is published once; recovering a service closes only our report.
          if (current && target === "resolved") {
            const a = current.data.attributes;
            if (item.report_type === "maintenance") {
              if (Date.parse(a.ends_at) > Date.now())
                await api("/status-reports/" + item.report_id, "PATCH", {
                  ends_at: new Date().toISOString(),
                });
            } else if (
              a.affected_resources[0].status !== "resolved" ||
              (item.fingerprint !== fingerprint && lastMessage(current) !== message)
            ) {
              await api("/status-reports/" + item.report_id + "/status-updates", "POST", {
                message,
                notify_subscribers: false,
                affected_resources: [
                  { status_page_resource_id: item.resource_id, status: "resolved" },
                ],
              });
            }
            await patch(item, {
              report_id: null,
              report_type: null,
              title: null,
              pending: false,
              fingerprint,
              diagnostic: "ok",
              synced: true,
            });
            return "ok";
          }
          // Close only our own report when changing report type.
          if (
            current &&
            (item.report_type !== kind ||
              (item.report_type === "manual" &&
                current.data.attributes.aggregate_state === "resolved"))
          ) {
            const attributes = current.data.attributes;
            if (item.report_type === "maintenance") {
              if (Date.parse(attributes.ends_at) > Date.now())
                await api("/status-reports/" + item.report_id, "PATCH", {
                  ends_at: new Date().toISOString(),
                });
            } else if (attributes.affected_resources[0].status !== "resolved") {
              await api("/status-reports/" + item.report_id + "/status-updates", "POST", {
                message: "Atualização da condição do serviço.",
                notify_subscribers: false,
                affected_resources: [
                  { status_page_resource_id: item.resource_id, status: "resolved" },
                ],
              });
            }
            await patch(item, {
              report_id: null,
              report_type: null,
              title: null,
              pending: false,
              fingerprint: null,
            });
            current = null;
          }
          if (
            target === "resolved" &&
            !current &&
            !(c.source === "manual" && c.message && item.fingerprint !== fingerprint)
          ) {
            // A verified healthy service needs no synthetic incident or invented uptime history.
            await patch(item, { fingerprint, diagnostic: "ok", synced: true });
            return "ok";
          }
          if (!current) {
            if (item.pending) throw new BridgeError("awaiting_confirmation");
            const title =
              bridgeNames[item.component] +
              " · " +
              new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza", hour12: false });
            await patch(item, { title, report_type: kind, pending: true, fingerprint: null });
            const expiry = c.source === "manual" ? batch.expiries?.[item.component] : null;
            const endsAt =
              typeof expiry === "string" && Date.parse(expiry) > Date.now()
                ? expiry
                : new Date(Date.now() + 90 * 86400000).toISOString();
            try {
              const created = await api("/status-reports", "POST", {
                title,
                message,
                report_type: kind,
                notify_subscribers: false,
                affected_resources: [{ status_page_resource_id: item.resource_id, status: target }],
                ...(kind === "maintenance"
                  ? { starts_at: new Date().toISOString(), ends_at: endsAt }
                  : {}),
              });
              validateReport(created, item);
              await patch(item, {
                report_id: created.data.id,
                pending: false,
                fingerprint,
                diagnostic: "ok",
                synced: true,
              });
              return "ok";
            } catch (e) {
              if (e instanceof BridgeError && e.category === "api_rejected")
                await patch(item, { pending: false });
              throw e;
            }
          }
          if (kind === "maintenance") {
            const expiry = c.source === "manual" ? batch.expiries?.[item.component] : null;
            const end =
              typeof expiry === "string" && Date.parse(expiry) > Date.now()
                ? expiry
                : new Date(Date.now() + 90 * 86400000).toISOString();
            const saved = current.data.attributes.ends_at;
            if (
              (expiry && Date.parse(saved) !== Date.parse(end)) ||
              (!expiry && Date.parse(saved) < Date.now() + 86400000)
            )
              await api("/status-reports/" + item.report_id, "PATCH", { ends_at: end });
            if (item.fingerprint !== fingerprint && lastMessage(current) !== message)
              await api("/status-reports/" + item.report_id + "/status-updates", "POST", {
                message,
                notify_subscribers: false,
              });
          } else if (
            current.data.attributes.affected_resources[0].status !== target ||
            (item.fingerprint !== fingerprint && lastMessage(current) !== message)
          ) {
            await api("/status-reports/" + item.report_id + "/status-updates", "POST", {
              message,
              notify_subscribers: false,
              affected_resources: [{ status_page_resource_id: item.resource_id, status: target }],
            });
          }
          await patch(item, { fingerprint, diagnostic: "ok", synced: true });
          return "ok";
        } catch (e) {
          const reason = e instanceof BridgeError ? e.category : "api_unavailable";
          await patch(item, { diagnostic: reason }).catch(() => {});
          return reason;
        }
      }),
    );
    globalResult = outcomes.find((r) => r !== "ok") ?? "ok";
  } catch (e) {
    globalResult = e instanceof BridgeError ? e.category : "api_unavailable";
  }
  await finish(globalResult);
  return { synced: globalResult === "ok" };
}

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
  if (response.ok && response.status === 204) return null;
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
    let etapa = "inicio";
    const db = async (path: string, body?: unknown) => {
      etapa = path.split("?")[0];
      return fetchJson(base + "/rest/v1/" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          apikey: service,
          Authorization: "Bearer " + service,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    };
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
                  "https://api.smspool.net/request/balance",
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
            if ((!five && p?.success === 0) || !validBalance(p?.balance) || (five && !(Number.isSafeInteger(p?.id) && p.id > 0)))
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
      return reply({ error: "Não foi possível concluir a verificação", etapa }, 503);
    }
  };
}
if (typeof Deno !== "undefined" && typeof Deno.serve === "function")
  Deno.serve(createHandler((key) => Deno.env.get(key)));
