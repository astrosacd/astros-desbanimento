import { expect, it, vi } from "vitest";
import {
  reviewsPlaceId,
  reviewsProjection,
  handleReviews,
} from "../../../supabase/functions/astros-prospecting/reviews";
it("uses only saved Maps place identity, never CNPJ or a supplied URL/name", () => {
  expect(reviewsPlaceId({ id: "pid:ChIJ1234567890" })).toBe("ChIJ1234567890");
  for (const v of [
    { id: "cid:1234567890" },
    { id: "pid:ChIJ1234567890", source: "cnpj" },
    { name: "ChIJ1234567890", mapsUrl: "https://google.com" },
  ])
    expect(reviewsPlaceId(v)).toBeNull();
});
const response = {
  search_metadata: { status: "Success", api_key: "SECRET" },
  search_parameters: { place_id: "ChIJ1234567890" },
  place_info: { title: "Company", rating: 4.5, reviews: 30 },
  reviews: [
    {
      review_id: "r1",
      rating: 5,
      snippet: "Ótimo",
      source: "Google",
      date: "ontem",
      user: { name: "PERSON", email: "PRIVATE" },
      response: { snippet: "Obrigado" },
      link: "https://www.google.com/maps/reviews/example",
    },
  ],
};
it("projects a bounded sample without reviewer identity, provider secrets or media", () => {
  const r = reviewsProjection(
    {
      ...response,
      reviews: Array.from({ length: 20 }, (_, i) => ({
        ...response.reviews[0],
        review_id: "r" + i,
        snippet: "x".repeat(2000),
      })),
    },
    "ChIJ1234567890",
  );
  expect(r.reviews).toHaveLength(10);
  expect(r.reviews[0].text).toHaveLength(800);
  expect(JSON.stringify(r)).not.toMatch(/PERSON|PRIVATE|SECRET|api_key|user|thumbnail/);
  expect(r.total).toBe(30);
});
it("handles zero reviews as a valid empty result, not fabricated data", () => {
  expect(
    reviewsProjection(
      { ...response, reviews: [], place_info: { title: "Company", reviews: 0 } },
      "ChIJ1234567890",
    ),
  ).toMatchObject({ reviews: [], total: 0, rating: null });
});
it("rejects mismatched identity, malformed result, non-Google reviews and unsafe links", () => {
  expect(() =>
    reviewsProjection({ ...response, search_parameters: { place_id: "OTHER" } }, "ChIJ1234567890"),
  ).toThrow();
  expect(() => reviewsProjection({ ...response, reviews: null }, "ChIJ1234567890")).toThrow();
  const r = reviewsProjection(
    {
      ...response,
      reviews: [
        { ...response.reviews[0], source: "Trip.com" },
        { ...response.reviews[0], review_id: "r2", link: "javascript:alert(1)" },
      ],
    },
    "ChIJ1234567890",
  );
  expect(r.reviews).toHaveLength(1);
  expect(r.reviews[0].url).toBe("");
});
const leadId = "00000000-0000-4000-8000-000000000001",
  requestId = "00000000-0000-4000-8000-000000000002";
it("missing optional SQL degrades only this complement", async () => {
  const db = vi.fn(),
    supplier = vi.fn();
  expect(
    await handleReviews(
      "reviews-read",
      { leadId },
      { id: "owner" },
      db,
      async () => null,
      vi.fn(),
      supplier,
    ),
  ).toMatchObject({ installed: false });
  expect(db).not.toHaveBeenCalled();
  expect(supplier).not.toHaveBeenCalled();
});
it("read verifies the signed-in owner and never queries the supplier", async () => {
  const db = vi.fn(async (path, method, args) => {
    expect(args).toMatchObject({ actor: "owner", origin_key: "maps" });
    return path.endsWith("snapshot") ? { id: "pid:ChIJ1234567890" } : { state: "none" };
  });
  const supplier = vi.fn(),
    sync = vi.fn();
  const r = await handleReviews(
    "reviews-read",
    { leadId, actor: "other" },
    { id: "owner" },
    db,
    async () => ({ enabled: true }),
    sync,
    supplier,
  );
  expect(r.eligible).toBe(true);
  expect(sync).not.toHaveBeenCalled();
  expect(supplier).not.toHaveBeenCalled();
});
it("rejects CNPJ without loading its snapshot or dispatching", async () => {
  const db = vi.fn(),
    supplier = vi.fn();
  await expect(
    handleReviews(
      "reviews-consult",
      { leadId, requestId, source: "cnpj" },
      { id: "owner" },
      db,
      async () => ({ enabled: true }),
      vi.fn(),
      supplier,
    ),
  ).rejects.toThrow("somente");
  expect(db).not.toHaveBeenCalled();
  expect(supplier).not.toHaveBeenCalled();
});
it("reserves before a single fixed supplier call; retries recover without dispatch", async () => {
  let dispatched = false;
  const sequence: string[] = [];
  const db = vi.fn(async (path, method, args) => {
    sequence.push(path);
    if (path.endsWith("snapshot")) return { id: "pid:ChIJ1234567890" };
    if (path.endsWith("begin")) {
      const dispatch = !dispatched;
      dispatched = true;
      return { dispatch, requestId };
    }
    if (path.endsWith("finish")) {
      expect(args.payload).toBeNull();
      return null;
    }
    return { state: "failed" };
  });
  const supplier = vi.fn(async (path, args) => {
    sequence.push("supplier");
    expect(args).toEqual({
      engine: "google_maps_reviews",
      place_id: "ChIJ1234567890",
      hl: "pt-br",
      sort_by: "newestFirst",
      num: "10",
    });
    throw Error("timeout");
  });
  for (let i = 0; i < 2; i++)
    await handleReviews(
      "reviews-consult",
      { leadId, requestId, placeId: "INVENTED" },
      { id: "owner" },
      db,
      async () => ({ enabled: true }),
      async () => ({}),
      supplier,
    );
  expect(supplier).toHaveBeenCalledTimes(1);
  expect(sequence.indexOf("rpc/astros_reviews_begin")).toBeLessThan(sequence.indexOf("supplier"));
});

it("bounds the entire saved projection in bytes even with multibyte text and long URLs", () => {
  const r = reviewsProjection(
    {
      ...response,
      reviews: Array.from({ length: 20 }, (_, i) => ({
        ...response.reviews[0],
        review_id: "r" + i,
        snippet: "漢".repeat(800),
        response: { snippet: "漢".repeat(800) },
        link: "https://www.google.com/maps/" + "a".repeat(1800),
      })),
    },
    "ChIJ1234567890",
  );
  expect(new TextEncoder().encode(JSON.stringify(r)).length).toBeLessThanOrEqual(30000);
  expect(r.reviews.length).toBeGreaterThan(0);
});
