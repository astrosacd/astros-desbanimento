import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it, vi } from "vitest";
function worker(admin = true, secret = "a".repeat(64), failure = false) {
  let handler: any;
  const processed: any[] = [];
  const updates: any[] = [];
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: "actor" } }, error: null }) },
    rpc: vi.fn(async (name: string, args: any) => {
      if (name === "astros_affiliate_worker_authorize") return { data: admin, error: null };
      processed.push(args.p_order);
      return failure
        ? { error: { message: "private error must not leak" } }
        : { data: { processed: true }, error: null };
    }),
    from: (table: string) => ({
      select: () => ({
        eq: () => {
          if (table === "astros_affiliate_private")
            return { single: async () => ({ data: { worker_secret: secret }, error: null }) };
          return {
            lte: () => ({
              order: () => ({
                order: () => ({
                  limit: async () => ({
                    data: [
                      { order_id: "one", attempts: 0 },
                      { order_id: "two", attempts: 0 },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        },
      }),
      update: (body: any) => {
        updates.push({ table, body });
        const chain = {
          eq: () => chain,
          then: (resolve: any) => Promise.resolve({ error: null }).then(resolve),
        };
        return chain;
      },
    }),
  };
  const source = readFileSync("supabase/functions/astros-affiliates/index.ts", "utf8").replace(
    /^import .*;$/gm,
    "",
  );
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  new Function("Deno", "createClient", "timingSafeEqual", js)(
    { serve: (h: any) => (handler = h), env: { get: () => "test-only" } },
    () => db,
    (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]),
  );
  const call = (headers = {}) =>
    handler(new Request("https://edge.example", { method: "POST", headers }));
  return { call, processed, updates, db };
}
it("denies anonymous, non-admin and wrong worker secret before processing money", async () => {
  for (const headers of [
    {},
    { authorization: "Bearer user" },
    { "x-astros-affiliate-worker": "bad" },
  ]) {
    const w = worker(false);
    expect((await w.call(headers)).status).toBe(401);
    expect(w.processed).toHaveLength(0);
  }
});
it("accepts only verified admin or matching dedicated secret, calls atomic SQL and records heartbeat", async () => {
  for (const headers of [
    { authorization: "Bearer admin" },
    { "x-astros-affiliate-worker": "a".repeat(64) },
  ]) {
    const w = worker();
    const r = await w.call(headers);
    expect(await r.json()).toEqual({ processed: 2, failed: 0 });
    expect(w.processed).toEqual(["one", "two"]);
    expect(w.updates.at(-1).table).toBe("astros_affiliate_settings");
  }
});
it("failed commissions are retried without leaking raw errors or running purchases/payments", async () => {
  const w = worker(true, "a".repeat(64), true),
    r = await w.call({ authorization: "Bearer admin" });
  expect(await r.json()).toEqual({ processed: 0, failed: 2 });
  expect(w.updates.filter((x: any) => x.table === "astros_affiliate_commissions")).toHaveLength(2);
  expect(
    w.db.rpc.mock.calls.every((c: any) =>
      ["astros_affiliate_worker_authorize", "astros_affiliate_process_order"].includes(c[0]),
    ),
  ).toBe(true);
});
