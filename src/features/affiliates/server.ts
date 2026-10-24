import { getCookie, setResponseHeader } from "@tanstack/react-start/server";
import { request, requireAdmin } from "../admin/auth.server";
import {
  affiliateRules,
  affiliateAccount,
  affiliateQuery,
  type AffiliateOverview,
  type AffiliateSettings,
} from "./validation";
async function session(admin: boolean) {
  setResponseHeader("Cache-Control", "private, no-store");
  if (admin) await requireAdmin();
  const token = getCookie(admin ? "astros_admin_session" : "astros_client_session");
  if (!token) throw Error("Entre novamente na sua conta.");
  if (!admin) {
    const r = await request("/auth/v1/user", token);
    if (!r.ok) throw Error("Sua sessão expirou.");
  }
  return token;
}
async function rpc(name: string, token: string, data: unknown) {
  const r = await request("/rest/v1/rpc/" + name, token, {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => null);
    if (e?.message === "Execute a rotina de afiliação antes de ativar")
      throw Error("Execute a rotina de afiliação antes de ativar.");
    throw Error("A afiliação está temporariamente indisponível. Atualize e tente novamente.");
  }
  return r.json();
}
export async function overview(input: unknown, admin: boolean): Promise<AffiliateOverview> {
  const token = await session(admin),
    data = affiliateQuery.parse(input);
  if (data.userId && !admin) throw Error("Acesso não autorizado.");
  const result = await rpc("astros_affiliate_overview", token, {
    p_user: data.userId || null,
    p_page: data.page,
  });
  if (!result || !Array.isArray(result.events) || !/^[a-f0-9]{32}$/.test(result.code))
    throw Error("Resposta da afiliação indisponível.");
  const origin = result.origin;
  if (
    ![
      "https://mais.astroscomunicacaodigital.com",
      "https://desbanimento-de-numeros.lovable.app",
    ].includes(origin)
  )
    throw Error("Endereço principal do painel indisponível.");
  return {
    ...result,
    origin,
    hasMore: result.events.length > 20,
    events: result.events.slice(0, 20),
  };
}
export async function settings(): Promise<AffiliateSettings> {
  return rpc("astros_affiliate_admin_config", await session(true), {
    p_target: null,
    p_value: null,
  });
}
export async function saveSettings(input: unknown): Promise<AffiliateSettings> {
  const token = await session(true);
  return rpc("astros_affiliate_admin_config", token, {
    p_target: null,
    p_value: affiliateRules.parse(input),
  });
}
export async function saveAccount(input: unknown) {
  const token = await session(true),
    data = affiliateAccount.parse(input);
  return rpc("astros_affiliate_admin_config", token, {
    p_target: data.userId,
    p_value: { customRateBps: data.customRateBps },
  });
}
export async function runWorker() {
  const token = await session(true);
  const r = await request("/functions/v1/astros-affiliates", token, {
    method: "POST",
    body: "{}",
    signal: AbortSignal.timeout(55000),
  });
  const result = await r.json().catch(() => null);
  if (!r.ok || !Number.isSafeInteger(result?.processed) || !Number.isSafeInteger(result?.failed))
    throw Error(
      "Não foi possível confirmar a execução. Consulte o histórico antes de tentar novamente.",
    );
  return result as { processed: number; failed: number };
}
