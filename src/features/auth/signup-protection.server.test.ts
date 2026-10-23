import { beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../admin/auth.server", () => api);
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));
import { requireSignupPermit, signupProtectionConfig } from "./signup-protection.server";
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
beforeEach(() => vi.resetAllMocks());
it("allows only explicit old-schema fallback, never database or network failures", async () => {
  api.request.mockResolvedValueOnce(response({ code: "PGRST202" }, 404));
  expect((await signupProtectionConfig()).enabled).toBe(false);
  for (const value of [
    response({}, 503),
    response(null),
    response({ enabled: true, siteKey: "" }),
  ]) {
    api.request.mockResolvedValueOnce(value);
    await expect(signupProtectionConfig()).rejects.toThrow("temporariamente");
  }
  api.request.mockRejectedValueOnce(Error("offline"));
  await expect(signupProtectionConfig()).rejects.toThrow();
});
it("requires authentic, unexpired email-bound proof before any signup or mail call", async () => {
  const enabled = () => response({ enabled: true, siteKey: "site-key" });
  api.request.mockResolvedValueOnce(enabled());
  await expect(requireSignupPermit(undefined, "a@example.com")).rejects.toThrow("Confirme");
  expect(api.request).toHaveBeenCalledTimes(1);
  api.request.mockResolvedValueOnce(enabled()).mockResolvedValueOnce(response(false));
  await expect(requireSignupPermit("a".repeat(64), "a@example.com")).rejects.toThrow("expirou");
  api.request.mockResolvedValueOnce(enabled()).mockResolvedValueOnce(response(true));
  await requireSignupPermit("b".repeat(64), "b@example.com");
  expect(JSON.parse(api.request.mock.calls.at(-1)![2].body)).toEqual({
    p_permit: "b".repeat(64),
    p_email: "b@example.com",
  });
});
it("inactive setup preserves existing registration and does not call private validation", async () => {
  api.request.mockResolvedValueOnce(response({ enabled: false, siteKey: "" }));
  await requireSignupPermit(undefined, "a@example.com");
  expect(api.request).toHaveBeenCalledTimes(1);
});
