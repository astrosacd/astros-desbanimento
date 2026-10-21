import { it, expect, vi, afterEach } from "vitest";
vi.mock("../admin/auth.server", () => ({ request: vi.fn() }));
import { request } from "../admin/auth.server";
import { supplierBalance, extendedContext } from "./sources.server";
afterEach(() => vi.clearAllMocks());
it("uses only the existing admin balance action and keeps USD separate from wallet cents", async () => {
  vi.mocked(request).mockResolvedValue(
    new Response(
      JSON.stringify({
        balanceUnits: 1990000,
        currency: "USD",
        checkedAt: "2026-10-16T20:00:00Z",
        apiKey: "must-not-escape",
      }),
    ),
  );
  const v = await supplierBalance("private-session", "social");
  expect(v).toMatchObject({ available: true, balanceUsd: 1.99, currency: "USD" });
  expect(JSON.stringify(v)).not.toContain("must-not-escape");
  expect(request).toHaveBeenCalledWith(
    "/functions/v1/astros-social",
    "private-session",
    expect.objectContaining({ body: JSON.stringify({ action: "admin-balance", data: {} }) }),
  );
});
it("marks failed and malformed supplier balances unknown rather than zero", async () => {
  vi.mocked(request)
    .mockResolvedValueOnce(new Response("{}", { status: 500 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ balanceUnits: -1, currency: "USD", checkedAt: "today" })),
    );
  for (let i = 0; i < 2; i++) {
    const v = await supplierBalance("admin", "sms");
    expect(v.available).toBe(false);
    expect(v).not.toHaveProperty("balanceUsd");
  }
});
it("keeps base assistant usable before complementary SQL activation", async () => {
  vi.mocked(request).mockResolvedValue(new Response("{}", { status: 404 }));
  expect((await extendedContext("admin", "2026-10-16", "2026-10-16", "")).available).toBe(false);
});

it("keeps diagnostics unavailable rather than inventing no errors before SQL activation", async () => {
  const { diagnosticContext } = await import("./sources.server");
  vi.mocked(request).mockResolvedValueOnce(new Response("{}", { status: 404 }));
  expect(await diagnosticContext("admin", "2026-10-17", "2026-10-17", "client")).toMatchObject({
    available: false,
    reason: "not_activated",
  });
  vi.mocked(request).mockResolvedValueOnce(
    new Response(JSON.stringify({ version: 1, total: 0, secret: "never-escape" })),
  );
  const r = await diagnosticContext("admin", "2026-10-17", "2026-10-17", "");
  expect(r.available).toBe(false);
  expect(JSON.stringify(r)).not.toContain("never-escape");
});

it("accepts a bounded diagnostic projection and strips unexpected private fields", async () => {
  const { diagnosticContext } = await import("./sources.server");
  const value = {
    version: 1,
    generatedAt: "2026-10-17T12:00:00Z",
    scope: "period",
    total: 1,
    byModule: { sms: 1 },
    matchedRecords: 0,
    records: [],
    events: [
      {
        module: "sms",
        occurred_at: "2026-10-17T12:00:00Z",
        email: "ana@test.local",
        reference_id: "20000000-0000-4000-8000-000000000001",
        service_ref: "7",
        category: "BALANCE_ERROR",
        state: "refunded",
        http_status: 400,
        amount_cents: 1000,
        refund_cents: null,
        raw_payload: "private-provider-data",
      },
    ],
    health: [],
    coverage: {
      operationalRecords: true,
      providerRawPayloads: false,
      platformRuntimeLogs: false,
      browserConsole: false,
      sourceCode: false,
    },
    limitations: [],
    apiKey: "private-key",
  };
  vi.mocked(request).mockResolvedValueOnce(new Response(JSON.stringify(value)));
  const result = await diagnosticContext("admin", "2026-10-17", "2026-10-17", "");
  expect(result).toMatchObject({
    available: true,
    total: 1,
    events: [{ category: "BALANCE_ERROR" }],
  });
  expect(JSON.stringify(result)).not.toContain("private-key");
  expect(JSON.stringify(result)).not.toContain("private-provider-data");
});

it("keeps the named SMSPool source on SMSPool regardless of active purchase supplier",async()=>{
 vi.mocked(request).mockResolvedValue(new Response(JSON.stringify({balanceUnits:1000000,currency:'USD',checkedAt:'2026-10-21T12:00:00Z'})));
 expect(await supplierBalance('admin','sms')).toMatchObject({name:'SMSPool',available:true,balanceUsd:1});
 expect(request).toHaveBeenCalledWith('/functions/v1/astros-sms','admin',expect.objectContaining({body:JSON.stringify({action:'admin-balance',data:{supplier:'smspool'}})}));
});
