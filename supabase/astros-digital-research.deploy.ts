// Fixed catalog: neither browser nor saved configuration may select arbitrary Actors or URLs.
export const tools = {
  instagram_search: { actor: "apify~instagram-search-scraper", title: "Buscar perfis", max: 50 },
  instagram_profile: {
    actor: "apify~instagram-profile-scraper",
    title: "Consultar perfis e contatos públicos",
    max: 10,
  },
  instagram_followers: {
    actor: "apify~instagram-followers-following-scraper",
    title: "Extrair seguidores",
    max: 100,
  },
  linkedin_search: {
    actor: "harvestapi~linkedin-profile-search",
    title: "Buscar profissionais no LinkedIn",
    max: 25,
  },
  linkedin_profile: {
    actor: "harvestapi~linkedin-profile-scraper",
    title: "Consultar perfis no LinkedIn",
    max: 10,
  },
} as const;
export type Tool = keyof typeof tools;
export function toolKey(value: unknown): Tool {
  if (typeof value !== "string" || !Object.hasOwn(tools, value))
    throw Error("Ferramenta inválida.");
  return value as Tool;
}
export function clean(value: unknown, max = 200) {
  return typeof value === "string"
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .trim()
        .slice(0, max)
    : "";
}
export function uuid(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
    throw Error("Referência inválida.");
  return value;
}
export function integer(v: unknown, min: number, max: number) {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max)
    throw Error("Quantidade inválida.");
  return v;
}
export function username(v: unknown) {
  let s = clean(v, 200);
  if (/^https:\/\//i.test(s)) {
    const u = new URL(s);
    if (
      !["instagram.com", "www.instagram.com"].includes(u.hostname) ||
      u.username ||
      u.password ||
      u.port ||
      u.search ||
      u.hash ||
      !/^\/[A-Za-z0-9._]{1,30}\/?$/.test(u.pathname)
    )
      throw Error("Informe um perfil válido do Instagram.");
    s = u.pathname.replaceAll("/", "");
  }
  s = s.replace(/^@/, "").toLowerCase();
  if (
    !/^[a-z0-9._]{1,30}$/.test(s) ||
    ["p", "reel", "reels", "stories", "explore", "accounts", "direct"].includes(s)
  )
    throw Error("Informe um perfil válido do Instagram.");
  return s;
}
export function linkedinIdentifier(value: string): string {
  let identifier = value.trim();
  if (/^https:\/\//i.test(identifier)) {
    const url = new URL(identifier);
    if (
      !/^(?:[a-z]{2}\.|www\.)?linkedin\.com$/.test(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      !/^\/in\/[^/]+\/?$/.test(url.pathname)
    )
      throw Error("Informe um perfil válido do LinkedIn.");
    identifier = url.pathname.split("/")[2] ?? "";
  }
  if (!/^[a-z0-9][a-z0-9-]{2,99}$/i.test(identifier))
    throw Error("Informe um perfil válido do LinkedIn.");
  return identifier.toLowerCase();
}
export function linkedinIdentifiers(value: string) {
  return [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .filter(Boolean)
        .map(linkedinIdentifier),
    ),
  ];
}
export function criteria(tool: Tool, value: unknown, quantity: unknown) {
  const count = integer(quantity, 1, tools[tool].max);
  if (typeof value !== "string" || value.length > 500) throw Error("Pesquisa inválida.");
  if (tool === "linkedin_profile") {
    const names = linkedinIdentifiers(value);
    if (names.length !== count) throw Error("Confira a quantidade de perfis.");
    return { query: names.join(","), quantity: count };
  }
  if (tool === "instagram_search" || tool === "linkedin_search") {
    const query = clean(value, 120);
    if (query.length < 2 || /[\n,]/.test(value))
      throw Error("Informe uma única palavra-chave ou expressão.");
    return { query, quantity: count };
  }
  const names = [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .filter(Boolean)
        .map((entry) => {
          if (tool === "instagram_profile" && /^id:/i.test(entry)) {
            const id = instagramId(entry.slice(3));
            if (!id) throw Error("Informe um ID numérico válido do Instagram.");
            return id;
          }
          return username(entry);
        }),
    ),
  ];
  if (
    !names.length ||
    names.length > (tool === "instagram_followers" ? 1 : 10) ||
    (tool === "instagram_profile" && count !== names.length)
  )
    throw Error("Confira a quantidade de perfis.");
  return { query: names.join(","), quantity: count };
}
export function actorInput(
  tool: Tool,
  query: string,
  quantity: number,
  includeAboutSection = false,
) {
  if (tool === "linkedin_search")
    return { searchQuery: query, profileScraperMode: "Short", maxItems: quantity, takePages: 1 };
  if (tool === "linkedin_profile")
    return {
      publicIdentifiers: query.split(","),
      profileScraperMode: "Profile details no email ($4 per 1k)",
    };
  if (tool === "instagram_search")
    return {
      search: query,
      searchType: "user",
      searchLimit: quantity,
      enhanceUserSearchWithFacebookPage: false,
      liveSearch: false,
    };
  if (tool === "instagram_profile") return { usernames: query.split(","), includeAboutSection };
  return { usernames: [query], dataToScrape: "followers", resultsLimit: quantity };
}
export function safeUrl(v: unknown) {
  try {
    const u = new URL(typeof v === "string" ? v : "");
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.port ||
      !u.hostname.includes(".") ||
      /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)
    )
      return "";
    return u.href.slice(0, 1000);
  } catch {
    return "";
  }
}
function instagramId(value: unknown) {
  const id = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  return typeof id === "string" && /^[1-9][0-9]{0,29}$/.test(id) ? id : "";
}
function countMetric(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
type RecentPost = {
  url: string;
  publishedAt: string;
  caption: string;
  likes: number | null;
  comments: number | null;
  views?: number | null;
  type?: string;
  image?: string;
  location?: string;
  hashtags?: string[];
};
type RelatedProfile = {
  username: string;
  name: string;
  id?: string;
  verified?: boolean;
  private?: boolean;
};
function recentPosts(raw: unknown): RecentPost[] {
  if (!Array.isArray(raw)) return [];
  const posts = new Map<string, RecentPost>();
  for (const item of raw.slice(0, 24)) {
    const match =
      typeof item?.url === "string" &&
      /^https:\/\/(?:www\.)?instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]{1,64})\/?(?:[?#].*)?$/.exec(
        item.url,
      );
    const timestamp =
      typeof item?.timestamp === "string" && /^\d{4}-\d{2}-\d{2}T/.test(item.timestamp)
        ? Date.parse(item.timestamp)
        : NaN;
    if (!match || !Number.isFinite(timestamp)) continue;
    const url = `https://www.instagram.com/${match[1]}/${match[2]}/`;
    if (!posts.has(url))
      posts.set(url, {
        url,
        publishedAt: new Date(timestamp).toISOString(),
        caption: clean(item.caption, 800),
        likes: countMetric(item.likesCount),
        comments: countMetric(item.commentsCount),
        views: countMetric(item.videoViewCount ?? item.videoPlayCount),
        type: clean(item.type, 40),
        image: mediaUrl(item.displayUrl),
        location: clean(item.locationName, 120),
        hashtags: Array.isArray(item.hashtags)
          ? item.hashtags
              .slice(0, 20)
              .map((v: unknown) => clean(v, 80))
              .filter(Boolean)
          : [],
      });
  }
  return [...posts.values()]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 24);
}
function relatedProfiles(raw: unknown, own: string): RelatedProfile[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set([own]);
  const rows: RelatedProfile[] = [];
  for (const item of raw.slice(0, 100)) {
    if (typeof item?.username !== "string" || !/^[A-Za-z0-9._]{1,30}$/.test(item.username))
      continue;
    let handle: string;
    try {
      handle = username(item.username);
    } catch {
      continue;
    }
    if (seen.has(handle)) continue;
    seen.add(handle);
    rows.push({
      username: handle,
      name: clean(item.full_name ?? item.fullName, 100),
      id: instagramId(item.id),
      verified: item.is_verified === true,
      private: item.is_private === true,
    });
    if (rows.length === 50) break;
  }
  return rows;
}
function mediaUrl(value: unknown) {
  const url = safeUrl(value);
  if (!url) return "";
  const host = new URL(url).hostname;
  return ["cdninstagram.com", "fbcdn.net", "instagram.com"].some(
    (domain) => host === domain || host.endsWith("." + domain),
  )
    ? url
    : "";
}
function aboutProfile(raw: unknown): Record<string, string | number | boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: Record<string, string | number | boolean> = {};
  for (const key of ["country", "date_joined", "date_verified"]) {
    const v = clean(r[key], 100);
    if (v) out[key] = v;
  }
  const former = countMetric(r["former_usernames"]);
  if (former != null) out["former_usernames"] = former;
  if (typeof r["is_verified"] === "boolean") out["is_verified"] = r["is_verified"];
  return out;
}
export type Profile = {
  username: string;
  name: string;
  url: string;
  biography: string;
  website: string;
  email: string;
  phone: string;
  followers: number | null;
  following: number | null;
  posts: number | null;
  private: boolean;
  verified: boolean;
  category?: string;
  business?: boolean;
  highlights?: number | null;
  videos?: number | null;
  links?: { title: string; url: string }[];
  instagramId?: string;
  photo?: string;
  facebookId?: string;
  address?: string;
  joinedRecently?: boolean;
  hasChannel?: boolean;
  about?: Record<string, string | number | boolean>;
  linkedin?: {
    identifier: string;
    headline: string;
    location: string;
    experience: { position: string; company: string }[];
    education: { school: string; degree: string }[];
  };
  projectionLimited?: boolean;
  recentPosts?: RecentPost[];
  relatedProfiles?: RelatedProfile[];
};
export function profiles(raw: unknown, limit: number, includeDetails = false): Profile[] {
  if (!Array.isArray(raw) || raw.length > 101) throw Error("Resultados não confirmados.");
  const seen = new Set<string>();
  return raw
    .flatMap((r: any) => {
      if (!r || typeof r !== "object" || r.error || r.errorDescription)
        throw Error("Resultados não confirmados.");
      const handle = username(r.username ?? r.userName);
      if (seen.has(handle)) return [];
      seen.add(handle);
      const biography = clean(r.biography, 1200);
      const validMail = (v: unknown) => {
        const value = clean(v, 254);
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : "";
      };
      const mail =
        validMail(r.businessEmail) ||
        validMail(r.publicEmail) ||
        validMail(biography.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0]);
      const links: { title: string; url: string }[] = [];
      for (const item of [
        { url: r.externalUrl, title: "Site" },
        ...(Array.isArray(r.externalUrls) ? r.externalUrls.slice(0, 8) : []),
        ...(Array.isArray(r.bioLinks) ? r.bioLinks.slice(0, 8) : []),
      ]) {
        const url = safeUrl(typeof item === "string" ? item : item?.url);
        if (url && !links.some((link) => link.url === url) && links.length < 10)
          links.push({ title: clean(item?.title, 80) || "Link público", url: url.slice(0, 500) });
      }
      const address =
        typeof r.businessAddress === "string"
          ? r.businessAddress
          : r.businessAddress && typeof r.businessAddress === "object"
            ? ["street_address", "city_name", "zip_code"]
                .map((key) => clean(r.businessAddress[key], 100))
                .filter(Boolean)
                .join(", ")
            : "";
      const profile: Profile = {
        username: handle,
        name: clean(r.fullName ?? r.full_name, 150),
        url: `https://www.instagram.com/${handle}/`,
        biography,
        website: safeUrl(r.externalUrl),
        email: mail,
        phone: clean(r.businessPhoneNumber ?? r.publicPhoneNumber, 50),
        followers: countMetric(r.followersCount),
        following: countMetric(r.followsCount ?? r.followingCount),
        posts: countMetric(r.postsCount),
        private: r.isPrivate === true || r.private === true,
        verified: r.isVerified === true || r.verified === true,
        category: clean(r.businessCategoryName ?? r.categoryName, 120),
        business: r.isBusinessAccount === true,
        highlights: countMetric(r.highlightReelCount),
        videos: countMetric(r.igtvVideoCount),
        links,
        ...(includeDetails
          ? {
              instagramId: instagramId(r.id),
              photo: mediaUrl(r.profilePicUrlHD) || mediaUrl(r.profilePicUrl),
              facebookId: instagramId(r.fbid),
              address: clean(address, 300),
              ...(typeof r.joinedRecently === "boolean"
                ? { joinedRecently: r.joinedRecently }
                : {}),
              ...(typeof r.hasChannel === "boolean" ? { hasChannel: r.hasChannel } : {}),
              about: aboutProfile(r.about),
              recentPosts: recentPosts([
                ...(Array.isArray(r.latestPosts) ? r.latestPosts.slice(0, 12) : []),
                ...(Array.isArray(r.latestIgtvVideos) ? r.latestIgtvVideos.slice(0, 12) : []),
              ]),
              relatedProfiles: relatedProfiles(r.relatedProfiles, handle),
            }
          : {}),
      };
      // Preserve a bounded snapshot compatible with the existing SQL transaction limit.
      if (
        includeDetails &&
        ((Array.isArray(r.latestPosts) && r.latestPosts.length > 12) ||
          (Array.isArray(r.relatedProfiles) && r.relatedProfiles.length > 50))
      )
        profile.projectionLimited = true;
      const bytes = () => new TextEncoder().encode(JSON.stringify(profile)).length;
      while (bytes() > 40000 && profile.relatedProfiles?.length) {
        profile.relatedProfiles.pop();
        profile.projectionLimited = true;
      }
      while (bytes() > 40000 && profile.recentPosts?.length) {
        profile.recentPosts.pop();
        profile.projectionLimited = true;
      }
      return [profile];
    })
    .slice(0, limit);
}
export const linkedinFields =
  "linkedinUrl,publicIdentifier,firstName,lastName,headline,position,about,location,experience,education,followerCount,error,errorDescription,status,query";
