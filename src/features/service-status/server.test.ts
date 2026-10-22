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
it("saves only the fixed status RPC using the server cookie and validated input", async () => {
  mocks.request
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "admin", email_confirmed_at: "2026-01-01" })),
    )
    .mockResolvedValueOnce(new Response("null"));
  await expect(writeStatus(data)).resolves.toEqual({ saved: true });
  expect(mocks.requireAdmin).toHaveBeenCalledOnce();
  expect(mocks.request).toHaveBeenLastCalledWith("/rest/v1/rpc/astros_status_save", "admin-token", {
    method: "POST",
    body: JSON.stringify({
      component_key: "sms",
      manual_status: "maintenance",
      public_message: data.message,
      expires: null,
    }),
  });
});
