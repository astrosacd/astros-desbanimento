/* Astros Mais: only a public, self-contained offline page is cached.
 * Never add application pages, API responses, credentials or background sync here.
 * Keep this URL available when disabling. See docs/PWA.md.
 */
const ASTROS_PWA_PREFIX = "astros-mais-pwa-";
const ASTROS_PWA_CACHE = ASTROS_PWA_PREFIX + "offline-v1";
const ASTROS_PWA_OFFLINE = "/pwa/offline.html";
let lastConfigCheck = 0;
let pwaEnabled = true;
async function clearOwnCaches(keepCurrent = false) {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter(
        (name) => name.startsWith(ASTROS_PWA_PREFIX) && (!keepCurrent || name !== ASTROS_PWA_CACHE),
      )
      .map((name) => caches.delete(name)),
  );
}
async function retirePwa() {
  pwaEnabled = false;
  await clearOwnCaches();
  await self.registration.unregister();
}
async function checkPwaEnabled() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch("/pwa/config.json?t=" + Date.now(), {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
      return null;
    const config = await response.json();
    if (typeof config.enabled !== "boolean") return null;
    lastConfigCheck = Date.now();
    pwaEnabled = config.enabled;
    return config.enabled;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const enabled = await checkPwaEnabled();
      if (enabled === null) throw new Error("PWA configuration unavailable");
      if (enabled) {
        const response = await fetch(ASTROS_PWA_OFFLINE, {
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
        });
        if (
          !response.ok ||
          !response.headers.get("content-type")?.includes("text/html") ||
          !(await response.clone().text()).includes("data-astros-offline")
        )
          throw new Error("Offline page unavailable");
        await (await caches.open(ASTROS_PWA_CACHE)).put(ASTROS_PWA_OFFLINE, response);
      }
      // This worker never caches application code and never reloads a page.
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const enabled = await checkPwaEnabled();
      if (enabled === false || !pwaEnabled) {
        await retirePwa();
        return;
      }
      await clearOwnCaches(true);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "ASTROS_PWA_DISABLE") event.waitUntil(retirePwa());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  // All assets, server functions, Auth, APIs and all non-GET operations pass through untouched.
  if (
    request.method !== "GET" ||
    request.mode !== "navigate" ||
    new URL(request.url).origin !== self.location.origin
  )
    return;
  // Configuration checks must never delay navigation or financial operations.
  if (Date.now() - lastConfigCheck > 300000)
    event.waitUntil(
      checkPwaEnabled().then(async (enabled) => {
        if (enabled === false) await retirePwa();
      }),
    );
  event.respondWith(
    (async () => {
      try {
        return await fetch(request, { cache: "no-store" });
      } catch (error) {
        if (!pwaEnabled) throw error;
        const fallback = await (await caches.open(ASTROS_PWA_CACHE)).match(ASTROS_PWA_OFFLINE);
        if (fallback) return fallback;
        throw error;
      }
    })(),
  );
});
