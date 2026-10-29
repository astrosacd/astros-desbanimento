import { digitalTransport } from "./transport";
import { getCookie, setResponseHeader } from "@tanstack/react-start/server";
import { requireAdmin, request } from "../admin/auth.server";
export async function digitalCall(action: string, data: unknown = {}, admin = false) {
  setResponseHeader("Cache-Control", "private, no-store");
  if (admin) await requireAdmin();
  const token = getCookie(admin ? "astros_admin_session" : "astros_client_session");
  if (!token) throw Error("Entre novamente para continuar.");
  // Edge repeats live identity/role checks; keep the existing client password gate here too.
  if (!admin) {
    const auth = await request("/auth/v1/user", token);
    if (!auth.ok) throw Error("Entre novamente para continuar.");
  }
  return digitalTransport(action, data, token);
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
