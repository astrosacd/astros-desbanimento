import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`create role anon;create role authenticated;create role service_role;create role supabase_auth_admin;create schema auth;create schema extensions;create extension pgcrypto with schema extensions;
create table auth.users(id uuid primary key default gen_random_uuid(),email text unique,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
create table painel_de_desbanimento(id uuid primary key,tipo_usuario text,recarga numeric default 100);
create table astros_legacy_client_imports(id uuid primary key,email text,admin_id uuid,state text);`);
const sql = readFileSync("supabase/migrations/20261023_signup_protection.sql", "utf8");
await db.exec(sql);
const value = async (q, args = []) => (await db.query(q, args)).rows[0].v;
const insert = (email, metadata = {}, app = {}) =>
  db.query("insert into auth.users(email,raw_user_meta_data,raw_app_meta_data) values($1,$2,$3)", [
    email,
    metadata,
    app,
  ]);
await insert("existing@example.com"); // inactive installation leaves legacy signup working
await db.exec("update astros_signup_settings set enabled=true,site_key='production-site-key'");
await assert.rejects(insert("bot@example.com"), /verificação/);
await assert.rejects(
  insert("bot@example.com", { astros_signup_permit: "a".repeat(64), admin: true }),
  /verificação/,
);
const permit = async (email) => {
  const token = randomBytes(32).toString("hex");
  assert.equal(
    await value("select astros_signup_issue_permit($1,$2) v", [
      createHash("sha256").update(token).digest("hex"),
      email,
    ]),
    true,
  );
  return { astros_signup_permit: token };
};
// The real Auth database role can invoke the trigger without any direct private-table grants.
await db.exec("grant usage on schema auth to supabase_auth_admin;grant insert,select on auth.users to supabase_auth_admin");
const rolePermit = await permit('role@example.com');
await db.exec('set role supabase_auth_admin');
await assert.rejects(insert('role-bot@example.com'), /verificação/);
await insert('role@example.com', rolePermit);
await db.exec('reset role');
const ticket = await permit("new@example.com");
await assert.rejects(insert("other@example.com", ticket), /verificação/);
await insert("new@example.com", { ...ticket, nome: "Maria Costa" });
assert.equal(
  await value(
    "select raw_user_meta_data ? 'astros_signup_permit' v from auth.users where email='new@example.com'",
  ),
  false,
);
assert.equal(
  await value("select raw_user_meta_data->>'nome' v from auth.users where email='new@example.com'"),
  "Maria Costa",
);
// Consumed ticket cannot be reused even if an account was removed.
await db.exec("delete from auth.users where email='new@example.com'");
await assert.rejects(insert("new@example.com", ticket), /verificação/);
const expired = await permit("expired@example.com");
await db.exec(
  "update astros_signup_permits set expires_at=now()-interval '1 minute' where consumed_at is null",
);
await assert.rejects(insert("expired@example.com", expired), /verificação/);
// A failed Auth insert rolls back consumption atomically: no lost ticket after database errors.
const duplicate = await permit("existing@example.com");
await assert.rejects(insert("existing@example.com", duplicate), /unique/);
await db.exec("delete from auth.users where email='existing@example.com'");
await insert("existing@example.com", duplicate);
// Five attempts per rolling 15 minutes, independent IPs, rolling hour and IPv6 /64.
const allow = (ip) => value("select astros_signup_allow_ip($1::inet) v", [ip]);
for (let i = 0; i < 5; i++) assert.equal(await allow("198.51.100.1"), true);
assert.equal(await allow("198.51.100.1"), false);
assert.equal(await allow("198.51.100.2"), true);
await db.exec("update astros_signup_attempts set attempted_at=now()-interval '16 minutes'");
for (let i = 0; i < 15; i++) {
  if (i > 0 && i % 5 === 0)
    await db.exec("update astros_signup_attempts set attempted_at=now()-interval '16 minutes'");
  assert.equal(await allow("198.51.100.1"), true);
}
await db.exec("update astros_signup_attempts set attempted_at=now()-interval '16 minutes'");
assert.equal(await allow("198.51.100.1"), false);
for (let i = 0; i < 5; i++) assert.equal(await allow(`2001:db8:1:1::${i + 1}`), true);
assert.equal(await allow("2001:db8:1:1::99"), false);
assert.equal(await allow("2001:db8:1:2::1"), true);
assert.equal(
  await value(
    "select bool_and(length(ip_hash)=64 and ip_hash !~ '[:.]') v from astros_signup_attempts",
  ),
  true,
);
// Trusted import remains available; user-editable import metadata cannot bypass the guard.
const admin = randomUUID(),
  job = randomUUID();
await db.query("insert into painel_de_desbanimento(id,tipo_usuario) values($1,'admin')", [admin]);
await db.query(
  "insert into astros_legacy_client_imports values($1,'import@example.com',$2,'pending')",
  [job, admin],
);
await assert.rejects(insert("import@example.com", { astros_legacy_import: job }), /verificação/);
await assert.rejects(insert("wrong@example.com", {}, { astros_legacy_import: job }), /verificação/);
await insert("import@example.com", {}, { astros_legacy_import: job });
await db.query("update astros_legacy_client_imports set state='completed' where id=$1", [job]);
await db.exec("delete from auth.users where email='import@example.com'");
await assert.rejects(
  insert("import@example.com", {}, { astros_legacy_import: job }),
  /verificação/,
);
// Update/login/recovery operations and wallets are untouched.
await db.exec("update auth.users set raw_user_meta_data='{}' where email='existing@example.com'");
assert.equal(Number(await value("select recarga v from painel_de_desbanimento limit 1")), 100);
await db.exec(sql); // reapply preserves activated settings and salt
assert.equal((await value("select astros_signup_public_config() v")).enabled, true);
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  assert.deepEqual(Object.keys(await value("select astros_signup_public_config() v")).sort(), [
    "enabled",
    "siteKey",
  ]);
  for (const q of [
    "select * from astros_signup_settings",
    "select * from astros_signup_permits",
    "select astros_signup_allow_ip('198.51.100.1')",
    "select astros_signup_issue_permit('a','x@example.com')",
  ])
    await assert.rejects(db.exec(q), /permission denied/);
  await db.exec("reset role");
}
await db.exec("update astros_signup_settings set enabled=false");
await insert("rollback@example.com");
console.log(
  "PASS: inactive install, API bypass denied, single-use/email/expiry/rollback, rolling IP limits, IPv6 grouping, private IP hashes, trusted import, unchanged wallets and existing users, grants and reapply.",
);
await db.close();
