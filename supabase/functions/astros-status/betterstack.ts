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
