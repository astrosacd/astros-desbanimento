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

await load('20261021_sms_five_sim.sql');
await db.query("select astros_sms_configure_five($1,56130,5000,0,'five-sim-test-key-123456')",[admin]);
const before=await balance();const initial=(await db.query('select * from astros_sms_five_settings')).rows[0];
await load('20261021_sms_five_auto_fx.sql');
assert.equal((await db.query('select fx_mode from astros_sms_five_settings')).rows[0].fx_mode,'manual');assert.equal(await balance(),before);
assert.equal(Number((await db.query('select native_brl_units from astros_sms_five_settings')).rows[0].native_brl_units),56130);
const cfg=async(who=admin)=>db.query("select astros_sms_configure_five_fx($1,56130,5000,0,'','auto',10000000,350000,375,0,50000,current_date)",[who]);
await assert.rejects(cfg(user),/não autorizado/);await cfg();
assert.equal(Number((await db.query('select native_brl_units from astros_sms_five_settings')).rows[0].native_brl_units),53625);
assert.equal(Number((await db.query('select usd_brl_units from astros_sms_settings')).rows[0].usd_brl_units),55000);
await db.query("select astros_sms_select_supplier($1,'five_sim',true)",[admin]);
const fq=async()=> (await db.query("insert into astros_sms_quotes(user_id,service_id,country_id,pool_id,service_name,country_name,usd_units,price_cents,settings_version,supplier,supplier_product,supplier_country,native_units,native_brl_units) select $1,0,0,0,'WhatsApp','Brasil',0,ceil(1000000::numeric*f.native_brl_units*15000/1000000000000),s.updated_at,'five_sim','whatsapp','brazil',1000000,f.native_brl_units from astros_sms_settings s,astros_sms_five_settings f returning id",[user])).rows[0].id;
const q=await fq(),request=id();await db.query('select astros_sms_reserve($1,$2,$3)',[user,request,q]);
const saved=(await db.query('select * from astros_sms_orders where id=$1',[request])).rows[0];
const stale=await fq();await db.query('select astros_sms_refresh_five_fx(60000,current_date)');
await assert.rejects(db.query('select astros_sms_reserve($1,$2,$3)',[user,id(),stale]),/Atualize/);
const fresh=await fq();await db.exec("update astros_sms_five_settings set fx_checked_at=now()-interval '7 hours'");
const funds=await balance();await assert.rejects(db.query('select astros_sms_reserve($1,$2,$3)',[user,id(),fresh]),/Serviço indisponível/);assert.equal(await balance(),funds);await assert.rejects(fq(),/Serviço indisponível/);
assert.equal((await db.query('select astros_sms_reserve($1,$2,$3) r',[user,request,q])).rows[0].r.dispatch,false);
await db.query("select astros_sms_settle($1,'pending','123','5511999999999',null,now())",[request]);await db.query("select astros_sms_settle($1,'refunded')",[request]);await db.query("select astros_sms_settle($1,'refunded')",[request]);assert.equal(await balance(),before);
assert.equal(Number((await db.query('select native_brl_units from astros_sms_orders where id=$1',[request])).rows[0].native_brl_units),Number(saved.native_brl_units));
await db.query('select astros_sms_refresh_five_fx(60000,current_date)');await load('20261021_sms_five_auto_fx.sql');assert.equal((await db.query('select fx_mode from astros_sms_five_settings')).rows[0].fx_mode,'auto');
await db.exec('set role authenticated');await assert.rejects(db.query('select astros_sms_refresh_five_fx(50000,current_date)'),/permission denied/);await assert.rejects(cfg(),/permission denied/);await db.exec('reset role');
for(const [market,deposit,fixed,percent,spread,expected] of [[50000,10000000,350000,375,0,53625],[50000,5000000,350000,375,0,55375],[50000,10000000,350000,375,400,55770],[50123,10000000,350000,375,0,53757]]){const result=await db.query('select astros_sms_five_effective_fx($1,$2,$3,$4,$5) r',[market,deposit,fixed,percent,spread]);assert.equal(Number(result.rows[0].r),expected);}
await assert.rejects(db.query('select astros_sms_refresh_five_fx(50000,current_date-8)'),/desatualizada/);
console.log('PASS: migration preservation/reapply, independent FX, exact SQL rounding, admin permissions, quote invalidation, stale quote/order rejection before debit, existing recovery and one-refund ledger.');await db.close();
