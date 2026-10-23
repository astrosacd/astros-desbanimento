import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  request: vi.fn(),
  cookie: vi.fn(() => "admin-token"),
  header: vi.fn(),
}));
vi.mock("../admin/auth.server", () => ({
  requireAdmin: mocks.requireAdmin,
  request: mocks.request,
}));
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: mocks.cookie,
  setResponseHeader: mocks.header,
}));
import { writeStatus } from "./server";
const data = {
  key: "sms" as const,
  status: "maintenance" as const,
  message: "Manutenção programada",
  expires: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: "admin" });
});
it("requires administrator authorization before accessing Auth or RPC", async () => {
  mocks.requireAdmin.mockRejectedValue(Error("Acesso negado"));
  await expect(writeStatus(data)).rejects.toThrow("Acesso negado");
  expect(mocks.request).not.toHaveBeenCalled();
});
it("blocks unconfirmed admin identity before saving", async () => {
  mocks.request.mockResolvedValueOnce(new Response(JSON.stringify({ id: "admin" })));
  await expect(writeStatus(data)).rejects.toThrow("confirmada");
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it.each([new Response(null, { status: 204 }), new Response(""), new Response("null")])(
  "accepts successful void RPC responses without reporting a false save error",
  async (rpcResponse) => {
    mocks.request
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "admin", email_confirmed_at: "2026-01-01" })),
      )
      .mockResolvedValueOnce(rpcResponse);
    await expect(writeStatus(data)).resolves.toEqual({ saved: true });
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.request).toHaveBeenLastCalledWith(
      "/rest/v1/rpc/astros_status_save",
      "admin-token",
      {
        method: "POST",
        body: JSON.stringify({
          component_key: "sms",
          manual_status: "maintenance",
          public_message: data.message,
          expires: null,
        }),
      },
    );
  },
);

it("uses the admin-only enhanced RPC for incident details", async () => {
  const details = {
    phase: "identified" as const,
    impact: "Novas solicitações afetadas",
    startsAt: null,
    nextUpdate: null,
  };
  mocks.request
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "admin", email_confirmed_at: "2026-01-01" })),
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  await expect(writeStatus({ ...data, details })).resolves.toEqual({ saved: true });
  expect(mocks.request.mock.lastCall?.[0]).toBe("/rest/v1/rpc/astros_status_save_v2");
  expect(JSON.parse(mocks.request.mock.lastCall?.[2].body)).toMatchObject({ details });
});
