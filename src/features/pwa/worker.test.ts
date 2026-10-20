import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, it, vi } from "vitest";
const source = readFileSync("public/astros-sw.js", "utf8");
function worker(enabled = true) {
  const listeners: Record<string, (event: any) => void> = {};
  const stores = new Map<string, Map<string, Response>>();
  const fetch = vi.fn(async (request: any) => {
    const url = typeof request === "string" ? request : request.url;
    if (url.startsWith("/pwa/config.json"))
      return new Response(JSON.stringify({ enabled }), {
        headers: { "content-type": "application/json" },
      });
    if (url === "/pwa/offline.html")
      return new Response("<main data-astros-offline>offline</main>", {
        headers: { "content-type": "text/html" },
      });
    return new Response("private-account-secret");
  });
  const self = {
    location: { origin: "https://panel.example" },
    registration: { unregister: vi.fn().mockResolvedValue(true) },
    clients: { claim: vi.fn().mockResolvedValue(undefined) },
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    addEventListener: (type: string, fn: any) => (listeners[type] = fn),
  };
  const caches = {
    keys: async () => [...stores.keys()],
    delete: vi.fn(async (name: string) => stores.delete(name)),
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      return {
        put: async (key: string, response: Response) =>
          stores.get(name)!.set(key, response.clone()),
        match: async (key: string) => stores.get(name)!.get(key)?.clone(),
      };
    },
  };
  vm.runInNewContext(source, {
    self,
    caches,
    fetch,
    URL,
    Date,
    Error,
    AbortController,
    setTimeout,
    clearTimeout,
  });
  async function lifecycle(type: string, data?: any) {
    let promise: Promise<any> | undefined;
    listeners[type]({ data, waitUntil: (v: Promise<any>) => (promise = v) });
    await promise;
  }
  function request(method = "GET", mode = "navigate", url = "https://panel.example/carteira") {
    let result: Promise<Response> | undefined;
    listeners.fetch({
      request: { method, mode, url },
      waitUntil: (promise: Promise<any>) => void promise.catch(() => {}),
      respondWith: (value: Promise<Response>) => (result = value),
    });
    return result;
  }
  return { self, fetch, caches, stores, lifecycle, request };
}
it("caches only the self-contained public fallback and never private navigations", async () => {
  const w = worker();
  await w.lifecycle("install");
  await w.lifecycle("activate");
  for (const path of ["/carteira", "/admin", "/reset-password?token=private", "/prospeccao"])
    expect(await (await w.request("GET", "navigate", "https://panel.example" + path))!.text()).toBe(
      "private-account-secret",
    );
  expect([...w.stores.values()].flatMap((m) => [...m.keys()])).toEqual(["/pwa/offline.html"]);
  const fallback = [...w.stores.values()][0].get("/pwa/offline.html")!;
  expect(await fallback.clone().text()).not.toContain("private");
});
it("does not intercept mutations, API calls, assets or another origin", () => {
  const w = worker();
  for (const method of ["POST", "PUT", "PATCH", "DELETE"])
    expect(w.request(method)).toBeUndefined();
  expect(w.request("GET", "cors", "https://panel.example/_serverFn/private")).toBeUndefined();
  expect(w.request("GET", "no-cors", "https://panel.example/assets/app.js")).toBeUndefined();
  expect(w.request("GET", "navigate", "https://external.example/")).toBeUndefined();
  expect(w.fetch).not.toHaveBeenCalled();
});
it("shows a public offline page after failed navigation without replaying or storing the failed request", async () => {
  const w = worker();
  await w.lifecycle("install");
  w.fetch.mockRejectedValueOnce(Error("offline"));
  const result = await w.request();
  expect(await result!.text()).toContain("data-astros-offline");
  expect([...w.stores.values()].flatMap((m) => [...m.keys()])).toEqual(["/pwa/offline.html"]);
});
it("preserves server errors as errors instead of hiding them behind an offline success page", async () => {
  const w = worker();
  await w.lifecycle("install");
  w.fetch.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
  expect((await w.request())!.status).toBe(503);
});
it("retires on disabled configuration and deletes only namespaced caches", async () => {
  const w = worker(false);
  w.stores.set("astros-mais-pwa-offline-old", new Map());
  w.stores.set("other-application", new Map());
  await w.lifecycle("install");
  await w.lifecycle("activate");
  expect(w.self.registration.unregister).toHaveBeenCalledOnce();
  expect([...w.stores.keys()]).toEqual(["other-application"]);
});
it("cleans old own caches on upgrade while keeping other applications intact", async () => {
  const w = worker();
  w.stores.set("astros-mais-pwa-offline-old", new Map());
  w.stores.set("other-application", new Map());
  await w.lifecycle("install");
  await w.lifecycle("activate");
  expect([...w.stores.keys()].sort()).toEqual(["astros-mais-pwa-offline-v1", "other-application"]);
  await w.lifecycle("message", { type: "ASTROS_PWA_DISABLE" });
  expect([...w.stores.keys()]).toEqual(["other-application"]);
});
it("refuses an unexpected HTML page in place of the public offline asset", async () => {
  const w = worker();
  w.fetch.mockImplementation(async (url: any) =>
    String(url).startsWith("/pwa/config.json")
      ? new Response('{"enabled":true}', { headers: { "content-type": "application/json" } })
      : new Response("<html>wrong route</html>", { headers: { "content-type": "text/html" } }),
  );
  await expect(w.lifecycle("install")).rejects.toThrow("Offline page unavailable");
  expect(w.stores.size).toBe(0);
});
it("never waits for a slow configuration check before returning a navigation", async () => {
  vi.useFakeTimers();
  try {
    const w = worker();
    w.fetch.mockImplementation(async (request: any) =>
      typeof request === "string" && request.startsWith("/pwa/config.json")
        ? new Promise<Response>(() => {})
        : new Response("fresh-network-page"),
    );
    expect(await (await w.request())!.text()).toBe("fresh-network-page");
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
