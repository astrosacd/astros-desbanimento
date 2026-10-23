import { setResponseHeader } from "@tanstack/react-start/server";
import { request } from "../admin/auth.server";
export async function signupProtectionConfig(): Promise<{
  enabled: boolean;
  siteKey: string;
  endpoint: string;
}> {
  setResponseHeader("Cache-Control", "no-store");
  const response = await request("/rest/v1/rpc/astros_signup_public_config", undefined, {
    method: "POST",
    body: "{}",
  });
  const config = await response.json().catch(() => null);
  // Only the explicit missing-migration condition supports installation on the old schema.
  if (!response.ok && (config?.code === "PGRST202" || config?.code === "42883"))
    return { enabled: false, siteKey: "", endpoint: "" };
  if (
    !response.ok ||
    typeof config?.enabled !== "boolean" ||
    (config.enabled && (typeof config.siteKey !== "string" || !config.siteKey))
  )
    throw Error(
      "Verificação de segurança temporariamente indisponível. Atualize a página e tente novamente.",
    );
  const base = (process.env["SUPABASE_URL"] ?? "https://tevljvidqbvrcgzqypwf.supabase.co").replace(
    /\/$/,
    "",
  );
  return {
    enabled: config.enabled,
    siteKey: config.siteKey || "",
    endpoint: `${base}/functions/v1/astros-signup-guard`,
  };
}
export async function requireSignupPermit(permit: string | undefined, email: string) {
  const config = await signupProtectionConfig();
  if (config.enabled && !/^[0-9a-f]{64}$/.test(permit || ""))
    throw Error("Confirme a verificação de segurança antes de criar sua conta.");
  if (config.enabled) {
    const response = await request("/rest/v1/rpc/astros_signup_validate_permit", undefined, {
      method: "POST",
      body: JSON.stringify({ p_permit: permit, p_email: email }),
    });
    if (!response.ok || (await response.json().catch(() => false)) !== true)
      throw Error("A verificação de segurança expirou. Confirme novamente.");
  }
  // The Auth INSERT trigger consumes the proof atomically, including private Gmail signup.
}
