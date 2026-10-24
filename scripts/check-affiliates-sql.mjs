import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import assert from "node:assert/strict";
const db = new PGlite({ extensions: { pgcrypto } }),
  id = randomUUID;
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema extensions;create extension pgcrypto with schema extensions;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
create table painel_de_desbanimento(id uuid primary key references auth.users(id),tipo_usuario text,nome text,email text,recarga numeric(14,2) default 0);
create function astros_is_admin() returns boolean language sql security definer as $$select exists(select 1 from public.painel_de_desbanimento where id=auth.uid() and tipo_usuario='admin')$$;
create table astros_legacy_client_imports(id uuid primary key,email text,admin_id uuid,state text);
create table astros_panel_address(id boolean primary key,origin text);insert into astros_panel_address values(true,'https://mais.astroscomunicacaodigital.com');
create function test_profile() returns trigger language plpgsql security definer as $$begin insert into painel_de_desbanimento(id,tipo_usuario,nome,email) values(new.id,'cliente',new.raw_user_meta_data->>'nome',new.email);return new;end$$;
create trigger astros_profile_after_signup after insert on auth.users for each row execute function test_profile();`);
const load = (n) => db.exec(readFileSync("supabase/migrations/" + n, "utf8"));
await load("20261011_payments.sql");
await load("20261023_signup_protection.sql");
await load("20261024_affiliates.sql");
const value = async (q, p = []) => (await db.query(q, p)).rows[0]?.v;
const create = async (email, code = null, confirmed = true) => {
  const uid = id();
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,$3,$4)",
    [
      uid,
      email,
      confirmed ? new Date().toISOString() : null,
      { nome: "Conta Teste", ...(code ? { astros_referral_code: code } : {}) },
    ],
  );
  return uid;
};
const admin = await create("admin@example.com"),
  a = await create("a@example.com");
await db.query("update painel_de_desbanimento set tipo_usuario='admin' where id=$1", [admin]);
const actor = (who) => db.query("select set_config('test.actor',$1,false)", [who]);
await actor(a);
assert.equal((await value("select astros_affiliate_overview() v")).enabled, false);
const acode = await value("select code v from astros_affiliate_accounts where user_id=$1", [a]);
const old = await create("old@example.com", acode);
assert.equal(await value("select count(*)::int v from astros_affiliate_referrals"), 0);
await actor(admin);
await db.exec("update astros_affiliate_settings set worker_at=now()");
await value("select astros_affiliate_admin_config(null,$1) v", [
  { enabled: true, rateBps: 500, minimumCents: 0, maximumCents: 0 },
]);
const b = await create("b@example.com", acode);
await actor(b);
const bcode = (await value("select astros_affiliate_overview() v")).code;
const c = await create("c@example.com", bcode);
await actor(admin);
await value("select astros_affiliate_admin_config($1,$2) v", [b, { customRateBps: 1000 }]);
await db.query(
  "update auth.users set raw_user_meta_data=jsonb_build_object('astros_referral_code',$2::text) where id=$1",
  [old, acode],
);
assert.equal(
  await value("select count(*)::int v from astros_affiliate_referrals where user_id=$1", [old]),
  0,
);
const order = async (user, amount = 10000, live = true) => {
  const oid = id();
  await db.query(
    "insert into astros_payment_orders(id,user_id,amount_cents,method,live_mode) values($1,$2,$3,'pix',$4)",
    [oid, user, amount, live],
  );
  return oid;
};
const balance = (user) =>
  value("select round(recarga*100)::int v from painel_de_desbanimento where id=$1", [user]);
const apply = (oid, payment, status = "approved", amount = 10000, refund = 0) =>
  db.query("select astros_apply_payment($1,$2,$3,$4,$5)", [oid, payment, status, amount, refund]);
const process = (oid) => value("select astros_affiliate_process_order($1) v", [oid]);
const ob = await order(b),
  oc = await order(c);
assert.equal(await balance(a), 0);
await apply(ob, "10001");
assert.equal(await balance(b), 10000);
assert.equal(await balance(a), 0); // base recharge independent of worker
await process(ob);
await process(ob);
assert.equal(await balance(a), 500);
await apply(oc, "10002");
await process(oc);
assert.equal(await balance(b), 11000);
assert.equal(await balance(a), 500); // no second level
await apply(ob, "10001");
await process(ob);
assert.equal(await balance(a), 500); // duplicate notification
// Current percentage changes never rewrite frozen rules.
await actor(admin);
await value("select astros_affiliate_admin_config(null,$1) v", [
  { enabled: true, rateBps: 2000, minimumCents: 0, maximumCents: 0 },
]);
assert.equal(
  await value("select rate_bps v from astros_affiliate_commissions where order_id=$1", [ob]),
  500,
);
// Spent commission: proportional reversal, pending projection, later recharge compensation, no duplicate reversal.
await db.query("select astros_debit_wallet($1,500,'service:test')", [a]);
assert.equal(await balance(a), 0);
await apply(ob, "10001", "approved", 10000, 4000);
await process(ob);
assert.equal(await balance(a), -200);
await actor(a);
let view = await value("select astros_affiliate_overview() v");
assert.equal(view.availableCents, 0);
assert.equal(view.adjustmentCents, 200);
assert.equal(view.events[0].kind, "refund");
await apply(ob, "10001", "approved", 10000, 4000);
await process(ob);
assert.equal(await balance(a), -200);
const oa = await order(a, 5000);
await apply(oa, "10003", "approved", 5000);
assert.equal(await balance(a), 4800);
view = await value("select astros_affiliate_overview() v");
assert.equal(view.adjustmentCents, 0);
assert.ok(view.events.some((e) => e.kind === "compensation" && e.amountCents === 200));
// Pause prevents new eligible snapshots but cannot stop reversals of granted commissions.
await actor(admin);
await value("select astros_affiliate_admin_config(null,$1) v", [
  { enabled: false, rateBps: 2000, minimumCents: 0, maximumCents: 0 },
]);
const paused = await order(b);
assert.equal(
  await value("select count(*)::int v from astros_affiliate_commissions where order_id=$1", [
    paused,
  ]),
  0,
);
await apply(ob, "10001", "refunded");
await process(ob);
assert.equal(await balance(a), 4500);
await apply(ob, "10001", "approved");
await process(ob);
assert.equal(await balance(a), 4500); // stale approval cannot restore commission
// Provider test, manual credit, service refunds never trigger commissions.
const test = await order(b, 10000, false);
assert.equal(
  await value("select count(*)::int v from astros_affiliate_commissions where order_id=$1", [test]),
  0,
);
await db.query(
  "insert into astros_wallet_movements(user_id,amount_cents,kind,reference) values($1,1000,'credit','manual:test'),($1,1000,'credit','sms-refund:test')",
  [b],
);
assert.equal(await value("select count(*)::int v from astros_affiliate_commissions"), 2); // only b and c have a referrer
// Global min/max, custom 0 vs inherit, no backfill and unconfirmed sponsor.
await value("select astros_affiliate_admin_config(null,$1) v", [
  { enabled: true, rateBps: 500, minimumCents: 1000, maximumCents: 20000 },
]);
for (const amount of [500, 30000]) {
  const x = await order(b, amount);
  assert.equal(
    await value("select count(*)::int v from astros_affiliate_commissions where order_id=$1", [x]),
    0,
  );
}
await value("select astros_affiliate_admin_config($1,$2) v", [a, { customRateBps: 0 }]);
const zero = await order(b);
assert.equal(
  await value("select count(*)::int v from astros_affiliate_commissions where order_id=$1", [zero]),
  0,
);
await value("select astros_affiliate_admin_config($1,$2) v", [a, { customRateBps: null }]);
const inherited = await order(b);
assert.equal(
  await value("select rate_bps v from astros_affiliate_commissions where order_id=$1", [inherited]),
  500,
);
// Isolated confirmed chargeback and full refund before the first worker pass.
await db.exec("begin");
const originalBalance = await balance(a);
const lateRefund = await order(b);
await apply(lateRefund, "88001");
await apply(lateRefund, "88001", "refunded");
await process(lateRefund);
await process(lateRefund);
assert.equal(await balance(a), originalBalance);
assert.equal(
  await value("select reversed_cents::int v from astros_affiliate_commissions where order_id=$1", [
    lateRefund,
  ]),
  500,
);
const chargeback = await order(b);
await apply(chargeback, "88002");
await process(chargeback);
assert.equal(await balance(a), originalBalance + 500);
await apply(chargeback, "88002", "charged_back");
await process(chargeback);
await process(chargeback);
assert.equal(await balance(a), originalBalance);
await db.exec("rollback");
// Forged approved status alone never pays.
await db.query(
  "update astros_payment_orders set status='approved',mp_payment_id='99999' where id=$1",
  [inherited],
);
await process(inherited);
assert.equal(await balance(a), 4500);
const unconfirmed = await create("unconfirmed@example.com", null, false);
await db.query("insert into astros_affiliate_accounts(user_id) values($1)", [unconfirmed]);
const ucode = await value("select code v from astros_affiliate_accounts where user_id=$1", [
  unconfirmed,
]);
const noSponsor = await create("nosponsor@example.com", ucode);
assert.equal(
  await value("select count(*)::int v from astros_affiliate_referrals where user_id=$1", [
    noSponsor,
  ]),
  0,
);
// Native and custom-mail admin.createUser both use the same existing CAPTCHA INSERT guard.
await db.exec("update astros_signup_settings set enabled=true,site_key='test-production-sitekey'");
await assert.rejects(create("captcha-bypass@example.com", acode), /verificação/);
const ticket = randomBytes(32).toString("hex"),
  email = "guarded@example.com";
await value("select astros_signup_issue_permit($1,$2) v", [
  createHash("sha256").update(ticket).digest("hex"),
  email,
]);
const guarded = id();
await db.query(
  "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
  [guarded, email, { astros_signup_permit: ticket, astros_referral_code: acode }],
);
assert.equal(
  await value("select referrer_id v from astros_affiliate_referrals where user_id=$1", [guarded]),
  a,
);
// Access boundaries: own projection only, no private table reads/mutations, no worker RPC.
await actor(b);
await db.exec("set role authenticated");
await assert.rejects(value("select astros_affiliate_overview($1) v", [a]), /não autorizado/);
await assert.rejects(value("select astros_affiliate_admin_config() v"), /administrativo/);
await assert.rejects(process(ob), /permission denied/);
for (const table of [
  "astros_affiliate_referrals",
  "astros_affiliate_private",
  "astros_affiliate_commissions",
  "astros_affiliate_events",
])
  await assert.rejects(db.exec("select * from " + table), /permission denied/);
assert.equal((await value("select astros_affiliate_overview() v")).code, bcode);
await db.exec("reset role");
await load("20261024_affiliates.sql");
assert.equal(await value("select enabled v from astros_affiliate_settings"), true);
assert.equal(await balance(a), 4500);
assert.equal(
  await value("select referrer_id v from astros_affiliate_referrals where user_id=$1", [b]),
  a,
);
// Finance keeps commissions out of cash receipts and service consumption.
await db.exec(`create table astros_service_jobs(amount_cents bigint,state text,created_at timestamptz);
create table astros_sms_orders(state text,price_cents bigint,estimated_cost_cents bigint,created_at timestamptz);
create table astros_social_orders(state text,price_cents bigint,refund_cents bigint,actual_cost_units bigint,fx_units bigint,created_at timestamptz);
create table astros_prospect_requests(state text,charged_cents bigint,delivered integer,created_at timestamptz);
create table astros_cnpj_requests(state text,charged_cents bigint,delivered integer,created_at timestamptz);`);
await load("20261024_affiliates_finance.sql");
await actor(admin);
const report = await value(
  "select astros_financial_dashboard((now() at time zone 'America/Fortaleza')::date,(now() at time zone 'America/Fortaleza')::date) v",
);
assert.equal(report.receivedCents, 25000);
assert.equal(report.paymentRefundsCents, 10000);
assert.deepEqual(report.affiliate, { creditedCents: 1500, reversedCents: 500, netCents: 1000 });
assert.equal(report.unclassifiedCount, 0);
await load("20261024_affiliates_finance.sql");
console.log(
  "PASS: staged install, direct-only attribution, auth metadata updates denied as attribution, CAPTCHA coexistence, unchanged base recharge, snapshot percentages, duplicate events, partial/full refunds, spent commission/compensation audit, paused reversals, test/manual/service exclusions, eligibility limits, permissions and reapply.",
);
await db.close();
