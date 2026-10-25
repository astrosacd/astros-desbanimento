type InstagramObject = Record<string, any>;
const instagramReserved = new Set([
  "p",
  "reel",
  "reels",
  "stories",
  "explore",
  "accounts",
  "direct",
  "about",
  "developer",
  "developers",
  "legal",
  "privacy",
  "terms",
  "share",
]);
export function instagramHandle(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      !["instagram.com", "www.instagram.com", "m.instagram.com"].includes(
        u.hostname.toLowerCase(),
      ) ||
      u.username ||
      u.password ||
      u.port
    )
      return null;
    const match = u.pathname.match(/^\/([a-zA-Z0-9_][a-zA-Z0-9_.]{0,29})\/?$/);
    const handle = match?.[1]?.toLowerCase();
    return handle && !instagramReserved.has(handle) ? handle : null;
  } catch {
    return null;
  }
}
export function instagramCandidates(snapshot: InstagramObject): string[] {
  const contacts = Array.isArray(snapshot.contacts) ? snapshot.contacts.slice(0, 20) : [];
  return [
    ...new Set(
      [snapshot.website, ...contacts.map((c: InstagramObject) => c?.url)]
        .map(instagramHandle)
        .filter((v): v is string => !!v),
    ),
  ].slice(0, 5);
}
function instagramText(v: unknown, max: number) {
  return typeof v === "string"
    ? v
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .trim()
        .slice(0, max)
    : "";
}
function instagramUrl(v: unknown) {
  try {
    const u = new URL(String(v));
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      u.hostname.includes(".") &&
      u.href.length <= 2048
      ? u.href
      : "";
  } catch {
    return "";
  }
}
export function instagramProjection(data: InstagramObject, handle: string) {
  const p = data?.profile_results;
  if (
    data?.search_metadata?.status !== "Success" ||
    !p ||
    instagramText(p.username, 30).toLowerCase() !== handle ||
    p.is_private !== false
  )
    throw Error("Perfil Instagram não confirmado");
  const numeric = (v: unknown) =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 10000000000 ? v : null;
  const bio = instagramText(p.biography, 2200);
  const emails = [
    ...new Set(bio.match(/[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}/gi) || []),
  ].slice(0, 5);
  const phones = [
    ...new Set(
      (bio.match(/\+?\d[\d ().-]{7,25}\d/g) || [])
        .map((v) => v.trim())
        .filter((v) => {
          const n = v.replace(/\D/g, "");
          return n.length >= 10 && n.length <= 15;
        }),
    ),
  ].slice(0, 5);
  const links = [
    ...new Set(
      [
        p.external_url,
        ...(Array.isArray(p.bio_links)
          ? p.bio_links.slice(0, 10).map((v: InstagramObject) => v?.url)
          : []),
      ]
        .map(instagramUrl)
        .filter(Boolean),
    ),
  ].slice(0, 10);
  // Explicit projection only: no provider metadata, media, private contact fields or remote images.
  return {
    username: handle,
    url: "https://www.instagram.com/" + handle + "/",
    name: instagramText(p.full_name, 200),
    biography: bio,
    followers: numeric(p.followers),
    following: numeric(p.following),
    professional: typeof p.is_professional_account === "boolean" ? p.is_professional_account : null,
    verified: typeof p.is_verified === "boolean" ? p.is_verified : null,
    links,
    emails,
    phones,
    source: "instagram_profile",
    queriedAt: new Date().toISOString(),
  };
}
export async function handleInstagram(
  action: string,
  data: InstagramObject,
  actor: InstagramObject,
  db: (path: string, method?: string, body?: unknown) => Promise<any>,
  optional: (name: string, body: unknown) => Promise<any>,
  sync: () => Promise<any>,
  supplier: (path: string, params: Record<string, string>) => Promise<any>,
) {
  const config = await optional("astros_instagram_config", {
    actor: actor.id,
    administrator: action.startsWith("admin-"),
  });
  if (action === "admin-instagram-config") return config || { installed: false, enabled: false };
  if (!config) {
    if (action === "instagram-read")
      return { installed: false, enabled: false, candidates: [], request: { state: "none" } };
    throw Error("Ative a atualização Instagram antes de continuar");
  }
  if (action === "admin-instagram-save") {
    if (
      typeof data.enabled !== "boolean" ||
      ![data.dailyCalls, data.userDaily, data.reserveCalls].every(Number.isSafeInteger)
    )
      throw Error("Configuração Instagram inválida");
    await db("rpc/astros_instagram_save", "POST", {
      actor: actor.id,
      active: data.enabled,
      daily_limit: data.dailyCalls,
      user_limit: data.userDaily,
      reserve_limit: data.reserveCalls,
    });
    return { saved: true };
  }
  const uuidCheck = (v: unknown) => {
    if (
      typeof v !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
    )
      throw Error("Referência Instagram inválida");
    return v;
  };
  const lead = uuidCheck(data.leadId),
    origin = data.source;
  if (!["maps", "cnpj"].includes(origin)) throw Error("Origem inválida");
  const args = { actor: actor.id, lead_key: lead, origin_key: origin };
  const snapshot = await db("rpc/astros_instagram_snapshot", "POST", args);
  const candidates = instagramCandidates(snapshot);
  if (action === "instagram-consult") {
    const id = uuidCheck(data.requestId),
      handle = typeof data.profileId === "string" ? data.profileId.toLowerCase() : "";
    if (!candidates.includes(handle)) throw Error("Perfil não consta nos links deste lead");
    if (config.enabled) await sync().catch(() => {});
    const begin = await db("rpc/astros_instagram_begin", "POST", {
      ...args,
      request_key: id,
      profile_key: handle,
    });
    if (begin.dispatch) {
      let projection = null;
      try {
        projection = instagramProjection(
          await supplier("search.json", { engine: "instagram_profile", profile_id: handle }),
          handle,
        );
      } catch {
        /* Never repeat an uncertain supplier call. */
      }
      await db("rpc/astros_instagram_finish", "POST", {
        actor: actor.id,
        request_key: begin.requestId,
        payload: projection,
      });
    }
  } else if (action !== "instagram-read") throw Error("Operação Instagram indisponível");
  return { ...config, candidates, request: await db("rpc/astros_instagram_read", "POST", args) };
}
