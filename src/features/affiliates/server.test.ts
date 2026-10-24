import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  requireAdmin: vi.fn(),
  getCookie: vi.fn(() => "session"),
  setResponseHeader: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
  getRequestUrl: vi.fn(() => new URL("https://mais.astroscomunicacaodigital.com/cadastro")),
}));
vi.mock("../admin/auth.server", () => mocks);
vi.mock("@tanstack/react-start/server", () => mocks);
import { overview, saveAccount, saveSettings, runWorker } from "./server";
import { remember, referral } from "./referral.server";
const uid = "11111111-1111-4111-8111-111111111111";
beforeEach(() => vi.resetAllMocks());
it("admin writes require live admin authorization before making any RPC", async () => {
  mocks.requireAdmin.mockRejectedValue(Error("denied"));
  await expect(saveAccount({ userId: uid, customRateBps: 1000 })).rejects.toThrow("denied");
  expect(mocks.request).not.toHaveBeenCalled();
});
it("client cannot select another account even when the session exists", async () => {
  mocks.getCookie.mockReturnValue("session");
  mocks.request.mockResolvedValueOnce(new Response("{}"));
  await expect(overview({ userId: uid, page: 1 }, false)).rejects.toThrow("não autorizado");
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it("preserves explicit zero versus global inheritance and sends exact basis points", async () => {
  mocks.getCookie.mockReturnValue("session");
  mocks.request.mockImplementation(async () => new Response("{}"));
  await saveAccount({ userId: uid, customRateBps: 0 });
  await saveAccount({ userId: uid, customRateBps: null });
  expect(JSON.parse(mocks.request.mock.calls[0][2].body)).toEqual({
    p_target: uid,
    p_value: { customRateBps: 0 },
  });
  expect(JSON.parse(mocks.request.mock.calls[1][2].body).p_value.customRateBps).toBeNull();
});
it("cannot activate without a recent installed worker and never reports success on worker failures", async () => {
  mocks.getCookie.mockReturnValue("session");
  mocks.request.mockResolvedValueOnce(
    new Response(JSON.stringify({ message: "Execute a rotina de afiliação antes de ativar" }), {
      status: 400,
    }),
  );
  await expect(
    saveSettings({ enabled: true, rateBps: 500, minimumCents: 0, maximumCents: 0 }),
  ).rejects.toThrow("Execute a rotina");
  mocks.request.mockResolvedValueOnce(new Response("{}", { status: 503 }));
  await expect(runWorker()).rejects.toThrow("Não foi possível");
});
it("uses a fixed primary origin and bounds visible history without leaking the extra page row", async () => {
  mocks.getCookie.mockReturnValue("session");
  mocks.request.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        code: "a".repeat(32),
        origin: "https://mais.astroscomunicacaodigital.com",
        events: Array.from({ length: 21 }, (_, id) => ({ id })),
      }),
    ),
  );
  const r = await overview({ userId: uid, page: 2 }, true);
  expect(r.hasMore).toBe(true);
  expect(r.events).toHaveLength(20);
  expect(JSON.parse(mocks.request.mock.calls[0][2].body)).toEqual({ p_user: uid, p_page: 2 });
});
it("first referral is retained in an HttpOnly cookie and is never a percentage or role", () => {
  mocks.getCookie.mockReturnValue(undefined as any);
  mocks.getRequestUrl.mockReturnValue(
    new URL("https://mais.astroscomunicacaodigital.com/cadastro"),
  );
  remember("a".repeat(32));
  expect(mocks.setCookie).toHaveBeenCalledWith(
    "astros_referral",
    "a".repeat(32),
    expect.objectContaining({ httpOnly: true, secure: true, maxAge: 2592000, sameSite: "lax" }),
  );
  mocks.getCookie.mockReturnValue("a".repeat(32));
  remember("b".repeat(32));
  expect(mocks.setCookie).toHaveBeenCalledTimes(1);
  expect(referral()).toBe("a".repeat(32));
  mocks.getCookie.mockReturnValue("admin:100%");
  expect(referral()).toBeUndefined();
});
