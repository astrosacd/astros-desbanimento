import { describe, it, expect } from "vitest";
import {
  actorInput,
  criteria,
  csv,
  deliveredProfiles,
  profiles,
  toolKey,
  username,
} from "../../../supabase/functions/astros-digital-research/core";
describe("Digital research provider boundary", () => {
  it("accepts exact Instagram profiles, refusing other sites, arbitrary paths and credentials", () => {
    expect(username("https://www.instagram.com/Astros/")).toBe("astros");
    for (const v of [
      "https://instagram.com.evil.test/a",
      "https://user:pass@instagram.com/a",
      "https://instagram.com/p/abc",
      "https://instagram.com/a?token=x",
      "https://localhost/a",
      "@a/b",
    ])
      expect(() => username(v)).toThrow();
  });
  it("limits each fixed tool and rejects hidden multi-search billing", () => {
    expect(() => toolKey("__proto__")).toThrow();
    expect(() => toolKey("arbitrary")).toThrow();
    expect(() => criteria("instagram_search", "dentistas, clinicas", 10)).toThrow();
    expect(() => criteria("instagram_followers", "a b", 10)).toThrow();
    expect(() => criteria("instagram_search", "dentistas", 51)).toThrow();
    expect(() => criteria("instagram_profile", "a b", 1)).toThrow();
    expect(criteria("instagram_profile", "@A a", 1)).toEqual({ query: "a", quantity: 1 });
  });
  it("disables optional billable enhancements and sends documented bounded inputs", () => {
    expect(actorInput("instagram_search", "dentistas", 20)).toEqual({
      search: "dentistas",
      searchType: "user",
      searchLimit: 20,
      enhanceUserSearchWithFacebookPage: false,
      liveSearch: false,
    });
    expect(actorInput("instagram_profile", "a,b", 2)).toEqual({
      usernames: ["a", "b"],
      includeAboutSection: false,
    });
    expect(actorInput("instagram_followers", "astros", 20)).toEqual({
      usernames: ["astros"],
      dataToScrape: "followers",
      resultsLimit: 20,
    });
  });
  it("projects public fields only, preserving absent metrics as unknown and avoiding a false contact promise", () => {
    const rows = profiles(
      [
        {
          username: "astros",
          fullName: "Astros",
          biography: "Bio",
          businessEmail: "contato@example.com",
          publicPhoneNumber: "123",
          externalUrl: "javascript:alert(1)",
          secret: "never",
          latestPosts: [{ private: "never" }],
        },
        { username: "ASTROS" },
      ],
      10,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: "contato@example.com",
      phone: "123",
      website: "",
      followers: null,
    });
    expect(rows[0]).not.toHaveProperty("secret");
    expect(rows[0]).not.toHaveProperty("latestPosts");
    expect(() => profiles([{ error: "blocked" }], 10)).toThrow();
  });
  it("rejects malformed rows rather than financially settling an ambiguous response", () => {
    expect(() => profiles({ results: [] }, 10)).toThrow();
    expect(() => profiles([{ username: "bad/path" }], 10)).toThrow();
    expect(profiles([], 10)).toEqual([]);
  });
  it("escapes quotes, spreadsheet formulas and delimiters in exported public data", () => {
    const row = profiles(
      [{ username: "example", fullName: '=HYPERLINK("evil")', biography: "hello;world" }],
      1,
    )[0]!;
    const text = csv([row]);
    expect(text).toContain('"\'=HYPERLINK(""evil"")"');
    expect(text).toContain('"hello;world"');
    expect(text.startsWith("\uFEFF")).toBe(true);
    row.name = "  =SUM(1,1)";
    expect(csv([row])).toContain('"\'  =SUM(1,1)"');
  });
});

it("recognizes only the exact source-only followers marker for the requested source", () => {
  const context = { tool: "instagram_followers" as const, query: "synthetic.missing" };
  expect(deliveredProfiles([{ sourceUsername: "synthetic.missing" }], 10, context)).toEqual([]);
  for (const raw of [
    [{ sourceUsername: "someone.else" }],
    [{ sourceUsername: "synthetic.missing", error: "blocked" }],
    [{ sourceUsername: "synthetic.missing", unknown: true }],
    [{ sourceUsername: "synthetic.missing" }, { username: "real.profile" }],
    [{}],
  ])
    expect(() => deliveredProfiles(raw, 10, context)).toThrow();
  expect(() =>
    deliveredProfiles([{ sourceUsername: "synthetic.missing" }], 10, {
      ...context,
      tool: "instagram_profile",
    }),
  ).toThrow();
  expect(
    deliveredProfiles(
      [{ username: "valid.profile", sourceUsername: "synthetic.missing" }],
      10,
      context,
    ),
  ).toHaveLength(1);
});

