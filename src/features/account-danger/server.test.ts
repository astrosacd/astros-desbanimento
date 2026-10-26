import { beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ admin: vi.fn(), request: vi.fn(), cookie: vi.fn() }));
vi.mock("../admin/auth.server", () => ({ requireAdmin: api.admin, request: api.request }));
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: api.cookie,
  setResponseHeader: vi.fn(),
}));
import { access, preview, execute } from "./server";
const clientId = "00000000-0000-4000-8000-000000000002",
  owner = "00000000-0000-4000-8000-000000000001";
const input = {
  clientId,
  previewId: "10000000-0000-4000-8000-000000000001",
  email: "duplicate@example.com",
  password: "PRIVATE-PASSWORD",
  acknowledgeBalance: true,
  acknowledgeExternal: true as const,
};
const response = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
});
beforeEach(() => {
  vi.resetAllMocks();
  api.admin.mockResolvedValue({ id: owner, email: "owner@example.com" });
  api.cookie.mockReturnValue("admin-cookie");
});
it("authenticates all handlers before reading or mutating", async () => {
  api.admin.mockRejectedValue(Error("admin only"));
  for (const f of [() => access(), () => preview({ clientId }), () => execute(input)])
    await expect(f()).rejects.toThrow("admin only");
  expect(api.request).not.toHaveBeenCalled();
});
it("fails closed without optional SQL", async () => {
  api.request.mockResolvedValue(response({ code: "PGRST202" }, false, 404));
  await expect(access()).resolves.toEqual({ allowed: false });
  await expect(preview({ clientId })).rejects.toThrow("instalar o SQL");
});
it("denies an employee before password login", async () => {
  api.request.mockResolvedValue(response(false));
  await expect(execute(input)).rejects.toThrow("proprietário");
  expect(api.request).toHaveBeenCalledTimes(1);
});
it("rejects actor/amount/SQL injection fields", async () => {
  await expect(execute({ ...input, actor: owner })).rejects.toThrow();
  expect(api.request).not.toHaveBeenCalled();
});
it("requires the same confirmed admin identity after reauthentication", async () => {
  api.request
    .mockResolvedValueOnce(response(true))
    .mockResolvedValueOnce(
      response({ access_token: "fresh", user: { id: clientId, email_confirmed_at: "now" } }),
    );
  await expect(execute(input)).rejects.toThrow("senha");
  expect(api.request.mock.calls.some((c) => c[0].endsWith("astros_deletion_execute"))).toBe(false);
});
it("uses the password only for fixed Auth login; SQL receives no password or actor", async () => {
  api.request
    .mockResolvedValueOnce(response(true))
    .mockResolvedValueOnce(
      response({ access_token: "fresh-token", user: { id: owner, email_confirmed_at: "now" } }),
    )
    .mockResolvedValueOnce(response({ success: true, repeated: false, removed: [] }))
    .mockResolvedValueOnce(response({}));
  const r = await execute(input);
  expect(r.success).toBe(true);
  const login = JSON.parse(api.request.mock.calls[1]![2].body);
  expect(login).toEqual({ email: "owner@example.com", password: input.password });
  const sql = api.request.mock.calls[2]!;
  expect(sql[1]).toBe("fresh-token");
  expect(JSON.parse(sql[2].body)).toEqual({
    target: clientId,
    ticket: input.previewId,
    confirmation_email: input.email,
    acknowledge_balance: true,
    acknowledge_external: true,
  });
  expect(JSON.stringify(r)).not.toMatch(/PRIVATE|fresh-token/);
  expect(api.request.mock.calls[3]![0]).toBe("/auth/v1/logout?scope=local");
});
it("closes the short-lived Auth session even after uncertain deletion, preserving recovery reference", async () => {
  api.request
    .mockResolvedValueOnce(response(true))
    .mockResolvedValueOnce(
      response({ access_token: "fresh", user: { id: owner, email_confirmed_at: "now" } }),
    )
    .mockRejectedValueOnce(Error("network"))
    .mockResolvedValueOnce(response({}));
  await expect(execute(input)).rejects.toThrow("mesma referência");
  expect(api.request.mock.calls[3]![0]).toContain("scope=local");
});
it("does not expose arbitrary database/provider errors", async () => {
  api.request.mockResolvedValue(response({ message: "SQL PRIVATE TOKEN" }, false, 500));
  await expect(preview({ clientId })).rejects.toThrow("Nenhum sucesso");
  await expect(preview({ clientId })).rejects.not.toThrow("TOKEN");
});
it("returns a safe actionable concurrency message", async () => {
  api.request.mockResolvedValue(
    response({ message: "Os dados da conta mudaram. Faça uma nova conferência." }, false, 400),
  );
  await expect(preview({ clientId })).rejects.toThrow("mudaram");
});
