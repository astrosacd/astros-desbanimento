import { request } from "../admin/auth.server";
export async function supplierBalance(token: string, module: "social" | "sms") {
  const name = module === "social" ? "SMMRaja" : "SMSPool";
  try {
    const r = await request(`/functions/v1/astros-${module}`, token, {
      method: "POST",
      body: JSON.stringify({ action: "admin-balance", data: {} }),
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