it("recognizes the complete observed not_found output only for its exact source and tool", () => {
  const context = { tool: "instagram_followers" as const, query: "synthetic.missing" };
  const marker = {
    sourceUsername: "synthetic.missing",
    error: "not_found",
    errorDescription: "Profile does not exist",
  };
  expect(deliveredProfiles([marker], 10, context)).toEqual([]);
  for (const item of [
    { ...marker, error: "blocked" },
    { ...marker, errorDescription: "Temporary unavailable" },
    { ...marker, sourceUsername: "someone.else" },
    { ...marker, unexpected: "extra" },
  ])
    expect(() => deliveredProfiles([item], 10, context)).toThrow();
  expect(() =>
    deliveredProfiles([marker], 10, { ...context, tool: "instagram_profile" }),
  ).toThrow();
  expect(() => deliveredProfiles([marker, { username: "real.profile" }], 10, context)).toThrow();
});

it("preserves documented profile metrics, alternate flags and bounded public links", () => {
  const [row] = profiles(
    [
      {
        username: "example",
        followersCount: 1234,
        followsCount: 42,
        postsCount: 0,
        highlightReelCount: 5,
        igtvVideoCount: 2,
        private: true,
        verified: true,
        isBusinessAccount: true,
        businessCategoryName: "Loja",
        biography: "Contato: loja@example.com",
        publicEmail: "",
        externalUrls: [
          { title: "Catálogo", url: "https://example.com/catalogo" },
          { title: "Unsafe", url: "javascript:alert(1)" },
        ],
        latestPosts: [{ caption: "Do not persist full content" }],
      },
    ],
    1,
  );
  expect(row).toMatchObject({
    followers: 1234,
    following: 42,
    posts: 0,
    highlights: 5,
    videos: 2,
    private: true,
    verified: true,
    business: true,
    category: "Loja",
    email: "loja@example.com",
    links: [{ title: "Catálogo", url: "https://example.com/catalogo" }],
  });
  expect(row).not.toHaveProperty("latestPosts");
  const exported = csv([row]);
  expect(exported).toContain('"Seguindo"');
  expect(exported).toContain('"42"');
  expect(exported).toContain('"https://example.com/catalogo"');
});

it("uses the documented usernames input for numeric IDs without rounding", () => {
  const id = "12345678901234567890";
  expect(criteria("instagram_profile", `ID:${id} ${id}`, 1).query).toBe(id);
  expect(actorInput("instagram_profile", id, 1)).toEqual({
    usernames: [id],
    includeAboutSection: false,
  });
  expect(() => criteria("instagram_profile", "id:abc", 1)).toThrow();
  expect(() => criteria("instagram_followers", `id:${id}`, 1)).toThrow();
});

it("keeps public activity and related suggestions bounded and separate from delivered profiles", () => {
  const id = "12345678901234567890";
  const raw = [
    {
      id,
      username: "example",
      latestPosts: [
        ...[1, 2, 3, 4].map((n) => ({
          url: `https://www.instagram.com/p/Post${n}/?tracking=1`,
          timestamp: `2026-10-0${n}T12:00:00Z`,
          likesCount: 0,
          commentsCount: -1,
          caption: "x".repeat(500),
          childPosts: [{ secret: "do not copy" }],
        })),
        { url: "https://evil.example/p/x/", timestamp: "2026-11-01T12:00:00Z" },
      ],
      relatedProfiles: [
        { username: "example" },
        { username: "not/a/profile" },
        ...Array.from({ length: 9 }, (_, n) => ({
          username: `related${n}`,
          full_name: "Public name",
        })),
      ],
    },
  ];
  const rows = deliveredProfiles(raw, 1, { tool: "instagram_profile", query: id });
  expect(rows).toHaveLength(1);
  expect(rows[0].instagramId).toBe(id);
  expect(rows[0].recentPosts).toHaveLength(4);
  expect(rows[0].recentPosts?.[0]).toMatchObject({
    url: "https://www.instagram.com/p/Post4/",
    publishedAt: "2026-10-04T12:00:00.000Z",
    caption: "x".repeat(500),
    likes: 0,
    comments: null,
  });
  expect(rows[0].relatedProfiles).toHaveLength(9);
  expect(rows[0].relatedProfiles?.[0].username).toBe("related0");
  expect(csv(rows)).toContain(`"'${id}"`);
  expect(
    deliveredProfiles(raw, 1, { tool: "instagram_followers", query: "a" })[0],
  ).not.toHaveProperty("recentPosts");
});

