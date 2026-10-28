import { actorInput, criteria, integer, profiles, toolKey, tools, uuid } from "./core.ts";
declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (fn: (req: Request) => Promise<Response>) => void;
};
type Obj = Record<string, any>;
const messages = new Set([
  "Instale o complemento da exclusão de contas antes de liberar clientes.",
  "Instale o complemento financeiro antes de ativar.",
  "Conta indisponível",
  "Acesso administrativo necessário",
  "Configuração alterada. Recarregue antes de salvar.",
  "Configuração inválida.",
  "Configure preço e limites de cada ferramenta.",
  "Confira as pesquisas pendentes antes de trocar a chave.",
  "Configure a chave Apify antes de ativar.",
  "Pesquisa inválida.",
  "Referência de pesquisa divergente.",
  "Novas pesquisas estão indisponíveis para esta conta.",
  "Confira o preço novamente.",
  "Quantidade inválida.",
  "Confira a pesquisa anterior antes de iniciar outra.",
  "Limite diário de pesquisas atingido.",
  "Capacidade ocupada. Tente mais tarde.",
  "Limite diário do fornecedor atingido.",
  "Saldo insuficiente. Faça uma recarga.",
  "Pesquisa não encontrada na sua conta.",
  "Resultado indisponível.",
  "Coleção inválida.",
  "Limite de 1.000 itens salvos atingido.",
]);
function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw Error("A Pesquisa digital ainda precisa ser configurada.");
  return value;
}
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
export async function boundedJson(response: Response, max = 2_000_000) {
  const reader = response.body?.getReader();
  if (!reader) throw Error("Resposta indisponível.");
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const p = await reader.read();
    if (p.done) break;
    size += p.value.length;
    if (size > max) {
      await reader.cancel();
      throw Error("Resposta muito grande.");
    }
    parts.push(p.value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const p of parts) {
    all.set(p, offset);
    offset += p.length;
  }
  return JSON.parse(new TextDecoder().decode(all));
}
async function db(path: string, body?: unknown) {
  const r = await fetch(env("SUPABASE_URL") + "/rest/v1/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
      Authorization: "Bearer " + env("SUPABASE_SERVICE_ROLE_KEY"),
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
    signal: AbortSignal.timeout(12000),
  });
  const v = await boundedJson(r);
  if (!r.ok) {
    if (["PGRST202", "42P01", "42883"].includes(v?.code))
      throw Error("A Pesquisa digital ainda precisa ser instalada.");
    throw Error(
      messages.has(v?.message) ? v.message : "Não foi possível confirmar a Pesquisa digital.",
    );
  }
  return v;
}
async function identity(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) throw Error("Entre novamente para continuar.");
  const r = await fetch(env("SUPABASE_URL") + "/auth/v1/user", {
    headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: auth },
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  const user = r.ok ? await boundedJson(r, 100000) : null;
  if (
    !user?.id ||
    !user.email_confirmed_at ||
    user.app_metadata?.astros_password_change_required === true ||
    (user.banned_until && Date.parse(user.banned_until) > Date.now())
  )
    throw Error("Entre com uma conta confirmada e conclua a atualização de senha.");
  const p = await db(
    "painel_de_desbanimento?id=eq." + uuid(user.id) + "&select=id,tipo_usuario&limit=1",
  );
  if (!p[0]) throw Error("Conta indisponível");
  return p[0];
}
const rpc = (actor: string, operation: string, input: unknown = {}) =>
  db("rpc/astros_digital_call", { actor, operation, input });
