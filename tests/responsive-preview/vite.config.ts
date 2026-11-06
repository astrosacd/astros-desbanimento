import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import ts from "typescript";
const local = (p: string) => fileURLToPath(new URL(p, import.meta.url));
// Isolate every server action before loading it. Production routes never import this fixture.
export default defineConfig({
  root: local("."),
  publicDir: local("../../public"),
  plugins: [
    {
      name: "responsive-isolation",
      enforce: "pre",
      async resolveId(source, importer) {
        if (!importer || source.startsWith("\0")) return;
        if (/(?:^|\/)(?:actions|auth)$/.test(source)) {
          const found = await this.resolve(source, importer, { skipSelf: true });
          if (found?.id.includes("/src/features/")) return "\0fixture-action:" + found.id;
        }
      },
      load(id) {
        if (!id.startsWith("\0fixture-action:")) return;
        const path = id.slice("\0fixture-action:".length);
        const tree = ts.createSourceFile(
          path,
          readFileSync(path, "utf8"),
          ts.ScriptTarget.Latest,
          true,
        );
        const names: string[] = [];
        for (const node of tree.statements) {
          if (
            !ts.canHaveModifiers(node) ||
            !ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
          )
            continue;
          if (ts.isVariableStatement(node))
            for (const d of node.declarationList.declarations)
              if (ts.isIdentifier(d.name)) names.push(d.name.text);
          if (ts.isFunctionDeclaration(node) && node.name) names.push(node.name.text);
        }
        return (
          `import {fixtureAction} from ${JSON.stringify(local("./data.ts"))};\n` +
          names
            .map((n) => `export const ${n}=(args)=>fixtureAction(${JSON.stringify(n)},args);`)
            .join("\n")
        );
      },
    },
    react(),
    tailwind(),
  ],
  resolve: { alias: { "@": local("../../src") } },
  server: { fs: { allow: [local("../..")] } },
});
