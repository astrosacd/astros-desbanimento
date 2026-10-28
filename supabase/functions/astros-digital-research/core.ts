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
        .map(username),
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
};
export function profiles(raw: unknown, limit: number): Profile[] {
  if (!Array.isArray(raw) || raw.length > 101) throw Error("Resultados não confirmados.");
  const seen = new Set<string>();
  return raw
    .flatMap((r: any) => {
      if (!r || typeof r !== "object" || r.error || r.errorDescription)
        throw Error("Resultados não confirmados.");
      const handle = username(r.username ?? r.userName);
      if (seen.has(handle)) return [];
      seen.add(handle);
      const metric = (v: unknown) =>
        typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
      const mail = clean(r.businessEmail ?? r.publicEmail, 254);
      return [
        {
          username: handle,
          name: clean(r.fullName ?? r.full_name, 150),
          url: `https://www.instagram.com/${handle}/`,
          biography: clean(r.biography, 1200),
          website: safeUrl(r.externalUrl),
          email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail) ? mail : "",
          phone: clean(r.businessPhoneNumber ?? r.publicPhoneNumber, 50),
          followers: metric(r.followersCount),
          following: metric(r.followsCount ?? r.followingCount),
          posts: metric(r.postsCount),
          private: r.isPrivate === true,
          verified: r.isVerified === true,
        },
      ];
    })
    .slice(0, limit);
}
export function csv(rows: Profile[]) {
  const cell = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+\-@\t\r]/, "'$&")
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
      ]),
    ]
      .map((row) => row.map(cell).join(";"))
      .join("\r\n")
  );
}
