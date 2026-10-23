import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import { beforeEach, expect, it, vi } from "vitest";
const origin = "https://mais.astroscomunicacaodigital.com";
function guard({
  allowed = true,
  outcome = { success: true, action: "signup", hostname: new URL(origin).hostname },
  failed = false,
  secret = "test-only",
} = {}) {
  let handler: (request: Request) => Promise<Response> = null!;
  const rpc = vi.fn(async (name: string) => ({
    data: name === "astros_signup_allow_ip" ? allowed : true,
    error: failed ? {} : null,
  }));
  const verify = vi.fn(async () => new Response(JSON.stringify(outcome)));
  const source = readFileSync("supabase/functions/astros-signup-guard/index.ts", "utf8").replace(
    /^import .*;$/gm,
    "",
  );
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  new Function("Deno", "createClient", "fetch", "crypto", js)(
    {
      env: { get: (key: string) => (key === "ASTROS_TURNSTILE_SECRET_KEY" ? secret : "test-only") },
      serve: (h: typeof handler) => {
        handler = h;
      },
    },
    () => ({ rpc }),
    verify,
    webcrypto,
  );
  const call = (body: object = {}, headers: Record<string, string> = {}, requestOrigin = origin) =>
    handler(
      new Request("https://edge.example", {
        method: "POST",
        headers: { origin: requestOrigin, "cf-connecting-ip": "198.51.100.1", ...headers },
        body: JSON.stringify({ email: "maria@example.com", token: "captcha-token", ...body }),
      }),
    );
  return { call, rpc, verify, handler };
}
beforeEach(() => vi.restoreAllMocks());
it("verifies token, hostname and action server-side and issues only a hashed permit", async () => {
  const g = guard();
  const response = await g.call({ ip: "1.2.3.4" }, { "x-forwarded-for": "5.6.7.8" });
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.permit).toMatch(/^[a-f0-9]{64}$/);
  expect(g.rpc.mock.calls[0]).toEqual(["astros_signup_allow_ip", { p_ip: "198.51.100.1" }]);
  const args = g.rpc.mock.calls[1]![1];
  expect(args.p_token_hash).not.toBe(result.permit);
  expect(args.p_email).toBe("maria@example.com");
  const verification = g.verify.mock.calls[0]![1];
  expect(verification.body.get("remoteip")).toBe("198.51.100.1");
  expect(JSON.stringify(result)).not.toContain("test-only");
});
it("rejects provider failures, wrong host/action, invalid and replayed tokens before issuing proof", async () => {
  for (const outcome of [
    { success: false, action: "signup", hostname: new URL(origin).hostname },
    { success: true, action: "login", hostname: new URL(origin).hostname },
    { success: true, action: "signup", hostname: "evil.example" },
  ]) {
    const g = guard({ outcome });
    expect((await g.call()).status).toBe(400);
    expect(g.rpc).toHaveBeenCalledTimes(1);
  }
});
it("limits before Siteverify and fails closed when IP, secret or SQL are unavailable", async () => {
  const limited = guard({ allowed: false });
  const response = await limited.call();
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("900");
  expect(limited.verify).not.toHaveBeenCalled();
  for (const g of [guard({ failed: true }), guard({ secret: "" })]) {
    expect((await g.call()).status).toBe(503);
    expect(g.verify).not.toHaveBeenCalled();
  }
  const noIP = guard();
  expect((await noIP.call({}, { "cf-connecting-ip": "" })).status).toBe(503);
  expect(noIP.rpc).not.toHaveBeenCalled();
});
it("allows only fixed production origins and bounded valid input", async () => {
  const g = guard();
  expect((await g.call({}, {}, "https://evil.example")).status).toBe(403);
  expect((await g.call({ token: "" })).status).toBe(400);
  expect((await g.call({ token: "x".repeat(5000) })).status).toBe(413);
  expect(g.verify).not.toHaveBeenCalled();
  const preflight = await g.handler(
    new Request("https://edge.example", { method: "OPTIONS", headers: { origin } }),
  );
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(origin);
});
