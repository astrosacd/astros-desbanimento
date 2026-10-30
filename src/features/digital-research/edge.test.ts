import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { handler } from "../../../supabase/functions/astros-digital-research/index";
const user = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222";
let calls: any[], runs: number, scenario: string, executed: boolean;
function response(v: unknown, status = 200) {
  return new Response(JSON.stringify(v), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
beforeEach(() => {
  calls = [];
  runs = 0;
  scenario = "ok";
  executed = false;
  vi.stubGlobal("Deno", {
    env: {
      get: (name: string) =>
        ({
          SUPABASE_URL: "https://db.example",
          SUPABASE_SERVICE_ROLE_KEY: "private-service",
          SUPABASE_ANON_KEY: "public-key",
        })[name],
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: any, init: any = {}) => {
      const path = String(url);
      if (path.includes("/auth/v1/user"))
        return scenario === "unconfirmed"
          ? response({ id: user })
          : response({ id: user, email_confirmed_at: "2026-01-01", app_metadata: {} });
      if (path.includes("painel_de_desbanimento?"))
        return response([{ id: user, tipo_usuario: "cliente" }]);
      if (path.includes("astros_digital_private?"))
        return response([{ api_key: "private-apify-key" }]);
      if (path.includes("/rpc/astros_digital_call")) {
        const b = JSON.parse(init.body);
        calls.push(b);
        if (b.operation === "start") {
          const execute = !executed;
          executed = true;
          return response({ execute, maxUsdCents: 20, request: { id, state: "running" } });
        }
        if (b.operation === "check-claim")
          return response({
            runId: "RUN12345678901234",
            datasetId: "DATA1234567890123",
            lease: id,
            quantity: 10,
            tool: scenario.startsWith("marker") ? "instagram_followers" : "instagram_search",
          });
        return response({
          id,
          state: b.operation === "reject" ? "rejected" : "running",
          tool: scenario.startsWith("marker") ? "instagram_followers" : "instagram_search",
          query: "synthetic.missing",
        });
      }
      if (path.startsWith("https://api.apify.com/v2/acts/")) {
        runs++;
        expect(init.headers.Authorization).toBe("Bearer private-apify-key");
        expect(path).not.toContain("private-apify-key");
        expect(path).toContain("maxTotalChargeUsd=0.2");
        expect(path).toContain("restartOnError=false");
        if (scenario === "timeout") throw Error("network private error secret");
        if (scenario === "reject") return response({ error: { type: "invalid-input" } }, 400);
        if (scenario === "server") return response({ error: { type: "internal" } }, 503);
        return response({
          data: { id: "RUN12345678901234", defaultDatasetId: "DATA1234567890123" },
        });
      }
      if (path.includes("/actor-runs/"))
        return response({
          data: {
            id: "RUN12345678901234",
            defaultDatasetId: "DATA1234567890123",
            status:
              scenario === "failed" || scenario === "marker-failed"
                ? "FAILED"
                : scenario === "marker-running"
                  ? "RUNNING"
                  : "SUCCEEDED",
          },
        });
      if (path.includes("/datasets/") && !path.includes("/items"))
        return response({
          data: { id: "DATA1234567890123", itemCount: scenario === "marker-extra-items" ? 2 : 1 },
        });
      if (path.includes("/datasets/")) {
        if (scenario.startsWith("marker")) {
          expect(new URL(path).searchParams.has("fields")).toBe(false);
          expect(new URL(path).searchParams.get("clean")).toBe("false");
          if (scenario === "marker-error")
            return response([{ sourceUsername: "synthetic.missing", error: "blocked" }]);
          if (scenario === "marker-wrong") return response([{ sourceUsername: "other.profile" }]);
          return response([{ sourceUsername: "synthetic.missing" }]);
        }
        if (scenario === "empty") return response([]);
        if (scenario === "error-row")
          return response([
            { error: "example-unavailable", errorDescription: "private upstream detail" },
          ]);
        if (scenario === "malformed-profile") return response([{ unexpected: true }]);
        return response([{ username: "example", fullName: "Example" }]);
      }
      throw Error("unexpected fetch " + path);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
const invoke = (action: string, data: any = {}) =>
  handler(
    new Request("https://function.example", {
      method: "POST",
      headers: { Authorization: "Bearer signed-token" },
      body: JSON.stringify({ action, data }),
    }),
  );
const data = {
  requestId: id,
  tool: "instagram_search",
  query: "dentistas",
  quantity: 10,
  version: 1,
  unitCents: 10,
};
it("persists the dispatch intent before exactly one provider POST; repeated UUID never dispatches", async () => {
  await invoke("start", data);
  await invoke("start", data);
  expect(runs).toBe(1);
  expect(calls[0].operation).toBe("start");
  expect(calls.filter((c) => c.operation === "record-run")).toHaveLength(1);
});
it("never refunds or replays a network/5xx uncertain dispatch", async () => {
  for (const mode of ["timeout", "server"]) {
    scenario = mode;
    executed = false;
    calls = [];
    await invoke("start", data);
    expect(calls.some((c) => c.operation === "review")).toBe(true);
    expect(calls.some((c) => c.operation === "reject")).toBe(false);
    expect(calls.some((c) => c.operation === "finish")).toBe(false);
  }
});
it("refunds only a recognized definite start rejection", async () => {
  scenario = "reject";
  await invoke("start", data);
  expect(calls.some((c) => c.operation === "reject")).toBe(true);
  expect(calls.some((c) => c.operation === "record-run")).toBe(false);
});
it("refresh retrieves the original run and sanitized dataset without a provider POST", async () => {
  await invoke("refresh", { id });
  expect(runs).toBe(0);
  const finish = calls.find((c) => c.operation === "finish");
  expect(finish.input.rows[0]).toMatchObject({ username: "example", email: "", phone: "" });
  expect(finish.input.lease).toBe(id);
});
it("failed runs retain review without guessing a refund", async () => {
  scenario = "failed";
  await invoke("refresh", { id });
  expect(calls.some((c) => c.operation === "review")).toBe(true);
  expect(calls.some((c) => c.operation === "finish" || c.operation === "reject")).toBe(false);
});
it("blocks admin actions, internal transitions and unconfirmed identity", async () => {
  expect((await invoke("admin-save", {})).status).toBe(400);
  expect((await invoke("finish", {})).status).toBe(400);
  expect(calls).toHaveLength(0);
  scenario = "unconfirmed";
  expect((await invoke("start", data)).status).toBe(400);
  expect(runs).toBe(0);
});

it("moves a terminal run with error-only or malformed results to review instead of leaving it running", async () => {
  for (const mode of ["error-row", "malformed-profile"]) {
    scenario = mode;
    calls = [];
    const result = await invoke("refresh", { id });
    expect(calls.some((c) => c.operation === "review")).toBe(true);
    expect(calls.some((c) => c.operation === "finish" || c.operation === "reject")).toBe(false);
    expect(calls.some((c) => c.operation === "check-release")).toBe(true);
    expect(await result.text()).not.toContain("private upstream detail");
    expect(runs).toBe(0);
  }
});
it("settles a confirmed successful empty dataset with zero delivered profiles", async () => {
  scenario = "empty";
  await invoke("refresh", { id });
  expect(calls.find((c) => c.operation === "finish").input.rows).toEqual([]);
  expect(calls.some((c) => c.operation === "review")).toBe(false);
  expect(runs).toBe(0);
});

it("settles the verified source-only no-result marker without another dispatch", async () => {
  scenario = "marker";
  await invoke("refresh", { id });
  expect(calls.find((c) => c.operation === "finish").input.rows).toEqual([]);
  expect(calls.some((c) => c.operation === "reject" || c.operation === "review")).toBe(false);
  expect(runs).toBe(0);
});
it("does not settle a marker from a different source, with errors, or from a non-successful run", async () => {
  for (const mode of [
    "marker-wrong",
    "marker-error",
    "marker-failed",
    "marker-running",
    "marker-extra-items",
  ]) {
    scenario = mode;
    calls = [];
    await invoke("refresh", { id });
    expect(calls.some((c) => c.operation === "finish" || c.operation === "reject")).toBe(false);
    expect(runs).toBe(0);
  }
});
