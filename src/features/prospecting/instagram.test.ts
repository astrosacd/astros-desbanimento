import { expect, it, vi } from "vitest";
import {
  instagramHandle,
  instagramCandidates,
  instagramProjection,
  handleInstagram,
} from "../../../supabase/functions/astros-prospecting/instagram";
it.each([
  "https://instagram.com/p/x",
  "https://instagram.com/reel/x",
  "https://instagram.com/explore",
  "https://instagram.com.evil.test/acme",
  "http://instagram.com/acme",
  "https://user:pass@instagram.com/acme",
  "https://instagram.com/acme/extra",
  "https://instagram.com/%61cme",
  "https://instagram.com:444/acme",
])("rejects non-profile or unsafe URL %s", (url) => expect(instagramHandle(url)).toBeNull());
it("derives only published handles without guessing a company name", () => {
  expect(
    instagramCandidates({
      name: "Other",
      website: "https://www.instagram.com/ACME.X/?igsh=123",
      contacts: [
        { url: "https://instagram.com/acme.x" },
        { url: "https://instagram.com/p/post" },
        { url: "https://m.instagram.com/second/" },
      ],
    }),
  ).toEqual(["acme.x", "second"]);
  expect(instagramCandidates({ name: "ACME" })).toEqual([]);
});
it("projects public text and counts, never provider data or a list of followers", () => {
  const result = instagramProjection(
    {
      search_metadata: { status: "Success", key: "SECRET" },
      profile_results: {
        username: "acme",
        is_private: false,
        biography: "Contato hello@acme.com +55 (85) 99999-9999",
        followers: 100,
        following: 0,
        public_email: "private@hidden.com",
        phone_number: "secret",
        bio_links: [{ url: "javascript:alert(1)" }, { url: "https://acme.com" }],
        posts: [{ id: "post" }],
      },
    },
    "acme",
  );
  expect(result.followers).toBe(100);
  expect(result.following).toBe(0);
  expect(result.professional).toBeNull();
  expect(result.emails).toEqual(["hello@acme.com"]);
  expect(result.links).toEqual(["https://acme.com/"]);
  expect(JSON.stringify(result)).not.toMatch(/SECRET|private@hidden|secret|posts/);
});
it("rejects private, wrong profile or unconfirmed response", () => {
  for (const p of [
    { username: "other", is_private: false },
    { username: "acme", is_private: true },
    { username: "acme" },
  ])
    expect(() =>
      instagramProjection({ search_metadata: { status: "Success" }, profile_results: p }, "acme"),
    ).toThrow();
});
const leadId = "00000000-0000-4000-8000-000000000001",
  requestId = "00000000-0000-4000-8000-000000000002";
it("missing migration keeps read optional and makes no supplier call", async () => {
  const db = vi.fn(),
    sync = vi.fn(),
    supplier = vi.fn();
  expect(
    await handleInstagram(
      "instagram-read",
      { leadId, source: "maps" },
      { id: "owner" },
      db,
      async () => null,
      sync,
      supplier,
    ),
  ).toMatchObject({ installed: false, enabled: false });
  expect(db).not.toHaveBeenCalled();
  expect(supplier).not.toHaveBeenCalled();
});
it("read never consumes supplier quota and uses verified actor", async () => {
  const db = vi.fn(async (path, method, args) => {
    expect(args.actor).toBe("owner");
    return path.endsWith("snapshot")
      ? { website: "https://instagram.com/acme" }
      : { state: "none" };
  });
  const supplier = vi.fn(),
    sync = vi.fn();
  const result = await handleInstagram(
    "instagram-read",
    { leadId, source: "maps", actor: "other" },
    { id: "owner" },
    db,
    async () => ({ enabled: true, installed: true }),
    sync,
    supplier,
  );
  expect(result.candidates).toEqual(["acme"]);
  expect(supplier).not.toHaveBeenCalled();
  expect(sync).not.toHaveBeenCalled();
});
it("rejects a client invented profile before capacity or provider work", async () => {
  const supplier = vi.fn(),
    sync = vi.fn();
  await expect(
    handleInstagram(
      "instagram-consult",
      { leadId, source: "maps", requestId, profileId: "other" },
      { id: "owner" },
      async () => ({ website: "https://instagram.com/acme" }),
      async () => ({ enabled: true }),
      sync,
      supplier,
    ),
  ).rejects.toThrow("Perfil não consta");
  expect(supplier).not.toHaveBeenCalled();
  expect(sync).not.toHaveBeenCalled();
});
it("only one reserved dispatch, retry only reads; uncertain supplier is never replayed", async () => {
  let claimed = false;
  const finish = vi.fn();
  const db = vi.fn(async (path, method, args) => {
    if (path.endsWith("snapshot")) return { website: "https://instagram.com/acme" };
    if (path.endsWith("begin")) {
      const dispatch = !claimed;
      claimed = true;
      return { dispatch, requestId };
    }
    if (path.endsWith("finish")) {
      finish(args);
      return null;
    }
    return { state: "failed" };
  });
  const supplier = vi.fn(async () => {
    throw Error("timeout");
  });
  for (let i = 0; i < 2; i++)
    await handleInstagram(
      "instagram-consult",
      { leadId, source: "maps", requestId, profileId: "acme" },
      { id: "owner" },
      db,
      async () => ({ enabled: true }),
      async () => ({}),
      supplier,
    );
  expect(supplier).toHaveBeenCalledTimes(1);
  expect(finish).toHaveBeenCalledWith({ actor: "owner", request_key: requestId, payload: null });
});
