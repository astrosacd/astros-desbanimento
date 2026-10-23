import { describe, it, expect, vi } from "vitest";
import { webcrypto } from "node:crypto";
import {
  boundedJson,
  createHandler,
  fresh,
  validBalance,
} from "../../../supabase/functions/astros-status/index";
vi.stubGlobal("crypto", webcrypto);
const env = (k: string) =>
  ({
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "private-service",
    ASTROS_BASEROW_WRITE_TOKEN: "private-baserow",
  })[k];
const response = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
describe("read-only status worker", () => {
  it("serves only the sanitized projection to anonymous GET, ignoring query parameters", async () => {
    const fetcher = vi.fn(async (_url: any, _init?: any) =>
      response({ components: [], events: [] }),
    );
    const r = await createHandler(
      env,
      fetcher,
    )(new Request("https://edge/status?url=https://evil.example"));
    expect(r.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://project.supabase.co/rest/v1/rpc/astros_status_public",
    );
    expect(await r.text()).not.toContain("private");
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });
  it("rejects missing or wrong worker credentials without claiming a batch", async () => {
    const fetcher = vi.fn(async () => response([{ worker_secret: "saved-secret" }]));
    const handle = createHandler(env, fetcher);
    expect((await handle(new Request("https://edge", { method: "POST" }))).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      (
        await handle(
          new Request("https://edge", {
            method: "POST",
            headers: { "X-Astros-Status-Worker": "wrong" },
          }),
        )
      ).status,
    ).toBe(401);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(["five_sim", "smspool"])(
    "checks fixed read-only endpoints with %s and submits one sample per service",
    async (supplier) => {
      const calls: { url: string; body: any }[] = [];
      let finished: any;
      const fetcher = vi.fn(async (input: any, init: any) => {
        const url = String(input);
        calls.push({ url, body: init?.body });
        if (url.includes("astros_status_private"))
          return response([{ worker_secret: "saved-secret" }]);
        if (url.endsWith("astros_status_claim"))
          return response("2a67ddc4-d932-4192-8bc1-55ecec199d33");
        if (url.endsWith("astros_status_finish")) {
          finished = JSON.parse(init.body);
          return response(null);
        }
        if (url.endsWith("/status-health"))
          return response({
            service: "astros-mais",
            status: "ok",
            timestamp: new Date().toISOString(),
          });
        if (url.endsWith("/auth/v1/settings"))
          return response({ external: { email: true }, disable_signup: false });
        if (url.includes("astros_service_worker_status"))
          return response([{ last_seen: new Date().toISOString() }]);
        if (url.includes("/fields/table/511/")) return response([{ id: 1, name: "Nome" }]);
        if (url.includes("_settings?"))
          return response([
            { enabled: true, worker_at: new Date().toISOString(), active_supplier: supplier },
          ]);
        if (url.includes("_private?"))
          return response([{ api_key: "api-key", five_sim_key: "five-key" }]);
        if (url.includes("astros_prospect_capacity"))
          return response([{ worker_seen_at: new Date().toISOString() }]);
        if (url.includes("/user/profile")) return response({ id: 12, balance: 10 });
        if (url.endsWith("/user/balance")) {
          expect(init.body instanceof FormData).toBe(true);
          expect(init.body.get("key")).toBe("api-key");
          expect(init.headers?.["Content-Type"]).toBeUndefined();
          return response({ balance: "10.00" });
        }
        if (url.includes("smmraja")) return response({ balance: "12.50", currency: "USD" });
        if (url.includes("/account.json")) return response({ total_searches_left: 100 });
        if (url.endsWith("/v5/saldo"))
          return response({ saldo_total: 50, saldos: { pesquisa: 50 } });
        throw Error("Unexpected endpoint " + url);
      });
      const r = await createHandler(
        env,
        fetcher,
      )(
        new Request("https://edge", {
          method: "POST",
          headers: { "X-Astros-Status-Worker": "saved-secret" },
        }),
      );
      expect(r.status).toBe(200);
      expect(finished.samples).toHaveLength(7);
      expect(finished.samples.every((s: any) => s.result === "ok")).toBe(true);
      expect(
        calls.some((c) =>
          /buy|purchase|search\.json|reserve|wallet|rows\/table|enriquecer/.test(c.url),
        ),
      ).toBe(false);
      expect(calls.find((c) => c.url.includes("smmraja"))?.body).toBe("key=api-key&action=balance");
      expect(await r.text()).not.toMatch(/private|api-key|five-key|balance/);
    },
  );
  it("does not run checks when a worker already owns the lease", async () => {
    let calls = 0;
    const fetcher = vi.fn(async () =>
      response(++calls === 1 ? [{ worker_secret: "saved-secret" }] : null),
    );
    const r = await createHandler(
      env,
      fetcher,
    )(
      new Request("https://edge", {
        method: "POST",
        headers: { "X-Astros-Status-Worker": "saved-secret" },
      }),
    );
    expect(await r.json()).toEqual({ skipped: true });
    expect(calls).toBe(2);
  });
  it("bounds provider response size and validates balance and heartbeat formats", async () => {
    await expect(boundedJson(new Response("x".repeat(262145)))).rejects.toThrow();
    expect(validBalance("abc")).toBe(false);
    expect(validBalance(null)).toBe(false);
    expect(validBalance("0.12")).toBe(true);
    expect(fresh("invalid")).toBe(false);
    expect(fresh(new Date(Date.now() + 120000).toISOString())).toBe(false);
  });
});
