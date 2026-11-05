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
export function actorInput(
  tool: Tool,
  query: string,
  quantity: number,
  includeAboutSection = false,
) {
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
