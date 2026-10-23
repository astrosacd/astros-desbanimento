const { PGlite } = require("@electric-sql/pglite");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema extensions;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
 create function public.astros_is_admin() returns boolean language sql as $$select current_setting('test.admin',true)='true'$$;
 create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$select decode(repeat('ab',n),'hex')$$;
 create table public.astros_module_settings(module text primary key,enabled boolean);insert into public.astros_module_settings values('sms',true);`);
  for (const file of [
    "20261022_service_status.sql",
    "20261023_betterstack_status.sql",
    "20261023_status_incident_communication.sql",
  ])
    await db.exec(readFileSync(join(__dirname, "../supabase/migrations", file), "utf8"));
  const migration = readFileSync(
    join(__dirname, "../supabase/migrations/20261023_status_incident_communication.sql"),
    "utf8",
  );
  const value = async (q, p) => (await db.query(q, p)).rows[0].value;
  const details = {
    phase: "identified",
    impact: "Novas ativações afetadas",
    nextUpdate: null,
    startsAt: null,
  };
  const save = (status, extra = details, expires = null) =>
    db.query("select astros_status_save_v2($1,$2,$3,$4,$5::jsonb)", [
      "sms",
      status,
      "Comunicado público de teste",
      expires,
      JSON.stringify(extra),
    ]);
  await db.exec("set test.admin='false'");
  await assert.rejects(save("unavailable"));
  await db.exec("set test.admin='true';set test.actor='11111111-1111-4111-8111-111111111111'");
  await db.exec(
    "update astros_status_components set automatic='operational',checked_at=now();update astros_status_bridge_private set last_success=now()",
  );
  await save("unavailable");
  const component = async () =>
    (await value("select astros_status_public() value")).components.find((c) => c.key === "sms");
  let c = await component();
  assert.equal(c.status, "unavailable");
  assert.match(c.message, /Causa identificada/);
  assert.match(c.message, /Novas ativações afetadas/);
  assert.match(c.message, /Brasília/);
  await db.exec(migration);
  assert.equal((await component()).status, "unavailable");
  assert.equal((await value("select astros_status_monitor_health() value")).checksFresh, true);
  assert.equal((await value("select astros_status_monitor_health() value")).syncFresh, true);
  await db.exec("update astros_status_components set checked_at=null where key='sms'");
  assert.equal((await value("select astros_status_monitor_health() value")).checksFresh, false);
  await db.exec(
    "update astros_status_components set checked_at=now();update astros_status_bridge_private set last_success=now()-interval '11 minutes'",
  );
  assert.equal((await value("select astros_status_monitor_health() value")).syncFresh, false);
  await save("operational", { ...details, phase: "resolved", nextUpdate: null });
  assert.equal((await component()).status, "operational");
  await save(null);
  assert.equal((await component()).source, "automatic");
  const start = new Date(Date.now() + 3600000).toISOString(),
    end = new Date(Date.now() + 7200000).toISOString();
  await save("maintenance", { ...details, startsAt: start }, end);
  c = await component();
  assert.equal(c.status, "operational");
  assert.equal(c.source, "automatic");
  assert.ok(c.scheduled);
  assert.match(c.scheduled.message, /Manutenção programada/);
  await assert.rejects(
    save(
      "maintenance",
      { ...details, startsAt: start },
      new Date(Date.now() + 1800000).toISOString(),
    ),
  );
  await assert.rejects(save("unavailable", { ...details, phase: "resolved" }));
  await assert.rejects(
    save("unavailable", { ...details, nextUpdate: new Date(Date.now() - 1000).toISOString() }),
  );
  await assert.rejects(save("unavailable", { ...details, token: "blocked" }));
  await db.exec(
    "update astros_status_components set starts_at=now()-interval '1 minute' where key='sms'",
  );
  assert.equal((await component()).status, "maintenance");
  await db.exec(
    "update astros_status_components set expires_at=now()-interval '1 second' where key='sms'",
  );
  assert.equal((await component()).status, "operational");
  await save("unavailable");
  await db.exec("update astros_module_settings set enabled=false where module='sms'");
  assert.equal((await component()).source, "module");
  assert.equal((await component()).status, "maintenance");
  await db.exec("set role authenticated;set test.admin='false'");
  await assert.rejects(
    db.query("select astros_status_save_v2($1,$2,$3,$4,$5::jsonb)", [
      "sms",
      "unavailable",
      "Não autorizado",
      null,
      JSON.stringify(details),
    ]),
  );
  await assert.rejects(db.query("select * from astros_status_notice_audit"));
  await assert.rejects(db.query("select astros_status_monitor_health()"));
  await db.exec("reset role");
  const projection = JSON.stringify(await value("select astros_status_public() value"));
  assert.doesNotMatch(projection, /worker_secret|updated_by|resource_id|report_id|api_key/);
  console.log(
    "Incident SQL checks passed: admin gate, save/resolve/reset, future maintenance, precedence, expiry, fresh monitor, RLS and public projection.",
  );
  await db.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
