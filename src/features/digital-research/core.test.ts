import { describe, it, expect } from "vitest";
import {
  actorInput,
  criteria,
  csv,
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
  });
});
