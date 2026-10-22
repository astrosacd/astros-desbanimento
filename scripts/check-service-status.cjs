const { PGlite } = require("@electric-sql/pglite");
const { readFileSync } = require("node:fs");
const assert = require("node:assert/strict");
(async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create schema extensions;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;create function public.astros_is_admin() returns boolean language sql as $$select current_setting('test.admin',true)='true'$$;create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$select decode(repeat('ab',n),'hex')$$;create table public.astros_module_settings(module text primary key,enabled boolean);insert into public.astros_module_settings values('sms',true);`,
  );
  const sql = readFileSync(
    require("node:path").join(__dirname, "../supabase/migrations/20261022_service_status.sql"),
    "utf8",
  );
  await db.exec(sql);
  await db.exec(sql);
  const scalar = async (q, p) => (await db.query(q, p)).rows[0].value;
  assert.equal((await scalar("select astros_status_public() value")).components.length, 7);
  assert.equal(
    (await scalar("select astros_status_public() value")).components.every(
      (c) => c.status === "unknown",
    ),
    true,
  );
  await db.exec("set test.admin='false'");
  await assert.rejects(
    db.query("select astros_status_save('sms','maintenance','Manutenção',null)"),
  );
  await db.exec("set test.admin='true';set test.actor='11111111-1111-4111-8111-111111111111'");
  await db.query("select astros_status_save('sms','operational','Aviso da equipe',null)");
  await db.exec("update astros_module_settings set enabled=false where module='sms'");
  assert.equal(
    (await scalar("select astros_status_public() value")).components.find((c) => c.key === "sms")
      .status,
    "maintenance",
  );
  await db.exec("update astros_module_settings set enabled=true where module='sms'");
  const keys = ["panel", "auth", "desbanimento", "sms", "social", "prospect_maps", "prospect_cnpj"];
  async function batch(result) {
    await db.exec("update astros_status_private set last_started=null");
    const token = await scalar("select astros_status_claim() value");
    assert.ok(token);
    assert.equal(await scalar("select astros_status_claim() value"), null);
    await db.query("select astros_status_finish($1,$2::jsonb)", [
      token,
      JSON.stringify(
        keys.map((key) => ({ key, result, diagnostic: result === "ok" ? "ok" : "unreachable" })),
      ),
    ]);
    await assert.rejects(db.query("select astros_status_finish($1,$2::jsonb)", [token, "[]"]));
  }
  await batch("ok");
  assert.equal(
    (await scalar("select astros_status_public() value")).components[0].status,
    "operational",
  );
  await batch("failed");
  await batch("failed");
  assert.equal(
    (await scalar("select astros_status_public() value")).components[0].status,
    "degraded",
  );
  await batch("failed");
  assert.equal(
    (await scalar("select astros_status_public() value")).components[0].status,
    "unavailable",
  );
  await batch("ok");
  assert.equal(
    (await scalar("select astros_status_public() value")).components[0].status,
    "degraded",
  );
  await batch("ok");
  assert.equal(
    (await scalar("select astros_status_public() value")).components[0].status,
    "operational",
  );
  await db.exec("update astros_status_components set checked_at=now()-interval '11 minutes'");
  const stale = await scalar("select astros_status_public() value");
  assert.equal(stale.components.find((c) => c.key === "sms").status, "operational");
  assert.equal(stale.components.find((c) => c.key === "panel").status, "unknown");
  await db.query("select astros_status_save('sms',null,'',null)");
  assert.equal(
    (await scalar("select astros_status_public() value")).components.find((c) => c.key === "sms")
      .status,
    "unknown",
  );
  await db.exec("set role anon");
  await assert.rejects(db.query("select * from astros_status_private"));
  await assert.rejects(db.query("select astros_status_public()"));
  await db.exec("reset role;set role authenticated");
  await assert.rejects(db.query("select astros_status_claim()"));
  await assert.rejects(db.query("select * from astros_status_components"));
  await db.exec("reset role");
  console.log(
    "SQL integration passed: idempotent install, role isolation, global/manual priority, lease, three failures, two recoveries, stale samples.",
  );
  await db.close();
})();
