type ReviewsObject = Record<string, any>;
export function reviewsPlaceId(snapshot: ReviewsObject): string | null {
  const id = typeof snapshot?.id === "string" ? snapshot.id : "";
  return !snapshot?.cnpj && snapshot?.source !== "cnpj" && /^pid:[A-Za-z0-9_-]{10,200}$/.test(id)
    ? id.slice(4)
    : null;
}
function reviewText(v: unknown, max = 800) {
  return typeof v === "string"
    ? v
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .trim()
        .slice(0, max)
    : "";
}
function reviewDate(v: unknown) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v))
    ? new Date(v).toISOString()
    : "";
}
function reviewLink(v: unknown) {
  try {
    const u = new URL(String(v));
    return u.protocol === "https:" &&
      ["www.google.com", "google.com", "maps.google.com"].includes(u.hostname) &&
      u.pathname.startsWith("/maps") &&
      !u.username &&
      !u.password &&
      !u.port &&
      u.href.length <= 2048
      ? u.href
      : "";
  } catch {
    return "";
  }
}
export function reviewsProjection(data: ReviewsObject, placeId: string) {
  if (
    data?.search_metadata?.status !== "Success" ||
    !Array.isArray(data.reviews) ||
    !data.place_info ||
    typeof data.place_info.title !== "string" ||
    !data.place_info.title.trim() ||
    (data.search_parameters?.place_id && data.search_parameters.place_id !== placeId)
  )
    throw Error("Avaliações não confirmadas");
  const rating = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 5 ? v : null;
  const seen = new Set<string>();
  const reviews = data.reviews
    .slice(0, 20)
    .flatMap((r: ReviewsObject) => {
      if (
        !r ||
        typeof r !== "object" ||
        (r.source && r.source !== "Google") ||
        rating(r.rating) === null
      )
        return [];
      const id = reviewText(r.review_id, 250);
      if (!id || seen.has(id)) return [];
      seen.add(id);
      return [
        {
          id,
          rating: rating(r.rating),
          text: reviewText(r.snippet),
          date: reviewText(r.date, 100),
          isoDate: reviewDate(r.iso_date),
          url: reviewLink(r.link),
          response: reviewText(r.response?.snippet),
          responseDate: reviewText(r.response?.date, 100),
          responseIsoDate: reviewDate(r.response?.iso_date),
        },
      ];
    })
    .slice(0, 10);
  // No reviewer identity, contributor ID, photo, raw response or third-party tracking links.
  const projection = {
    placeId,
    name: reviewText(data.place_info.title, 200),
    rating: rating(data.place_info.rating),
    total:
      typeof data.place_info.reviews === "number" &&
      Number.isSafeInteger(data.place_info.reviews) &&
      data.place_info.reviews >= 0
        ? data.place_info.reviews
        : null,
    reviews,
    source: "google_maps_reviews",
    sort: "newestFirst",
    queriedAt: new Date().toISOString(),
    url:
      "https://www.google.com/maps/search/?" +
      new URLSearchParams({
        api: "1",
        query: reviewText(data.place_info.title, 200),
        query_place_id: placeId,
      }),
  };
  while (new TextEncoder().encode(JSON.stringify(projection)).length > 30000 && reviews.length)
    reviews.pop();
  return projection;
}
export async function handleReviews(
  action: string,
  data: ReviewsObject,
  actor: ReviewsObject,
  db: (path: string, method?: string, body?: unknown) => Promise<any>,
  optional: (name: string, body: unknown) => Promise<any>,
  sync: () => Promise<any>,
  supplier: (path: string, params: Record<string, string>) => Promise<any>,
) {
  const config = await optional("astros_reviews_config", {
    actor: actor.id,
    administrator: action.startsWith("admin-"),
  });
  if (action === "admin-reviews-config") return config || { installed: false, enabled: false };
  if (!config) {
    if (action === "reviews-read")
      return { installed: false, enabled: false, eligible: false, request: { state: "none" } };
    throw Error("Ative a atualização de avaliações antes de continuar");
  }
  if (action === "admin-reviews-save") {
    if (
      typeof data.enabled !== "boolean" ||
      ![data.dailyCalls, data.userDaily, data.reserveCalls].every(Number.isSafeInteger)
    )
      throw Error("Configuração de avaliações inválida");
    await db("rpc/astros_reviews_save", "POST", {
      actor: actor.id,
      active: data.enabled,
      daily_limit: data.dailyCalls,
      user_limit: data.userDaily,
      reserve_limit: data.reserveCalls,
    });
    return { saved: true };
  }
  const validId = (v: unknown) => {
    if (
      typeof v !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
    )
      throw Error("Referência de avaliações inválida");
    return v;
  };
  if (data.source !== undefined && data.source !== "maps")
    throw Error("Avaliações disponíveis somente para leads Google Maps");
  const args = { actor: actor.id, lead_key: validId(data.leadId), origin_key: "maps" };
  const snapshot = await db("rpc/astros_reviews_snapshot", "POST", args),
    placeId = reviewsPlaceId(snapshot);
  if (action === "reviews-consult") {
    const id = validId(data.requestId);
    if (!placeId) throw Error("Este lead não possui identificação Maps compatível");
    if (config.enabled) await sync().catch(() => {});
    const begin = await db("rpc/astros_reviews_begin", "POST", {
      ...args,
      request_key: id,
      place_key: placeId,
    });
    if (begin.dispatch) {
      let projection = null;
      try {
        projection = reviewsProjection(
          await supplier("search.json", {
            engine: "google_maps_reviews",
            place_id: placeId,
            hl: "pt-br",
            sort_by: "newestFirst",
            num: "10",
          }),
          placeId,
        );
      } catch {
        /* Preserve reservation; never retry an uncertain dispatch. */
      }
      await db("rpc/astros_reviews_finish", "POST", {
        actor: actor.id,
        request_key: begin.requestId,
        payload: projection,
      });
    }
  } else if (action !== "reviews-read") throw Error("Operação de avaliações indisponível");
  return {
    ...config,
    eligible: !!placeId,
    request: await db("rpc/astros_reviews_read", "POST", args),
  };
}
