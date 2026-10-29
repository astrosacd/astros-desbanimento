/** Dedicated Edge bridge. Worker runtimes support manual/follow redirects consistently.
 * Never use redirect:error here; never retry an uncertain operation after a fetch error.
 */
const endpoint = "https://tevljvidqbvrcgzqypwf.supabase.co/functions/v1/astros-digital-research";
const readActions = new Set([
  "config",
  "admin-config",
  "history",
  "admin-history",
  "collections",
  "status",
  "admin-status",
  "admin-usage",
]);
export async function digitalTransport(action: string, data: unknown, token: string) {
  const original = new URL(endpoint);
  let current = original;
  let response: Response;
  try {
    const signal = AbortSignal.timeout(45000),
      body = JSON.stringify({ action, data });
    for (let attempt = 0; ; attempt++) {
      response = await fetch(current.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          apikey: "sb_publishable_wvwHQDOVefSPivb227u1Iw_lH5qEM_j",
        },
        body,
        redirect: "manual",
        signal,
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      // Only harmless database reads may follow a same-endpoint canonical redirect.
      if (!readActions.has(action) || attempt >= 2 || response.status === 303)
        throw Error("DIGITAL_REDIRECT_BLOCKED");
      const location = response.headers.get("location");
      if (!location) throw Error("DIGITAL_REDIRECT_BLOCKED");
      const next = new URL(location, current);
      if (
        next.origin !== original.origin ||
        next.username ||
        next.password ||
        next.pathname.replace(/\/$/, "") !== original.pathname.replace(/\/$/, "") ||
        next.search !== original.search
      )
        throw Error("DIGITAL_REDIRECT_BLOCKED");
      current = next;
    }
  } catch (e) {
    const code =
      e instanceof Error && e.message === "DIGITAL_REDIRECT_BLOCKED"
        ? "D02"
        : e instanceof Error && ["AbortError", "TimeoutError"].includes(e.name)
          ? "D03"
          : "D01";
    console.warn("astros_digital_transport_failure", { action, code });
    throw Error(
      `Não foi possível confirmar a conexão da Pesquisa digital. Confira a mesma tentativa antes de iniciar outra. (${code})`,
    );
  }
  if (response.status === 404 && (action === "config" || action === "admin-config"))
    return { installed: false, enabled: false, tools: {}, version: 1 };
  const value = await response.json().catch(() => null);
  if (!response.ok || !value) {
    if (typeof value?.error === "string") throw Error(value.error);
    throw Error(
      `Não foi possível confirmar a resposta da Pesquisa digital. Confira a mesma tentativa. (D04 · HTTP ${response.status})`,
    );
  }
  return value;
}
