// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// The wrapper forwards these options to Nitro; keep public PWA controls revalidated.
const pwaNitroOptions = {
  ...(process.env["ASTROS_DEPLOY_TARGET"] === "vps" ? { preset: "node-server" } : {}),
  routeRules: {
    "/astros-sw.js": {
      headers: {
        "cache-control": "no-store, max-age=0",
        "service-worker-allowed": "/",
        "content-type": "application/javascript; charset=utf-8",
      },
    },
    "/pwa/config.json": { headers: { "cache-control": "no-store, max-age=0" } },
    "/manifest.webmanifest": {
      headers: {
        "cache-control": "no-cache, max-age=0",
        "content-type": "application/manifest+json; charset=utf-8",
      },
    },
    "/pwa/offline.html": { headers: { "cache-control": "no-cache, max-age=0" } },
  },
};

export default defineConfig({
  nitro: pwaNitroOptions,
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
