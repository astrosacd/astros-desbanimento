import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const local = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  root: local("."),
  publicDir: local("../../public"),
  plugins: [
    {
      name: "isolated-digital-preview",
      enforce: "pre",
      resolveId(source, importer) {
        if (source === "./actions" && importer?.includes("/features/digital-research/"))
          return local("./mock-actions.ts");
        if (
          source === "../payments/balance-summary" &&
          importer?.includes("/features/digital-research/")
        )
          return local("./wallet.tsx");
      },
    },
    react(),
    tailwind(),
  ],
  resolve: { alias: { "@": local("../../src") } },
  server: { fs: { allow: [local("../..")] } },
});