async function provider(path: string, init: RequestInit = {}) {
  const secret = (await db("astros_digital_private?id=eq.true&select=api_key"))[0]?.api_key;
  if (!secret) throw Error("Configure a chave Apify antes de ativar.");
  return fetch("https://api.apify.com/v2/" + path, {
    ...init,
    headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(22000),
  });
}
async function start(actor: string, data: Obj) {
  const id = uuid(data.requestId),
    tool = toolKey(data.tool),
    c = criteria(tool, data.query, data.quantity);
  const begun = await rpc(actor, "start", {
    ...c,
    requestId: id,
    tool,
    unitCents: integer(data.unitCents, 1, 10000),
    version: integer(data.version, 1, 2147483647),
  });
  if (!begun.execute) return begun.request;
  // Reservation/dispatch intent is durable before POST. There is deliberately no POST retry.
  try {
    const params = new URLSearchParams({
      timeout: "600",
      memory: "1024",
      restartOnError: "false",
      waitForFinish: "0",
      maxItems: String(c.quantity),
      maxTotalChargeUsd: String(begun.maxUsdCents / 100),
    });
    const r = await provider("acts/" + tools[tool].actor + "/runs?" + params, {
      method: "POST",
      body: JSON.stringify(actorInput(tool, c.query, c.quantity)),
    });
    const v = await boundedJson(r, 150000);
    if (!r.ok) {
      if (
        [400, 401, 403, 404, 422].includes(r.status) &&
        v?.error &&
        typeof v.error.type === "string" &&
        !v.data
      )
        return await rpc(actor, "reject", { id });
      throw Error("Resultado do envio não confirmado.");
    }
    const run = v?.data;
    if (!run?.id || !run.defaultDatasetId) throw Error("Resultado do envio não confirmado.");
    return await rpc(actor, "record-run", { id, runId: run.id, datasetId: run.defaultDatasetId });
  } catch {
    await rpc(actor, "review", { id }).catch(() => {});
    return await rpc(actor, "status", { id });
  }
}
async function refresh(actor: string, id: string) {
  const claim = await rpc(actor, "check-claim", { id });
  if (!claim.runId) return rpc(actor, "status", { id });
  try {
    const r = await provider("actor-runs/" + claim.runId);
    if (!r.ok) throw Error("Conferência indisponível.");
    const v = (await boundedJson(r, 150000))?.data;
    if (v?.id !== claim.runId || v?.defaultDatasetId !== claim.datasetId)
      throw Error("Conferência divergente.");
    if (v.status === "SUCCEEDED") {
      const p = new URLSearchParams({
        fields:
          "username,userName,fullName,full_name,biography,externalUrl,businessEmail,publicEmail,businessPhoneNumber,publicPhoneNumber,followersCount,followsCount,followingCount,postsCount,isPrivate,isVerified,error,errorDescription",
        format: "json",
        clean: "true",
        limit: String(claim.quantity),
        offset: "0",
      });
      const items = await provider("datasets/" + claim.datasetId + "/items?" + p);
      if (!items.ok) throw Error("Resultados indisponíveis.");
      const rows = profiles(await boundedJson(items), claim.quantity);
      return await rpc(actor, "finish", { id, lease: claim.lease, rows });
    }
    if (["FAILED", "TIMED-OUT", "ABORTED"].includes(v.status)) await rpc(actor, "review", { id });
  } catch {
    /* Transport failures preserve funds and the original run; read errors never launch a new one. */
  } finally {
    await rpc(actor, "check-release", { id, lease: claim.lease }).catch(() => {});
  }
  return rpc(actor, "status", { id });
}
export async function handler(req: Request) {
  try {
    if (req.method !== "POST") return json({ error: "Método indisponível." }, 405);
    if (Number(req.headers.get("content-length") || 0) > 16000)
      return json({ error: "Pedido muito grande." }, 413);
    const raw = await req.text();
    if (raw.length > 16000) return json({ error: "Pedido muito grande." }, 413);
    const body = JSON.parse(raw),
      action = body.action,
      data = body.data ?? {};
    const actor = await identity(req);
    if (typeof action !== "string" || !data || typeof data !== "object" || Array.isArray(data))
      throw Error("Pedido inválido.");
    if (action.startsWith("admin-") && actor.tipo_usuario !== "admin")
      throw Error("Acesso administrativo necessário");
    const allowed = [
      "config",
      "admin-config",
      "admin-save",
      "admin-access",
      "admin-usage",
      "history",
      "admin-history",
      "collections",
      "save",
      "unsave",
      "status",
      "admin-status",
    ];
    if (action === "start") return json(await start(actor.id, data));
    if (action === "refresh" || action === "admin-refresh")
      return json(await refresh(actor.id, uuid(data.id)));
    if (!allowed.includes(action)) return json({ error: "Operação indisponível." }, 400);
    // Internal transition RPC names are never accepted from a client request.
    if (action === "config" || action === "admin-config") {
      try {
        return json(await rpc(actor.id, action, {}));
      } catch (e) {
        if (e instanceof Error && e.message === "A Pesquisa digital ainda precisa ser instalada.")
          return json({ installed: false, enabled: false, version: 1, tools: {} });
        throw e;
      }
    }
    return json(await rpc(actor.id, action, data));
  } catch (e) {
    const safe = [
      "Entre novamente para continuar.",
      "Entre com uma conta confirmada e conclua a atualização de senha.",
      "A Pesquisa digital ainda precisa ser instalada.",
      "A Pesquisa digital ainda precisa ser configurada.",
      "Não foi possível confirmar a Pesquisa digital.",
      "Ferramenta inválida.",
      "Referência inválida.",
      "Informe um perfil válido do Instagram.",
      "Informe uma única palavra-chave ou expressão.",
      "Confira a quantidade de perfis.",
    ];
    const message =
      e instanceof Error && (messages.has(e.message) || safe.includes(e.message))
        ? e.message
        : "Não foi possível confirmar a operação. Confira a mesma pesquisa.";
    return json({ error: message }, 400);
  }
}
if (typeof Deno !== "undefined" && typeof Deno.serve === "function") Deno.serve(handler);
