import { getCookie, setResponseHeader } from "@tanstack/react-start/server";
import { requireAdmin, request } from "../admin/auth.server";
export async function digitalCall(action: string, data: unknown = {}, admin = false) {
  setResponseHeader("Cache-Control", "private, no-store");
  if (admin) await requireAdmin();
  const token = getCookie(admin ? "astros_admin_session" : "astros_client_session");
  if (!token) throw Error("Entre novamente para continuar.");
  try {
    const r = await request("/functions/v1/astros-digital-research", token, {
      method: "POST",
      body: JSON.stringify({ action, data }),
      redirect: "error",
      signal: AbortSignal.timeout(45000),
    });
    const v = await r.json().catch(() => null);
    if (r.status === 404 && (action === "config" || action === "admin-config"))
      return { installed: false, enabled: false, tools: {}, version: 1 };
    if (!r.ok || !v)
      throw Error(
        typeof v?.error === "string"
          ? v.error
          : "Não foi possível confirmar a operação. Confira a mesma pesquisa.",
      );
    return v;
  } catch (e) {
    if (e instanceof Error && e.name === "Error") throw e;
    throw Error(
      "Não foi possível confirmar a conexão. Consulte Minhas pesquisas antes de iniciar outra.",
    );
  }
}
export async function accessByEmail(data: { email: string; enabled: boolean }) {
  await requireAdmin();
  const token = getCookie("astros_admin_session")!;
  const params = new URLSearchParams({
    select: "id,email",
    email: "eq." + data.email.toLowerCase(),
    limit: "2",
  });
  const r = await request("/rest/v1/painel_de_desbanimento?" + params, token);
  const rows = r.ok ? await r.json() : null;
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    rows[0].email?.toLowerCase() !== data.email.toLowerCase()
  )
    throw Error("Não foi possível identificar uma única conta com esse e-mail.");
  return digitalCall("admin-access", { userId: rows[0].id, enabled: data.enabled }, true);
}
