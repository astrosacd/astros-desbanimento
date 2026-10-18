import { getCookie, setResponseHeader } from "@tanstack/react-start/server";
import { requireAdmin } from "../admin/auth.server";
export async function prospectCall(action: string, data: unknown = {}, admin = false) {
  setResponseHeader("Cache-Control", "private, no-store");
  if (admin) await requireAdmin();
  const token = getCookie(admin ? "astros_admin_session" : "astros_client_session");
  if (!token) throw Error("Entre novamente para continuar.");
  let response: Response;
  try {
    const original = new URL("https://tevljvidqbvrcgzqypwf.supabase.co/functions/v1/astros-prospecting");
    let current = original;
    const signal = AbortSignal.timeout(100000);
    for (let attempt = 0; ; attempt++) {
      response = await fetch(current.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: "sb_publishable_wvwHQDOVefSPivb227u1Iw_lH5qEM_j",
        },
        body: JSON.stringify({ action, data }),
        redirect: "manual",
        signal,
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      if (attempt >= 2 || response.status === 303) throw Error("PROSPECT_REDIRECT_BLOCKED");
      const location = response.headers.get("location");
      if (!location) throw Error("PROSPECT_REDIRECT_BLOCKED");
      const next = new URL(location, current);
      if (next.origin !== original.origin || next.username || next.password ||
          next.pathname.replace(/\/$/, "") !== original.pathname.replace(/\/$/, "") ||
          next.search !== original.search) throw Error("PROSPECT_REDIRECT_BLOCKED");
      current = next;
    }
  } catch (error) {
    const redirectBlocked = error instanceof Error && error.message === "PROSPECT_REDIRECT_BLOCKED";
    const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    const code = redirectBlocked ? "P02" : timedOut ? "P03" : "P01";
    console.warn("astros_prospect_transport_failure", { action, code });
    throw Error(
      action === "search"
        ? "Não foi possível confirmar a conexão. Confira a mesma busca no histórico antes de iniciar outra."
        : action === "admin-config" || action === "config"
          ? `Não foi possível carregar a configuração de Prospecção. Tente novamente. (${code})`
          : "Não foi possível confirmar a conexão com Prospecção. Tente consultar novamente.",
    );
  }
  const value = await response.json().catch(() => null);
  if (!response.ok || !value)
    throw Error(
      response.status === 404
        ? "A Prospecção ainda precisa ser ativada pela equipe."
        : typeof value?.error === "string"
          ? value.error
          : "Não foi possível confirmar a operação. Consulte o histórico.",
    );
  return value;
}
