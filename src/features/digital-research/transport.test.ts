import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { digitalTransport } from "./transport";
let fetcher: ReturnType<typeof vi.fn>;
const endpoint = "https://tevljvidqbvrcgzqypwf.supabase.co/functions/v1/astros-digital-research";
const response = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
beforeEach(() => {
  fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("works in a Worker that rejects redirect:error and preserves auth in headers only", async () => {
  fetcher.mockImplementation(async (url, init) => {
    if (init.redirect === "error") throw TypeError("Unsupported redirect mode");
    expect(init.redirect).toBe("manual");
    expect(init.headers.Authorization).toBe("Bearer private-session");
    expect(url).not.toContain("private-session");
    return response({ installed: true, enabled: false });
  });
  await expect(digitalTransport("admin-config", {}, "private-session")).resolves.toEqual({
    installed: true,
    enabled: false,
  });
  expect(fetcher).toHaveBeenCalledOnce();
});
it("allows a bounded same-endpoint canonical redirect only for reads", async () => {
  fetcher
    .mockResolvedValueOnce(
      new Response(null, { status: 307, headers: { location: endpoint + "/" } }),
    )
    .mockResolvedValueOnce(response({ installed: true }));
  await digitalTransport("admin-config", {}, "session");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1][0]).toBe(endpoint + "/");
  expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
});
it.each([
  endpoint.replace("supabase.co", "supabase.co.evil.test"),
  endpoint + "?token=x",
  "http://tevljvidqbvrcgzqypwf.supabase.co/functions/v1/astros-digital-research",
  endpoint.replace("astros-digital-research", "other-function"),
])("refuses credential forwarding to a changed endpoint %s", async (location) => {
  fetcher.mockResolvedValueOnce(new Response(null, { status: 307, headers: { location } }));
  await expect(digitalTransport("admin-config", {}, "private-session")).rejects.toThrow("D02");
  expect(fetcher).toHaveBeenCalledOnce();
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("private-session");
});
it("never follows a redirect or replays a paid mutation, even to the same endpoint", async () => {
  fetcher.mockResolvedValue(
    new Response(null, { status: 307, headers: { location: endpoint + "/" } }),
  );
  await expect(
    digitalTransport("start", { requestId: "stable-reference" }, "session"),
  ).rejects.toThrow("D02");
  expect(fetcher).toHaveBeenCalledOnce();
});
it("never retries a network failure and logs only a safe classification", async () => {
  fetcher.mockRejectedValue(TypeError("secret request private-session headers"));
  await expect(
    digitalTransport("start", { requestId: "stable-reference" }, "session"),
  ).rejects.toThrow("D01");
  expect(fetcher).toHaveBeenCalledOnce();
  expect(console.warn).toHaveBeenCalledWith("astros_digital_transport_failure", {
    action: "start",
    code: "D01",
  });
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("private-session");
});
it("reports timeouts distinctly without retries", async () => {
  const e = new Error("timeout");
  e.name = "TimeoutError";
  fetcher.mockRejectedValue(e);
  await expect(digitalTransport("config", {}, "session")).rejects.toThrow("D03");
  expect(fetcher).toHaveBeenCalledOnce();
});
it("preserves a definite Edge error and optional missing-install response", async () => {
  fetcher.mockResolvedValueOnce(response({ error: "Conta indisponível" }, 400));
  await expect(digitalTransport("admin-config", {}, "session")).rejects.toThrow(
    "Conta indisponível",
  );
  fetcher.mockResolvedValueOnce(response({}, 404));
  await expect(digitalTransport("config", {}, "session")).resolves.toMatchObject({
    installed: false,
    enabled: false,
  });
});