it("projects available public about fields, approved media and larger lists without raw payloads", () => {
  const [row] = deliveredProfiles(
    [
      {
        username: "example",
        profilePicUrlHD: "https://scontent.cdninstagram.com/avatar.jpg",
        about: {
          country: "Brasil",
          date_joined: "May 2020",
          former_usernames: 0,
          secret: "private",
        },
        latestPosts: Array.from({ length: 12 }, (_, n) => ({
          url: `https://www.instagram.com/p/Post${n}/`,
          timestamp: "2026-11-01T10:00:00Z",
          displayUrl: n ? "https://scontent.cdninstagram.com/photo.jpg" : "https://evil.example/x",
          videoViewCount: 0,
        })),
      },
    ],
    1,
    { tool: "instagram_profile", query: "example" },
  );
  expect(row.photo).toBe("https://scontent.cdninstagram.com/avatar.jpg");
  expect(row.about).toEqual({ country: "Brasil", date_joined: "May 2020", former_usernames: 0 });
  expect(row.recentPosts).toHaveLength(12);
  expect(row.recentPosts?.[0].image).toBe("");
  expect(row.recentPosts?.[0].views).toBe(0);
  expect(actorInput("instagram_profile", "example", 1, true).includeAboutSection).toBe(true);
});

it("bounds LinkedIn requests and returns only documented professional fields", async () => {
  const { criteria, actorInput, deliveredProfiles, csv } =
    await import("../../../supabase/functions/astros-digital-research/core");
  const q = criteria("linkedin_profile", "https://br.linkedin.com/in/example/?trk=abc Example", 1);
  expect(q).toEqual({ query: "example", quantity: 1 });
  expect(actorInput("linkedin_profile", q.query, 1)).toEqual({
    publicIdentifiers: ["example"],
    profileScraperMode: "Profile details no email ($4 per 1k)",
  });
  expect(actorInput("linkedin_search", "gerente comercial", 10)).toMatchObject({
    searchQuery: "gerente comercial",
    profileScraperMode: "Short",
    maxItems: 10,
  });
  expect(() =>
    criteria("linkedin_profile", "https://linkedin.com.evil.test/in/example", 1),
  ).toThrow();
  expect(() => criteria("linkedin_profile", "https://linkedin.com/company/example", 1)).toThrow();
  expect(() => criteria("linkedin_search", "cargo", 26)).toThrow();
  const raw = {
    linkedinUrl: "https://www.linkedin.com/in/example",
    firstName: "Pessoa",
    lastName: "Exemplo",
    headline: "Gerente",
    location: { linkedinText: "Fortaleza" },
    status: 200,
    experience: [{ position: "Gerente comercial", companyName: "Empresa Exemplo" }],
    email: "private@example.com",
    phone: "555",
    rawData: { secret: true },
  };
  const context = { tool: "linkedin_profile", query: q.query } as const;
  const result = deliveredProfiles([raw], 1, context);
  expect(result[0]).toMatchObject({
    username: "linkedin:example",
    email: "",
    phone: "",
    linkedin: {
      headline: "Gerente",
      location: "Fortaleza",
      experience: [{ position: "Gerente comercial", company: "Empresa Exemplo" }],
    },
  });
  expect(csv(result)).toContain("Perfil do LinkedIn");
  expect(JSON.stringify(result)).not.toContain("private@example.com");
  expect(() => deliveredProfiles([{ ...raw, status: 404 }], 1, context)).toThrow();
  expect(() => deliveredProfiles([raw], 1, { ...context, query: "different" })).toThrow();
});
