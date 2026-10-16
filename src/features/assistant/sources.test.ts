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
