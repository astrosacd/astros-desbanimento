import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create table auth.users(id uuid primary key,email_confirmed_at timestamptz,banned_until timestamptz,raw_app_meta_data jsonb default '{}');
create table public.painel_de_desbanimento(id uuid primary key references auth.users(id),tipo_usuario text,recarga numeric(14,2),email text);
create table public.astros_wallet_movements(id uuid primary key default gen_random_uuid(),user_id uuid references painel_de_desbanimento(id),amount_cents bigint,kind text check(kind in ('credit','debit','reversal')),reference text,created_at timestamptz default now(),unique(kind,reference));
create function public.astros_is_admin() returns boolean language sql security definer as $$select exists(select 1 from public.painel_de_desbanimento where id=auth.uid() and tipo_usuario='admin')$$;
create table public.astros_payment_orders(user_id uuid,mp_payment_id text,live_mode boolean);
create table public.astros_service_jobs(state text,amount_cents integer,created_at timestamptz);
create table public.astros_sms_orders(state text,price_cents integer,estimated_cost_cents integer,created_at timestamptz);
create table public.astros_social_orders(state text,price_cents integer,refund_cents integer,actual_cost_units bigint,fx_units bigint,created_at timestamptz);
create table public.astros_prospect_requests(state text,charged_cents integer,delivered integer,created_at timestamptz);
create table public.astros_cnpj_requests(state text,charged_cents integer,delivered integer,created_at timestamptz);`);
const load = (n) => db.exec(readFileSync("supabase/migrations/" + n, "utf8"));
await load("20261024_affiliates_finance.sql");
await load("20261028_digital_research.sql");
await load("20261028_digital_research.sql");
const value = async (q, p = []) => (await db.query(q, p)).rows[0]?.v;
const call = (actor, operation, input = {}) =>
  value("select public.astros_digital_call($1,$2,$3) v", [actor, operation, input]);
const admin = randomUUID(),
  client = randomUUID(),
  other = randomUUID();
for (const id of [admin, client, other]) {
  await db.query("insert into auth.users(id,email_confirmed_at) values($1,now())", [id]);
  await db.query("insert into painel_de_desbanimento values($1,$2,100,$3)", [
    id,
    id === admin ? "admin" : "cliente",
    id + "@example.com",
  ]);
}
const balance = (id) =>
  value("select recarga::float8 v from painel_de_desbanimento where id=$1", [id]);
const rejection = async (fn, pattern) => {
  await assert.rejects(fn, pattern);
};
assert.equal((await call(client, "config")).enabled, false);
assert.equal(
  await value(
    "select has_function_privilege('authenticated','public.astros_digital_call(uuid,text,jsonb)','execute') v",
  ),
  false,
);
assert.equal(
  await value(
    "select has_table_privilege('authenticated','public.astros_digital_private','select') v",
  ),
  false,
);
assert.equal(
  await value(
    "select has_table_privilege('authenticated','public.astros_digital_requests','select') v",
  ),
  false,
);
await rejection(() => call(client, "admin-config"), /administrativo/);
let cfg = await call(admin, "admin-config");
const settings = {
  ...cfg,
  pilot: true,
  enabled: true,
  apiKey: "apify_api_" + "x".repeat(30),
  tools: Object.fromEntries(
    Object.entries(cfg.tools).map(([k, v]) => [
      k,
      { ...v, enabled: true, unitCents: 10, maxUsdCents: 20 },
    ]),
  ),
};
delete settings.installed;
delete settings.hasKey;
await rejection(() => call(admin, "admin-save", settings), /complemento financeiro/);
await load("20261028_digital_finance.sql");
await call(admin, "admin-save", settings);
cfg = await call(admin, "admin-config");
const job = (tool = "instagram_search", quantity = 10) => ({
  requestId: randomUUID(),
  tool,
  query: tool === "instagram_search" ? "dentistas Fortaleza" : "astros",
  quantity,
  unitCents: 10,
  version: cfg.version,
});
await rejection(() => call(client, "start", job()), /indisponíveis/);
const a = job();
const begun = await call(admin, "start", a);
assert.equal(begun.execute, true);
assert.equal(await balance(admin), 99);
assert.equal((await call(admin, "start", a)).execute, false);
assert.equal(await balance(admin), 99);
await rejection(() => call(client, "start", a), /divergente/);
await rejection(() => call(admin, "start", { ...a, query: "changed" }), /divergente/);
await rejection(() => call(admin, "start", job()), /anterior/);
assert.equal((await call(admin, "history")).rows.length, 1);
assert.equal((await call(other, "history")).rows.length, 0);
await rejection(() => call(other, "status", { id: a.requestId }), /não encontrada/);
await call(admin, "record-run", {
  id: a.requestId,
  runId: "RUN12345678901234",
  datasetId: "DATA1234567890123",
});
// Polling leases serialize even across repeated refreshes.
await db.query(
  "update astros_digital_requests set check_after=now()-interval '1 second' where id=$1",
  [a.requestId],
);
const lease = await call(admin, "check-claim", { id: a.requestId });
assert.ok(lease.lease);
assert.deepEqual(await call(admin, "check-claim", { id: a.requestId }), {});
await rejection(
  () => call(admin, "finish", { id: a.requestId, lease: randomUUID(), rows: [] }),
  /Conferência inválida/,
);
const profile = {
  username: "example",
  name: "Example",
  url: "https://www.instagram.com/example/",
  biography: "Bio",
  website: "",
  email: "",
  phone: "",
  followers: 10,
  following: 5,
  posts: 1,
  private: false,
  verified: false,
};
const finished = await call(admin, "finish", {
  id: a.requestId,
  lease: lease.lease,
  rows: [profile],
});
assert.equal(finished.charged_cents, 10);
assert.equal(finished.delivered, 1);
assert.equal(await balance(admin), 99.9);
await call(admin, "finish", { id: a.requestId, lease: lease.lease, rows: [] });
assert.equal(await balance(admin), 99.9);
assert.equal(
  await value(
    "select count(*)::int v from astros_wallet_movements where reference like 'digital-refund:%'",
  ),
  1,
);
assert.equal(finished.run_id, undefined);
assert.equal(finished.dataset_id, undefined);
assert.equal(finished.user_id, undefined);
await rejection(
  () => call(other, "save", { requestId: a.requestId, username: "example", collection: "Teste" }),
  /não encontrada/,
);
await call(admin, "save", { requestId: a.requestId, username: "example", collection: "Teste" });
await call(admin, "save", { requestId: a.requestId, username: "example", collection: "Teste" });
assert.equal((await call(admin, "collections")).rows.length, 1);
assert.equal((await call(other, "collections")).rows.length, 0);
const saved = (await call(admin, "collections")).rows[0];
await call(other, "unsave", { id: saved.id });
assert.equal((await call(admin, "collections")).rows.length, 1);
await call(admin, "unsave", { id: saved.id });
assert.equal((await call(admin, "collections")).rows.length, 0);
// Reapplication preserves saved activation/settings and wallet data.
await load("20261028_digital_research.sql");
assert.equal((await call(admin, "admin-config")).enabled, true);
assert.equal(await balance(admin), 99.9);
// Pilot off, individual block, definite pre-dispatch rejection, and no duplicate refunds.
settings.version = cfg.version;
settings.pilot = false;
settings.apiKey = "";
await call(admin, "admin-save", settings);
cfg = await call(admin, "admin-config");
await call(admin, "admin-access", { userId: client, enabled: false });
await rejection(() => call(client, "start", job()), /indisponíveis/);
await call(admin, "admin-access", { userId: client, enabled: true });
const b = job();
await call(client, "start", b);
assert.equal(await balance(client), 99);
await call(client, "reject", { id: b.requestId });
await call(client, "reject", { id: b.requestId });
assert.equal(await balance(client), 100);
// Uncertain dispatch holds reserve, never refunds or starts again; key rotation fails closed.
const c = job();
await call(client, "start", c);
await call(client, "review", { id: c.requestId });
await rejection(() => call(client, "start", job()), /anterior/);
assert.equal(await balance(client), 99);
await rejection(
  () =>
    call(admin, "admin-save", {
      ...settings,
      version: cfg.version,
      apiKey: "apify_api_" + "y".repeat(30),
    }),
  /pendentes/,
);
await rejection(() => call(admin, "start", job()), /Capacidade ocupada/);
settings.version = cfg.version;
settings.dailyRequests = 1;
settings.concurrency = 5;
await call(admin, "admin-save", settings);
cfg = await call(admin, "admin-config");
await rejection(() => call(admin, "start", job()), /Limite diário de pesquisas/);
settings.version = cfg.version;
settings.dailyRequests = 50;
settings.dailyUsdCents = 60;
await call(admin, "admin-save", settings);
cfg = await call(admin, "admin-config");
await rejection(() => call(other, "start", job()), /Limite diário do fornecedor/);
await db.query(
  "update auth.users set raw_app_meta_data='{\"astros_password_change_required\":true}' where id=$1",
  [other],
);
await rejection(() => call(other, "config"), /Conta indisponível/);
// Additive financial migration preserves old metrics while categorizing the new ledger.
await db.query("select set_config('test.actor',$1,false)", [admin]);
const dates = await db.query("select (now() at time zone 'America/Fortaleza')::date::text d");
const day = dates.rows[0].d;
await db.query(
  "insert into astros_wallet_movements(user_id,amount_cents,kind,reference) values($1,-200,'debit','prospect:legacy')",
  [admin],
);
await load("20261024_affiliates_finance.sql");
const before = await value("select astros_financial_dashboard($1,$1) v", [day]);
await load("20261028_digital_finance.sql");
const after = await value("select astros_financial_dashboard($1,$1) v", [day]);
for (const k of [
  "receivedCents",
  "paymentRefundsCents",
  "netReceiptsCents",
  "manualCreditsCents",
  "manualReversalsCents",
  "affiliate",
  "desban",
  "sms",
  "social",
  "prospect",
])
  assert.deepEqual(after[k], before[k], k);
assert.equal(after.digital.debitsCents, 300);
assert.equal(after.digital.refundsCents, 190);
assert.equal(after.digital.netCents, 110);
assert.equal(after.digital.completedSalesCents, 10);
assert.equal(after.digital.openCents, 100);
assert.equal(after.unclassifiedCount, 0);
assert.equal(after.daily[0].consumedCents, before.daily[0].consumedCents + 300);
assert.equal(after.daily[0].returnedCents, before.daily[0].returnedCents + 190);
assert.equal(await value("select count(*)::int v from astros_prospect_requests"), 0);
console.log(
  "PASS: isolated install/reapply, auth/role/ownership, pilot/access, stable UUID, budget/capacity guards, polling lease, exact settlement/refund, collections, finance compatibility.",
);
await db.close();
