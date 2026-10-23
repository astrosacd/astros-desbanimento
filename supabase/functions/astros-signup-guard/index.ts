// Public preflight, deployed with Verify JWT OFF. Siteverify and private SQL are authoritative.
import { createClient } from "npm:@supabase/supabase-js@2";
const origins = [
  "https://mais.astroscomunicacaodigital.com",
  "https://desbanimento-de-numeros.lovable.app",
];
const hex = (v: ArrayBuffer | Uint8Array) =>
  Array.from(v instanceof Uint8Array ? v : new Uint8Array(v), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
    ...(origins.includes(origin)
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Headers": "content-type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        }
      : {}),
  };
  const reply = (status: number, message: string, extra = {}) =>
    new Response(JSON.stringify({ message, ...extra }), {
      status,
      headers: { ...headers, ...(status === 429 ? { "Retry-After": "900" } : {}) },
    });
  if (!origins.includes(origin)) return reply(403, "Origem indisponível.");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, "Método indisponível.");
  try {
    if (Number(req.headers.get("content-length")) > 4096) return reply(413, "Confira os dados.");
    const reader = req.body?.getReader();
    if (!reader) return reply(400, "Confira os dados.");
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) {
        await reader.cancel();
        return reply(413, "Confira os dados.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const input = JSON.parse(new TextDecoder().decode(bytes));
    if (
      typeof input.email !== "string" ||
      input.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) ||
      typeof input.token !== "string" ||
      input.token.length < 1 ||
      input.token.length > 2048
    )
      return reply(400, "Confirme a verificação de segurança.");
    const secret = Deno.env.get("ASTROS_TURNSTILE_SECRET_KEY");
    if (!secret) return reply(503, "Verificação de segurança temporariamente indisponível.");
    // The fixed *.supabase.co gateway sits behind Cloudflare, which overwrites this header.
    // No body IP, X-Forwarded-For fallback, shared VPS IP or user-provided alternate endpoint.
    const ip = req.headers.get("cf-connecting-ip") || "";
    if (!/^[0-9a-fA-F:.]{3,45}$/.test(ip))
      return reply(503, "Verificação de segurança temporariamente indisponível.");
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const limit = await db.rpc("astros_signup_allow_ip", { p_ip: ip });
    if (limit.error) return reply(503, "Verificação de segurança temporariamente indisponível.");
    if (!limit.data)
      return reply(429, "Muitas tentativas nesta conexão. Aguarde 15 minutos e tente novamente.");
    const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: input.token, remoteip: ip }),
      signal: AbortSignal.timeout(10000),
    });
    if (!result.ok) return reply(503, "Verificação de segurança temporariamente indisponível.");
    const outcome = await result.json();
    if (
      outcome.success !== true ||
      outcome.action !== "signup" ||
      outcome.hostname !== new URL(origin).hostname
    )
      return reply(400, "A verificação expirou ou não foi aceita. Tente novamente.");
    const permit = hex(crypto.getRandomValues(new Uint8Array(32)));
    const tokenHash = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(permit)));
    const issued = await db.rpc("astros_signup_issue_permit", {
      p_token_hash: tokenHash,
      p_email: input.email.trim().toLowerCase(),
    });
    if (issued.error || issued.data !== true)
      return reply(503, "Verificação de segurança temporariamente indisponível.");
    return reply(200, "Verificação concluída.", { permit });
  } catch {
    return reply(503, "Não foi possível verificar sua conexão. Tente novamente.");
  }
});
