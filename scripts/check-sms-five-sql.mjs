import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const db=new PGlite(),id=randomUUID,admin=id(),user=id(),other=id();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.painel_de_desbanimento(id uuid primary key references auth.users(id),tipo_usuario text,recarga numeric(14,2));
create function public.astros_is_admin() returns boolean language sql security definer as $$select exists(select 1 from public.painel_de_desbanimento where id=auth.uid() and tipo_usuario='admin')$$;
create table public.astros_wallet_movements(id uuid primary key default gen_random_uuid(),user_id uuid references public.painel_de_desbanimento(id),amount_cents bigint,kind text,reference text,unique(kind,reference));`);
const load=async name=>db.exec(fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
await load('20261014_sms_activations.sql');await load('20261014_sms_auto_fx.sql');
// Install the real cost trigger without the unrelated dashboard dependencies.
const financial=fs.readFileSync(new URL('../supabase/migrations/20261015_financial_dashboard.sql',import.meta.url),'utf8');await db.exec(financial.slice(financial.indexOf('alter table'),financial.indexOf('create index')));
for(const x of [admin,user,other]){await db.query('insert into auth.users values($1)',[x]);await db.query('insert into painel_de_desbanimento values($1,$2,100)',[x,x===admin?'admin':'cliente']);}
await db.exec('update astros_sms_settings set worker_at=now()');
await db.query("select astros_sms_configure($1,true,55000,0,0,'smspool-test-only-123456')",[admin]);
const balance=async()=>Number((await db.query('select recarga from painel_de_desbanimento where id=$1',[user])).rows[0].recarga);
async function quote(supplier='smspool'){
 const five=supplier==='five_sim';return(await db.query(`insert into astros_sms_quotes(user_id,service_id,country_id,pool_id,service_name,country_name,usd_units,price_cents,settings_version${five?',supplier,supplier_product,supplier_country,native_units,native_brl_units':''}) select $1,${five?0:1},${five?0:1},${five?0:7},'WhatsApp','Brasil',${five?0:1000000},${five?150:550},updated_at${five?",'five_sim','whatsapp','brazil',10000000,1000":''} from astros_sms_settings returning id`,[user])).rows[0].id;
}
const oldQuote=await quote(),oldOrder=id();await db.query('select astros_sms_reserve($1,$2,$3)',[user,oldOrder,oldQuote]);
await db.query("select astros_sms_settle($1,'pending','123','5511999999999',null,now())",[oldOrder]);
await load('20261021_sms_five_sim.sql');
assert.equal((await db.query('select supplier from astros_sms_orders where id=$1',[oldOrder])).rows[0].supplier,'smspool');
assert.equal((await db.query('select active_supplier from astros_sms_settings')).rows[0].active_supplier,'smspool');
await assert.rejects(db.query("select astros_sms_configure_five($1,1000,5000,0,'five-sim-test-key-123456')",[user]),/não autorizado/);
await assert.rejects(db.query("select astros_sms_select_supplier($1,'five_sim',true)",[admin]),/Configure/);
await db.query("select astros_sms_configure_five($1,1000,5000,0,'five-sim-test-key-123456')",[admin]);
const stale=await quote();await db.query("select astros_sms_select_supplier($1,'five_sim',true)",[admin]);
await assert.rejects(db.query('select astros_sms_reserve($1,$2,$3)',[user,id(),stale]),/Atualize/);
await assert.rejects(quote(),/Atualize/);
const q=await quote('five_sim'),r=id(),before=await balance();
assert.equal((await db.query('select astros_sms_reserve($1,$2,$3) r',[user,r,q])).rows[0].r.dispatch,true);
assert.equal((await db.query('select astros_sms_reserve($1,$2,$3) r',[user,r,q])).rows[0].r.dispatch,false);
assert.equal(await balance(),before-1.5);
const saved=(await db.query('select * from astros_sms_orders where id=$1',[r])).rows[0];assert.equal(saved.supplier,'five_sim');assert.equal(Number(saved.estimated_cost_cents),100);assert.equal(Number(saved.usd_units),0);
await assert.rejects(db.query("update astros_sms_orders set supplier='smspool' where id=$1",[r]),/imutável/);
await assert.rejects(db.query("select astros_sms_configure_five($1,1000,0,0,'different-five-key-123456')",[admin]),/Conclua/);
await assert.rejects(db.query('select astros_sms_reserve($1,$2,$3)',[other,r,q]),/divergente/);
await db.query("select astros_sms_settle($1,'pending','123','5511888888888',null,now())",[r]); // Same provider ID in different suppliers is legitimate.
assert.equal((await db.query('select astros_sms_claim_five_cancel($1) r',[r])).rows[0].r,true);
assert.equal((await db.query('select astros_sms_claim_five_cancel($1) r',[r])).rows[0].r,false);
const pendingQuote=await quote('five_sim');await db.query("select astros_sms_select_supplier($1,'smspool',false)",[admin]);
await assert.rejects(db.query('select astros_sms_reserve($1,$2,$3)',[user,id(),pendingQuote]));
// Both suppliers still reconcile while paused; one refund only, received finality intact.
await db.query("select astros_sms_settle($1,'refunded')",[r]);await db.query("select astros_sms_settle($1,'refunded')",[r]);assert.equal(await balance(),before);
await db.query("select astros_sms_settle($1,'received',null,null,'123456')",[oldOrder]);await db.query("select astros_sms_settle($1,'refunded')",[oldOrder]);assert.equal(await balance(),before);
assert.equal((await db.query('select astros_sms_reserve($1,$2,$3) r',[user,r,q])).rows[0].r.dispatch,false);
await db.query("select astros_sms_select_supplier($1,'five_sim',true)",[admin]);
const changedQuote=await quote('five_sim');await db.query("select astros_sms_configure_five($1,1000,5000,0,'')",[admin]);await assert.rejects(db.query('select astros_sms_reserve($1,$2,$3)',[user,id(),changedQuote]),/Atualize/);
await db.exec("update astros_sms_settings set fx_mode='auto',fx_checked_at=null,fx_date=null,usd_brl_units=0");
const noUsd=await quote('five_sim'),noUsdOrder=id();await db.query('select astros_sms_reserve($1,$2,$3)',[user,noUsdOrder,noUsd]); // No SMSPool FX dependency.
await db.query("select astros_sms_configure($1,true,55000,0,0,'changed-smspool-key-123456')",[admin]); // 5SIM pending orders do not lock unrelated SMSPool credentials.
await db.exec("update astros_sms_settings set worker_at=now()-interval '4 minutes'");await assert.rejects(db.query('select astros_sms_reserve($1,$2,$3)',[user,id(),await quote('five_sim')]),/indisponível/);
await db.exec('update astros_sms_settings set worker_at=now()');
// Module maintenance must still be authoritative for 5SIM quotes and orders.
for(const table of ['astros_service_jobs','astros_social_orders','astros_prospect_requests','astros_cnpj_requests','astros_social_quotes'])await db.exec(`create table ${table}(user_id uuid)`);
await load('20261021_module_access.sql');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
const gatedQuote=await quote('five_sim'),gatedBalance=await balance();await db.query("select astros_save_module('sms',false,null,'Manutenção')");
await assert.rejects(quote('five_sim'),/manutenção/);await assert.rejects(db.query('select astros_sms_reserve($1,$2,$3)',[user,id(),gatedQuote]),/manutenção/);assert.equal(await balance(),gatedBalance);
await db.query("select astros_sms_settle($1,'refunded')",[noUsdOrder]); // Accepted orders settle under maintenance.
await db.exec('set role authenticated');for(const table of ['astros_sms_private','astros_sms_five_settings','astros_sms_five_cancels','astros_sms_supplier_audit'])await assert.rejects(db.exec('select * from '+table),/permission denied/);
await assert.rejects(db.query("select astros_sms_select_supplier($1,'smspool',true)",[admin]),/permission denied/);await assert.rejects(db.query('select astros_sms_claim_five_cancel($1)',[r]),/permission denied/);await db.exec('reset role');
await load('20261021_sms_five_sim.sql');assert.equal((await db.query('select active_supplier from astros_sms_settings')).rows[0].active_supplier,'five_sim');assert.equal((await db.query('select five_sim_key from astros_sms_private')).rows[0].five_sim_key,'five-sim-test-key-123456');await assert.rejects(quote('five_sim'),/manutenção/);
console.log('PASS: legacy preservation, supplier routing/version, native cost snapshot, wallet debit/idempotency, same provider IDs, key rotation, one cancellation, pause/recovery/refund, stale FX isolation, worker, module gates, private grants and reapply.');await db.close();
