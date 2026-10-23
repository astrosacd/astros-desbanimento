const { PGlite } = require("@electric-sql/pglite");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create schema extensions;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;create function public.astros_is_admin() returns boolean language sql as $$select current_setting('test.admin',true)='true'$$;create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$select decode(repeat('ab',n),'hex')$$;create table public.astros_module_settings(module text primary key,enabled boolean);insert into public.astros_module_settings values('sms',true);`,
  );
  await db.exec(
    readFileSync(join(__dirname, "../supabase/migrations/20261022_service_status.sql"), "utf8"),
  );
  const sql = readFileSync(
    join(__dirname, "../supabase/migrations/20261023_betterstack_status.sql"),
    "utf8",
  );
  await db.exec(sql);
  await db.exec(sql);
  const scalar = async (q, p) => (await db.query(q, p)).rows[0].value;
  await db.exec("set test.admin='false'");
  await assert.rejects(db.query("select astros_status_admin()"));
  const batch = await scalar("select astros_status_bridge_claim() value");
  assert.ok(batch.lease);
  assert.equal(batch.pageId, "268731");
  assert.equal(batch.items.length, 7);
  assert.equal(await scalar("select astros_status_bridge_claim() value"), null);
  await db.query("select astros_status_bridge_checkpoint($1,$2,$3::jsonb)", [
    batch.lease,
    "sms",
    JSON.stringify({
      resource_id: "103",
      title: "SMS report",
      pending: true,
      report_type: "manual",
    }),
  ]);
  await assert.rejects(
    db.query("select astros_status_bridge_checkpoint($1,$2,$3::jsonb)", [
      batch.lease,
      "sms",
      JSON.stringify({ token: "never accepted" }),
    ]),
  );
  await assert.rejects(
    db.query("select astros_status_bridge_checkpoint($1,$2,$3::jsonb)", [
      batch.lease,
      "sms",
      JSON.stringify({ resource_id: "https://evil.test" }),
    ]),
  );
  await db.query("select astros_status_bridge_finish($1,$2)", [batch.lease, "api_unavailable"]);
  await assert.rejects(db.query("select astros_status_bridge_finish($1,$2)", [batch.lease, "ok"]));
  await db.exec("update astros_status_bridge_private set last_started=null");
  const resumed = await scalar("select astros_status_bridge_claim() value");
  assert.equal(resumed.items.find((i) => i.component === "sms").pending, true);
  await db.query("select astros_status_bridge_checkpoint($1,$2,$3::jsonb)", [
    resumed.lease,
    "sms",
    JSON.stringify({
      report_id: "200",
      pending: false,
      fingerprint: "a".repeat(64),
      diagnostic: "ok",
      synced: true,
    }),
  ]);
  await db.exec("set test.admin='true';set test.actor='11111111-1111-4111-8111-111111111111'");
  const admin = await scalar("select astros_status_admin() value");
  assert.equal(admin.bridge.items.length, 7);
  assert.equal(JSON.stringify(admin.bridge).includes("SMS report"), false);
  assert.equal(JSON.stringify(admin.bridge).includes("resource_id"), false);
  assert.equal(admin.bridge.diagnostic, "api_unavailable");
  await db.query("select astros_status_bridge_finish($1,$2)", [resumed.lease, "ok"]);
  assert.ok((await scalar("select astros_status_admin() value")).bridge.lastSuccess);
  await db.exec("update astros_status_bridge_private set last_started=null");
  const expiring = await scalar("select astros_status_bridge_claim() value");
  await db.exec("update astros_status_bridge_private set lease_until=now()-interval '1 minute'");
  await assert.rejects(
    db.query("select astros_status_bridge_checkpoint($1,$2,$3::jsonb)", [
      expiring.lease,
      "sms",
      "{}",
    ]),
  );
  const pub = await scalar("select astros_status_public() value");
  assert.equal(JSON.stringify(pub).includes("bridge"), false);
  assert.equal(JSON.stringify(pub).includes("report_id"), false);
  await db.exec("set role anon");
  await assert.rejects(db.query("select * from astros_status_bridge_private"));
  await assert.rejects(db.query("select astros_status_bridge_claim()"));
  await db.exec("reset role;set role authenticated");
  await assert.rejects(db.query("select * from astros_status_bridge_items"));
  await assert.rejects(db.query("select astros_status_bridge_claim()"));
  await db.exec("reset role");
  await db.exec(sql);
  assert.equal(
    await scalar("select report_id value from astros_status_bridge_items where component='sms'"),
    "200",
  );
  console.log(
    "Better Stack SQL passed: additive install, reapply preserves mappings/pending reports, exclusive lease/expiry, private permissions, admin-only diagnostics and no public sync internals.",
  );
  await db.close();
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