function linkedinProfiles(raw: unknown, limit: number, query?: string): Profile[] {
  if (!Array.isArray(raw) || raw.length > limit) throw Error("Resultados não confirmados.");
  const seen = new Set<string>();
  const requested = query?.split(",");
  return raw.flatMap((r) => {
    if (
      !r ||
      typeof r !== "object" ||
      r.error ||
      r.errorDescription ||
      (r.status != null && r.status !== 200) ||
      typeof r.linkedinUrl !== "string" ||
      !r.linkedinUrl.startsWith("https://")
    )
      throw Error("Resultados não confirmados.");
    const identifier = linkedinIdentifier(r.linkedinUrl);
    if (requested && !requested.includes(identifier)) throw Error("Resultados não confirmados.");
    const name = [clean(r.firstName, 100), clean(r.lastName, 100)].filter(Boolean).join(" ");
    if (!name) throw Error("Resultados não confirmados.");
    if (seen.has(identifier)) return [];
    seen.add(identifier);
    return [
      {
        username: "linkedin:" + identifier,
        name,
        url: "https://www.linkedin.com/in/" + identifier,
        biography: clean(r.about, 2000),
        website: "",
        email: "",
        phone: "",
        followers: countMetric(r.followerCount),
        following: null,
        posts: null,
        private: false,
        verified: false,
        linkedin: {
          identifier,
          headline: clean(r.headline ?? r.position, 400),
          location: clean(
            typeof r.location === "string" ? r.location : r.location?.linkedinText,
            200,
          ),
          experience: (Array.isArray(r.experience) ? r.experience.slice(0, 6) : [])
            .map((e: any) => ({
              position: clean(e?.position ?? e?.title, 200),
              company: clean(e?.companyName, 200),
            }))
            .filter((e: any) => e.position || e.company),
          education: (Array.isArray(r.education) ? r.education.slice(0, 6) : [])
            .map((e: any) => ({ school: clean(e?.schoolName, 200), degree: clean(e?.degree, 200) }))
            .filter((e: any) => e.school || e.degree),
        },
      },
    ];
  });
}
/** A confirmed successful followers run can emit a source-only or explicit not_found marker.
 * Match the complete observed shape and immutable source; never turn arbitrary errors into refunds.
 */
