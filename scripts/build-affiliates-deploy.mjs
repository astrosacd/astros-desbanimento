import { readFileSync, writeFileSync } from "node:fs";
for (const name of ["astros-affiliates", "astros-auth-email"]) {
  writeFileSync(
    `supabase/${name}.deploy.ts`,
    readFileSync(`supabase/functions/${name}/index.ts`, "utf8"),
  );
}
