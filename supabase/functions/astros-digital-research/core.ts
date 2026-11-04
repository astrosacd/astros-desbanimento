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
export function criteria(tool: Tool, value: unknown, quantity: unknown) {
  const count = integer(quantity, 1, tools[tool].max);
  if (typeof value !== "string" || value.length > 500) throw Error("Pesquisa inválida.");
  if (tool === "instagram_search") {
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
export function actorInput(tool: Tool, query: string, quantity: number) {
  if (tool === "instagram_search")
    return {
      search: query,
      searchType: "user",
      searchLimit: quantity,
      enhanceUserSearchWithFacebookPage: false,
      liveSearch: false,
    };
  if (tool === "instagram_profile")
    return { usernames: query.split(","), includeAboutSection: false };
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
};
type RelatedProfile = { username: string; name: string };
function recentPosts(raw: unknown): RecentPost[] {
  if (!Array.isArray(raw)) return [];
  const posts = new Map<string, RecentPost>();
  for (const item of raw.slice(0, 12)) {
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
        caption: clean(item.caption, 260),
        likes: countMetric(item.likesCount),
        comments: countMetric(item.commentsCount),
      });
  }
  return [...posts.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 3);
}
function relatedProfiles(raw: unknown, own: string): RelatedProfile[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set([own]);
  const rows: RelatedProfile[] = [];
  for (const item of raw.slice(0, 24)) {
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
    rows.push({ username: handle, name: clean(item.full_name ?? item.fullName, 100) });
    if (rows.length === 5) break;
  }
  return rows;
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
        if (url && !links.some((link) => link.url === url) && links.length < 3)
          links.push({ title: clean(item?.title, 80) || "Link público", url: url.slice(0, 500) });
      }
      return [
        {
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
                recentPosts: recentPosts(r.latestPosts),
                relatedProfiles: relatedProfiles(r.relatedProfiles, handle),
              }
            : {}),
        },
      ];
    })
    .slice(0, limit);
}
/** A confirmed successful followers run can emit a source-only or explicit not_found marker.
 * Match the complete observed shape and immutable source; never turn arbitrary errors into refunds.
 */
export function deliveredProfiles(
  raw: unknown,
  limit: number,
  context: { tool: Tool; query: string },
): Profile[] {
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
      ]),
    ]
      .map((row) => row.map(cell).join(";"))
      .join("\r\n")
  );
}
