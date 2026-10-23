import { readFileSync, writeFileSync } from "node:fs";
const source = readFileSync("supabase/functions/astros-status/index.ts", "utf8");
const entry = source.replace(
  /^import\s*\{\s*syncBetterStack\s*\}\s*from\s*["']\.\/betterstack\.ts["'];?\s*\n/m,
  "",
);
if (entry === source) throw Error("Expected explicit bridge import");
writeFileSync(
  "supabase/astros-status.deploy.ts",
  readFileSync("supabase/functions/astros-status/betterstack.ts", "utf8") + "\n" + entry,
);