export function deliveredProfiles(
  raw: unknown,
  limit: number,
  context: { tool: Tool; query: string },
): Profile[] {
  if (context.tool === "linkedin_search" || context.tool === "linkedin_profile")
    return linkedinProfiles(
      raw,
      limit,
      context.tool === "linkedin_profile" ? context.query : undefined,
    );
  if (context.tool === "instagram_followers" && Array.isArray(raw) && raw.length === 1) {
    const marker = raw[0];
    if (
      marker &&
      typeof marker === "object" &&
      !Array.isArray(marker) &&
      (Object.keys(marker).length === 1 ||
        (Object.keys(marker).length === 3 &&
          Object.hasOwn(marker, "error") &&
          Object.hasOwn(marker, "errorDescription") &&
          marker.error === "not_found" &&
          marker.errorDescription === "Profile does not exist")) &&
      Object.hasOwn(marker, "sourceUsername") &&
      typeof marker.sourceUsername === "string" &&
      marker.sourceUsername === context.query
    )
      return [];
  }
  return profiles(raw, limit, context.tool === "instagram_profile");
}
export function csv(rows: Profile[]) {
  const cell = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^\s*[=+\-@]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  if (rows.length && rows.every((r) => r.linkedin))
    return (
      "\uFEFF" +
      [
        [
          "Nome",
          "Perfil do LinkedIn",
          "Título profissional",
          "Localização",
          "Sobre",
          "Experiências",
          "Formação",
        ],
        ...rows.map((r) => [
          r.name,
          r.url,
          r.linkedin?.headline,
          r.linkedin?.location,
          r.biography,
          r.linkedin?.experience
            .map((e) => [e.position, e.company].filter(Boolean).join(" — "))
            .join(" | "),
          r.linkedin?.education
            .map((e) => [e.school, e.degree].filter(Boolean).join(" — "))
            .join(" | "),
        ]),
      ]
        .map((row) => row.map(cell).join(","))
        .join("\r\n")
    );
  return (
    "\uFEFF" +
    [
      [
        "Usuário",
        "Nome",
        "Perfil",
        "Biografia",
        "Site",
        "E-mail público",
        "Telefone público",
        "Seguidores",
        "Seguindo",
        "Publicações",
        "Categoria",
        "Conta comercial",
        "Verificado",
        "Perfil privado",
        "Destaques",
        "Vídeos IGTV",
        "Links públicos",
        "ID do Instagram",
        "Publicação mais recente encontrada (UTC)",
        "Links de publicações recentes",
        "Perfis relacionados",
        "Foto pública",
        "ID Facebook",
        "Endereço público",
        "Conta recente",
        "Canal",
        "Sobre esta conta",
        "Detalhes das publicações",
        "Detalhes dos perfis relacionados",
      ],
      ...rows.map((r) => [
        r.username,
        r.name,
        r.url,
        r.biography,
        r.website,
        r.email,
        r.phone,
        r.followers,
        r.following,
        r.posts,
        r.category,
        r.business == null ? "" : r.business ? "Sim" : "Não",
        r.verified ? "Sim" : "Não",
        r.private ? "Sim" : "Não",
        r.highlights,
        r.videos,
        r.links?.map((link) => link.url).join(" | "),
        r.instagramId ? "'" + r.instagramId : "",
        r.recentPosts?.[0]?.publishedAt,
        r.recentPosts?.map((post) => post.url).join(" | "),
        r.relatedProfiles?.map((profile) => profile.username).join(" | "),
        r.photo,
        r.facebookId ? "'" + r.facebookId : "",
        r.address,
        r.joinedRecently == null ? "" : r.joinedRecently ? "Sim" : "Não",
        r.hasChannel == null ? "" : r.hasChannel ? "Sim" : "Não",
        r.about ? JSON.stringify(r.about) : "",
        r.recentPosts ? JSON.stringify(r.recentPosts) : "",
        r.relatedProfiles ? JSON.stringify(r.relatedProfiles) : "",
      ]),
    ]
      .map((row) => row.map(cell).join(";"))
      .join("\r\n")
  );
}

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
class ResponseTooLarge extends Error {}
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
      throw new ResponseTooLarge("Resposta muito grande.");
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
  // Read the selected mode before reservation; the RPC validates that exact config version.
  const config = tool === "instagram_profile" ? await rpc(actor, "config") : null;
  const begun = await rpc(actor, "start", {
    ...c,
    requestId: id,
    tool,
    unitCents: integer(data.unitCents, 1, 10000),
    version: integer(data.version, 1, 2147483647),
  });
  if (!begun.execute) return begun.request;
  if (config && config.version !== data.version) return rpc(actor, "reject", { id });
  const includeAbout = config?.tools?.instagram_profile?.includeAboutSection === true;
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
      body: JSON.stringify(actorInput(tool, c.query, c.quantity, includeAbout)),
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
      const linkedin = claim.tool === "linkedin_search" || claim.tool === "linkedin_profile";
      const p = new URLSearchParams({
        // Followers markers must be inspected unprojected: a fields filter could hide error flags.
        ...(linkedin
          ? { fields: linkedinFields }
          : claim.tool === "instagram_followers"
            ? {}
            : {
                fields:
                  "username,userName,fullName,full_name,biography,externalUrl,businessEmail,publicEmail,businessPhoneNumber,publicPhoneNumber,followersCount,followsCount,followingCount,postsCount,isPrivate,isVerified,private,verified,businessCategoryName,categoryName,isBusinessAccount,highlightReelCount,igtvVideoCount,externalUrls,bioLinks,error,errorDescription" +
                  (claim.tool === "instagram_profile"
                    ? ",id,profilePicUrl,profilePicUrlHD,fbid,businessAddress,joinedRecently,hasChannel,about,latestPosts,relatedProfiles,latestIgtvVideos"
                    : ""),
              }),
        format: "json",
        clean: linkedin || claim.tool === "instagram_followers" ? "false" : "true",
        limit: String(claim.quantity + (linkedin ? 1 : 0)),
        offset: "0",
      });
      const readItems = async () => {
        const items = await provider("datasets/" + claim.datasetId + "/items?" + p);
        if (!items.ok) throw Error("Resultados indisponíveis.");
        return boundedJson(items);
      };
      let raw;
      let limited = false;
      try {
        raw = await readItems();
      } catch (error) {
        if (claim.tool !== "instagram_profile" || !(error instanceof ResponseTooLarge)) throw error;
        // Read the same dataset with the original projection; never restart the Actor.
        limited = true;
        p.set(
          "fields",
          p.get("fields")!.replace(",latestPosts,relatedProfiles,latestIgtvVideos", ""),
        );
        raw = await readItems();
      }
      let rows;
      try {
        const original = await rpc(actor, "status", { id });
        if (
          original.id !== id ||
          original.tool !== claim.tool ||
          typeof original.query !== "string"
        )
          throw Error("Pesquisa divergente.");
        rows = deliveredProfiles(raw, claim.quantity, {
          tool: toolKey(original.tool),
          query: original.query,
        });
        if (limited) rows = rows.map((row) => ({ ...row, projectionLimited: true }));
        if (
          claim.tool === "instagram_followers" &&
          Array.isArray(raw) &&
          raw.length === 1 &&
          rows.length === 0
        ) {
          // An item limit must not hide additional records beyond the observed no-result marker.
          const metadata = await provider("datasets/" + claim.datasetId);
          if (!metadata.ok) throw Error("Dataset não confirmado.");
          const dataset = (await boundedJson(metadata, 150000))?.data;
          if (dataset?.id !== claim.datasetId || dataset?.itemCount !== 1)
            throw Error("Dataset divergente.");
        }
      } catch {
        // The original run is confirmed terminal, but its dataset is not a valid delivery.
        // Never leave it appearing to run forever, accept error rows as profiles, or guess a refund.
        await rpc(actor, "review", { id });
        return rpc(actor, "status", { id });
      }
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
      "Informe um perfil válido do LinkedIn.",
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
