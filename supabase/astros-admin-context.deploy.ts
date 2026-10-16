declare const Deno: {
  env: { get: (key: string) => string | undefined };
  serve: (fn: (req: Request) => Promise<Response>) => void;
};
type Obj = Record<string, any>;
const env = (key: string) => {
  const v = Deno.env.get(key);
  if (!v) throw Error("Configuração indisponível.");
  return v;
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
async function rest(path: string, token: string, service = false, data?: unknown) {
  const key = env(service ? "SUPABASE_SERVICE_ROLE_KEY" : "SUPABASE_ANON_KEY");
  const r = await fetch(env("SUPABASE_URL") + "/rest/v1/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      apikey: key,
      Authorization: "Bearer " + (service ? key : token),
      "Content-Type": "application/json",
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw Error("Consulta indisponível.");
  return r.json();
}
export function chatwootBase(input: unknown) {
  if (typeof input !== "string") throw Error("Atendimento indisponível.");
  const u = new URL(input);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash ||
    u.port ||
    !u.hostname.includes(".") ||
    /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname) ||
    /^[\d.]+$/.test(u.hostname) ||
    /\.(local|internal|localhost)$/.test(u.hostname)
  )
    throw Error("Atendimento indisponível.");
  return u.origin;
}
async function support(token: string) {
  try {
    const c = await rest("rpc/astros_support_bridge_config", token, true, {});
    if (
      !c?.enabled ||
      !c.apiToken ||
      !c.websiteToken ||
      !Number.isSafeInteger(c.accountId) ||
      c.accountId < 1
    )
      throw Error("not configured");
    const base = chatwootBase(c.baseUrl);
    async function read(path: string) {
      const r = await fetch(base + `/api/v1/accounts/${c.accountId}/` + path, {
        headers: { api_access_token: c.apiToken, Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw Error("support unavailable");
      const raw = await r.text();
      if (raw.length > 2000000) throw Error("large response");
      return JSON.parse(raw);
    }
    const inboxes = await read("inboxes");
    const matches = Array.isArray(inboxes.payload)
      ? inboxes.payload.filter((i: Obj) => i["website_token"] === c.websiteToken)
      : [];
    if (matches.length !== 1 || !Number.isSafeInteger(matches[0].id))
      throw Error("inbox not confirmed");
    const inbox = matches[0].id;
    const r = await read(`conversations?status=open&assignee_type=all&inbox_id=${inbox}&page=1`);
    const d = r.data ?? r;
    if (
      !Array.isArray(d.payload) ||
      !Number.isSafeInteger(d.meta?.all_count) ||
      d.meta.all_count < 0 ||
      d.payload.some((x: Obj) => x["inbox_id"] !== inbox || x["status"] !== "open")
    )
      throw Error("invalid response");
    return {
      available: true,
      scope:
        "Caixa de atendimento do painel, estado aberto no momento da consulta; não filtrado pelo período nem pelo cliente.",
      openCount: d.meta.all_count,
      recent: d.payload
        .slice(0, 10)
        .map((x: Obj) => ({
          id: x["id"],
          status: x["status"],
          createdAt: x["created_at"],
          customerName: String(x["meta"]?.sender?.name ?? "").slice(0, 180),
          customerEmail: String(x["meta"]?.sender?.email ?? "").slice(0, 254),
        })),
    };
  } catch {
    return {
      available: false,
      message:
        "Não foi possível confirmar os chamados do inbox do painel no Chatwoot. Não interpretar como zero.",
    };
  }
}
export async function handler(req: Request) {
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer /i, "");
    if (!token) return json({ error: "Entre na administração." }, 401);
    const a = await fetch(env("SUPABASE_URL") + "/auth/v1/user", {
      headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: "Bearer " + token },
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
    if (!a.ok) return json({ error: "Sessão inválida." }, 401);
    const u = await a.json();
    if (
      !u.id ||
      !u.email_confirmed_at ||
      u.app_metadata?.astros_password_change_required === true ||
      (u.banned_until && Date.parse(u.banned_until) > Date.now())
    )
      return json({ error: "Conta indisponível." }, 403);
    const p = await rest(
      "painel_de_desbanimento?id=eq." +
        encodeURIComponent(u.id) +
        "&select=id,tipo_usuario&limit=1",
      token,
    );
    if (p[0]?.id !== u.id || p[0]?.tipo_usuario !== "admin")
      return json({ error: "Acesso restrito à administração." }, 403);
    const raw = await req.text();
    if (raw.length > 1000) return json({ error: "Consulta inválida." }, 400);
    const data = JSON.parse(raw);
    if (
      !data ||
      Object.keys(data).some((k) => !["from", "until", "clientSearch"].includes(k)) ||
      typeof data.from !== "string" ||
      typeof data.until !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.until) ||
      typeof data.clientSearch !== "string" ||
      data.clientSearch.length > 100
    )
      return json({ error: "Consulta inválida." }, 400);
    const snapshot = await rest("rpc/astros_assistant_snapshot", token, false, {
      date_from: data.from,
      date_until: data.until,
      client_search: data.clientSearch,
    });
    const chatwoot = await support(token);
    return json({
      snapshot,
      chatwoot,
      sources: [
        { name: "Supabase · registros internos", available: true },
        { name: "Chatwoot · chamados abertos", available: chatwoot.available },
      ],
    });
  } catch {
    return json(
      {
        error:
          "Não foi possível consultar as fontes administrativas. Confira a ativação do SQL e da função.",
      },
      400,
    );
  }
}
if (typeof Deno !== "undefined" && typeof Deno.serve === "function") Deno.serve(handler);
