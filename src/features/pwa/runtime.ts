export const PWA_SCRIPT = "/astros-sw.js";
export const PWA_CACHE_PREFIX = "astros-mais-pwa-";
export function ownsPwa(registration: ServiceWorkerRegistration, origin: string) {
  return [registration.active, registration.waiting, registration.installing].some((worker) => {
    if (!worker) return false;
    const url = new URL(worker.scriptURL);
    return url.origin === origin && url.pathname === PWA_SCRIPT;
  });
}
export async function disablePwa(
  container: ServiceWorkerContainer,
  cacheStorage: CacheStorage | undefined,
  origin: string,
) {
  const registrations = await container.getRegistrations();
  await Promise.all(
    registrations
      .filter((registration) => ownsPwa(registration, origin))
      .map(async (registration) => {
        for (const worker of [registration.active, registration.waiting, registration.installing])
          worker?.postMessage({ type: "ASTROS_PWA_DISABLE" });
        await registration.unregister();
      }),
  );
  if (cacheStorage) {
    const names = await cacheStorage.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(PWA_CACHE_PREFIX))
        .map((name) => cacheStorage.delete(name)),
    );
  }
}
export function standalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
export async function pwaConfig(signal: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(abort, 8000);
  try {
    const response = await fetch("/pwa/config.json?t=" + Date.now(), {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
      throw Error("PWA configuration unavailable");
    const value: unknown = await response.json();
    if (
      !value ||
      typeof value !== "object" ||
      !("enabled" in value) ||
      typeof value.enabled !== "boolean"
    )
      throw Error("Invalid PWA configuration");
    return value.enabled;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
