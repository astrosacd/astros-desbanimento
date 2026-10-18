import { getCookie, setResponseHeader } from "@tanstack/react-start/server";
import { requireAdmin } from "../admin/auth.server";
export async function prospectCall(action: string, data: unknown = {}, admin = false) {
  setResponseHeader("Cache-Control", "private, no-store");
  if (admin) await requireAdmin();
  const token = getCookie(admin ? "astros_admin_session" : "astros_client_session");
  if (!token) throw Error("Entre novamente para continuar.");
  let response: Response;
  try {
    response = await fetch(
      "https://tevljvidqbvrcgzqypwf.supabase.co/functions/v1/astros-prospecting",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: "sb_publishable_wvwHQDOVefSPivb227u1Iw_lH5qEM_j",
        },
        body: JSON.stringify({ action, data }),
        redirect: "error",
        signal: AbortSignal.timeout(100000),
      },
    );
  } catch {
    throw Error(
      "Não foi possível confirmar a conexão. Confira a mesma busca no histórico antes de iniciar outra.",
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
