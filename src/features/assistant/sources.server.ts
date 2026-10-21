import { diagnosticResult, type diagnosticModules } from "./diagnostics";
import { request } from "../admin/auth.server";
export async function supplierBalance(token: string, module: "social" | "sms") {
  const name = module === "social" ? "SMMRaja" : "SMSPool";
  try {
    const r = await request(`/functions/v1/astros-${module}`, token, {
      method: "POST",
      body: JSON.stringify({ action: "admin-balance", data: module === "sms" ? {supplier:"smspool"} : {} }),
      signal: AbortSignal.timeout(18000),
    });
    if (!r.ok) throw Error("unavailable");
    const v = await r.json();
    if (
      v.currency !== "USD" ||
      !Number.isSafeInteger(v.balanceUnits) ||
      v.balanceUnits < 0 ||
      typeof v.checkedAt !== "string" ||
      !Number.isFinite(Date.parse(v.checkedAt))
    )
      throw Error("invalid");
    return {
      name,
      available: true,
      currency: "USD",
      balanceUsd: v.balanceUnits / 1000000,
      checkedAt: v.checkedAt,
      scope: "Saldo atual da conta do fornecedor externo. Não é saldo de clientes na carteira.",
    };
  } catch {
    return {
      name,
      available: false,
      message:
        "Saldo externo não confirmado. Não substituir pelo saldo da carteira nem interpretar como zero.",
    };
  }
}
export async function extendedContext(
  token: string,
  from: string,
  until: string,
  clientSearch: string,
) {
  try {
    const r = await request("/rest/v1/rpc/astros_assistant_extended", token, {
      method: "POST",
      body: JSON.stringify({ date_from: from, date_until: until, client_search: clientSearch }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw Error("not ready");
    const v = await r.json();
    if (v?.version !== 2) throw Error("invalid");
    return { available: true, ...v };
  } catch {
    return {
      available: false,
      message: "Consultas ampliadas ainda não confirmadas. Ative o SQL complementar do assistente.",
    };
  }
}

export async function diagnosticContext(
  token: string,
  from: string,
  until: string,
  clientSearch: string,
  module: (typeof diagnosticModules)[number] = "all",
  reference = "",
) {
  try {
    const r = await request("/rest/v1/rpc/astros_assistant_diagnostics", token, {
      method: "POST",
      body: JSON.stringify({
        date_from: from,
        date_until: until,
        client_search: clientSearch,
        module_filter: module,
        reference_filter: reference,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (r.status === 404)
      return {
        available: false,
        reason: "not_activated",
        message: "A consulta ampliada de erros ainda não foi ativada no Supabase.",
      };
    if (!r.ok) throw Error("unavailable");
    return { available: true, ...diagnosticResult.parse(await r.json()) };
  } catch {
    return {
      available: false,
      reason: "not_confirmed",
      message:
        "Não foi possível confirmar os diagnósticos operacionais. Não concluir que não há erros.",
    };
  }
}
