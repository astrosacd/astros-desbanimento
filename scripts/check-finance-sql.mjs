import fs from 'node:fs';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env['ASTROS_PGLITE_MODULE']??'@electric-sql/pglite');const db=new PGlite();
await db.exec(`create role anon;create role authenticated;
create table painel_de_desbanimento(id uuid primary key,recarga numeric);
create table astros_sms_settings(id boolean primary key,usd_brl_units bigint);
create table astros_sms_orders(id uuid primary key,usd_units bigint,price_cents bigint,state text,created_at timestamptz);
create table astros_wallet_movements(id uuid primary key default gen_random_uuid(),user_id uuid,amount_cents bigint,reference text,kind text,created_at timestamptz);
create table astros_payment_orders(id uuid primary key default gen_random_uuid(),user_id uuid,mp_payment_id text,live_mode boolean);
create table astros_service_jobs(id uuid primary key default gen_random_uuid(),amount_cents bigint,state text,created_at timestamptz);
create function astros_is_admin() returns boolean language sql as $$select current_setting('test.admin',true)='yes'$$;
insert into astros_sms_settings values(true,55338);
insert into painel_de_desbanimento values('00000000-0000-4000-8000-000000000001',32.47),('00000000-0000-4000-8000-000000000002',10);`);
const migration=fs.readFileSync(new URL('../supabase/migrations/20261015_financial_dashboard.sql',import.meta.url),'utf8');await db.exec(migration);
// Prove missing role setting is denied (including a null result), then explicit client is denied.
await assert.rejects(db.query("select astros_financial_dashboard('2026-10-14','2026-10-14')"));
await db.exec("set test.admin='no';set role authenticated");await assert.rejects(db.query("select astros_financial_dashboard('2026-10-14','2026-10-14')"));await db.exec('reset role');
await db.exec(`set test.admin='yes';
insert into astros_payment_orders(user_id,mp_payment_id,live_mode) values('00000000-0000-4000-8000-000000000001','pay1',true),('00000000-0000-4000-8000-000000000001','pay2',true),('00000000-0000-4000-8000-000000000001','test1',false);
insert into astros_wallet_movements(user_id,amount_cents,reference,kind,created_at) values
('00000000-0000-4000-8000-000000000001',5000,'pay1','credit','2026-10-14T03:00:00Z'),
('00000000-0000-4000-8000-000000000001',1000,'pay2','credit','2026-10-14T04:00:00Z'),
('00000000-0000-4000-8000-000000000001',-400,'pay2:400','reversal','2026-10-14T05:00:00Z'),
('00000000-0000-4000-8000-000000000001',700,'test1','credit','2026-10-14T05:00:00Z'),
('00000000-0000-4000-8000-000000000001',2000,'manual:import1','credit','2026-10-14T06:00:00Z'),
('00000000-0000-4000-8000-000000000001',-500,'manual-reversal:import1','reversal','2026-10-14T06:00:00Z'),
('00000000-0000-4000-8000-000000000001',-500,'service:job1','debit','2026-10-14T07:00:00Z'),
('00000000-0000-4000-8000-000000000001',500,'service:job1','reversal','2026-10-14T08:00:00Z'),
('00000000-0000-4000-8000-000000000001',-1753,'sms:order1','debit','2026-10-14T09:00:00Z'),
('00000000-0000-4000-8000-000000000001',-1000,'sms:order2','debit','2026-10-14T09:00:00Z'),
('00000000-0000-4000-8000-000000000001',1000,'sms-refund:order2','credit','2026-10-14T10:00:00Z'),
('00000000-0000-4000-8000-000000000001',9000,'pay1','credit','2026-10-14T02:59:59Z'),
('00000000-0000-4000-8000-000000000001',9000,'pay1','credit','2026-10-15T03:00:00Z');
insert into astros_service_jobs(amount_cents,state,created_at) values(500,'completed','2026-10-14T09:00:00Z'),(0,'completed','2026-10-14T09:00:00Z'),(500,'review','2026-10-14T09:00:00Z');
insert into astros_sms_orders values('10000000-0000-4000-8000-000000000001',1990000,1753,'received','2026-10-14T09:00:00Z',null),('10000000-0000-4000-8000-000000000002',1000000,1000,'refunded','2026-10-14T09:00:00Z',null);
update astros_sms_settings set usd_brl_units=60000;
insert into astros_sms_orders values('10000000-0000-4000-8000-000000000003',1000000,1000,'review','2026-10-14T09:00:00Z',null);
insert into astros_sms_orders values('10000000-0000-4000-8000-000000000004',1000000,1000,'received','2026-10-14T09:00:00Z',null);
update astros_sms_orders set estimated_cost_cents=null where id='10000000-0000-4000-8000-000000000004';`);
const r=(await db.query("select astros_financial_dashboard('2026-10-14','2026-10-14') r")).rows[0].r;
assert.equal(r.receivedCents,6000);assert.equal(r.paymentRefundsCents,400);assert.equal(r.netReceiptsCents,5600);assert.equal(r.manualCreditsCents,2000);assert.equal(r.manualReversalsCents,500);assert.equal(r.currentBalanceCents,4247);assert.equal(r.unclassifiedCount,1);
assert.deepEqual(r.desban,{debitsCents:500,refundsCents:500,netCents:0,paidCount:1,freeCount:1,completedSalesCents:500,openCents:500});
assert.equal(r.sms.netCents,1753);assert.equal(r.sms.knownCostCents,1102);assert.equal(r.sms.knownGainCents,651);assert.equal(r.sms.missingCostCount,1);assert.equal(r.sms.openCents,1000);assert.equal(r.daily.length,1);assert.equal(r.daily[0].receivedCents,6000);assert.equal(r.daily[0].consumedCents,3253);assert.equal(r.daily[0].returnedCents,1500);
await assert.rejects(db.query("select astros_financial_dashboard('2026-10-14','2026-10-13')"));await assert.rejects(db.query("select astros_financial_dashboard('2020-01-01','2026-10-14')"));
const empty=(await db.query("select astros_financial_dashboard('2026-01-01','2026-01-03') r")).rows[0].r;assert.equal(empty.receivedCents,0);assert.equal(empty.daily.length,3);
await db.exec(migration);assert.equal((await db.query("select estimated_cost_cents from astros_sms_orders where id='10000000-0000-4000-8000-000000000004'")).rows[0].estimated_cost_cents,null);
await db.exec('set role anon');await assert.rejects(db.query("select astros_financial_dashboard('2026-10-14','2026-10-14')"));await db.exec('reset role');
console.log('PASS: admin-only RPC, null role denied, real credits only, separate manual credits, both refund types, Fortaleza boundaries, no recharge/consumption double count, immutable cost snapshot, missing historical cost, date limits, zero-filled daily series and repeatable migration.');await db.close();
