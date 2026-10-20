import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { disablePwa, pwaConfig } from "./runtime";
afterEach(() => vi.unstubAllGlobals());
it("unregisters only this origin’s PWA worker and removes only its cache namespace", async () => {
  const own = {
    active: { scriptURL: "https://panel.example/astros-sw.js", postMessage: vi.fn() },
    unregister: vi.fn(),
  };
  const other = {
    active: { scriptURL: "https://panel.example/other.js", postMessage: vi.fn() },
    unregister: vi.fn(),
  };
  const foreign = {
    active: { scriptURL: "https://other.example/astros-sw.js", postMessage: vi.fn() },
    unregister: vi.fn(),
  };
  const container = { getRegistrations: vi.fn().mockResolvedValue([own, other, foreign]) };
  const caches = {
    keys: vi.fn().mockResolvedValue(["astros-mais-pwa-offline-v1", "session-cache", "another-app"]),
    delete: vi.fn(),
  };
  await disablePwa(container as any, caches as any, "https://panel.example");
  expect(own.unregister).toHaveBeenCalledOnce();
  expect(other.unregister).not.toHaveBeenCalled();
  expect(foreign.unregister).not.toHaveBeenCalled();
  expect(caches.delete.mock.calls).toEqual([["astros-mais-pwa-offline-v1"]]);
});
it("loads only validated public configuration without credentials, redirects or cache", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response('{"enabled":false}', { headers: { "content-type": "application/json" } }),
    );
  vi.stubGlobal("fetch", fetch);
  expect(await pwaConfig(new AbortController().signal)).toBe(false);
  expect(fetch.mock.calls[0][1]).toMatchObject({
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
  });
  fetch.mockResolvedValue(
    new Response('{"enabled":"true"}', { headers: { "content-type": "application/json" } }),
  );
  await expect(pwaConfig(new AbortController().signal)).rejects.toThrow();
});
it("uses origin-relative app identity and correctly sized PNG icons", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
  expect(manifest).toMatchObject({
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    name: "Astros Mais",
  });
  for (const icon of manifest.icons) {
    const buffer = readFileSync("public" + icon.src);
    const [width, height] = icon.sizes.split("x").map(Number);
    expect(buffer.readUInt32BE(16)).toBe(width);
    expect(buffer.readUInt32BE(20)).toBe(height);
  }
  const html = readFileSync("public/pwa/offline.html", "utf8");
  expect(html).toContain("data-astros-offline");
  expect(html).not.toMatch(/<script|https?:\/\/|<form/);
});
