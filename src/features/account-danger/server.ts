import { getCookie, setResponseHeader } from "@tanstack/react-start/server";
import { requireAdmin, request } from "../admin/auth.server";
import { targetSchema, deleteSchema, previewSchema, receiptSchema } from "./model";
async function session() {
  const admin = await requireAdmin();
  setResponseHeader("Cache-Control", "private, no-store");
  const token = getCookie("astros_admin_session");
  if (!token) throw Error("Entre novamente na administração.");
  return { admin, token };
}
const messages = new Set([
  "Exclusão disponível somente para o proprietário autorizado.",
  "Escolha uma conta de cliente válida; administradores e a própria conta são protegidos.",
  "Confira o e-mail e confirme o tratamento dos serviços externos.",
  "Confirme novamente sua senha de proprietário.",
  "Referência de exclusão divergente.",
  "A prévia expirou. Faça uma nova conferência.",
  "Digite exatamente o e-mail da conta selecionada.",
  "Existem pendências. Faça uma nova conferência.",
  "Os dados da conta mudaram. Faça uma nova conferência.",
  "Confirme o destino do saldo antes de excluir.",
  "Restaram vínculos. A exclusão foi desfeita; faça uma nova conferência.",
]);
async function rpc(name: string, token: string, body: object) {
  let r: Response;
  try {
    r = await request("/rest/v1/rpc/" + name, token, {
      method: "POST",
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    throw Error(
      "Resultado não confirmado. Confira novamente mantendo a mesma referência de exclusão.",
    );
  }
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 404 && data?.code === "PGRST202")
      throw Error("Zona de perigo disponível após instalar o SQL de exclusão.");
    throw Error(
      messages.has(data?.message)
        ? data.message
        : "Não foi possível concluir a conferência ou exclusão. Nenhum sucesso foi confirmado. Confira novamente; se persistir, solicite revisão técnica.",
    );
  }
  return data;
}
export async function access() {
  const { token } = await session();
  try {
    return { allowed: (await rpc("astros_deletion_access", token, {})) === true };
  } catch {
    return { allowed: false };
  }
}
export async function preview(input: unknown) {
  const { token } = await session();
  const data = targetSchema.parse(input);
  return previewSchema.parse(
    await rpc("astros_deletion_preview", token, { target: data.clientId }),
  );
}
export async function execute(input: unknown) {
  const { admin, token } = await session();
  const data = deleteSchema.parse(input);
  // Server and SQL both authorize the owner. Check permission before attempting a password login.
  if ((await rpc("astros_deletion_access", token, {})) !== true)
    throw Error("Exclusão disponível somente para o proprietário autorizado.");
  const login = await request("/auth/v1/token?grant_type=password", undefined, {
    method: "POST",
    body: JSON.stringify({ email: admin.email, password: data.password }),
  });
  const fresh = login.ok ? await login.json() : null;
  if (!fresh?.access_token || fresh.user?.id !== admin.id || !fresh.user?.email_confirmed_at) {
    throw Error("Não foi possível confirmar sua senha de proprietário.");
  }
  // The new token is used only in memory for this call. Never set a cookie or return credentials.
  try {
    return receiptSchema.parse(
      await rpc("astros_deletion_execute", fresh.access_token, {
        target: data.clientId,
        ticket: data.previewId,
        confirmation_email: data.email,
        acknowledge_balance: data.acknowledgeBalance,
        acknowledge_external: data.acknowledgeExternal,
      }),
    );
  } finally {
    await request("/auth/v1/logout?scope=local", fresh.access_token, { method: "POST" }).catch(
      () => undefined,
    );
  }
}
