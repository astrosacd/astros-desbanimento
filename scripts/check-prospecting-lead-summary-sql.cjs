const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const {PGlite}=require(process.env.ASTROS_PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{const db=new PGlite();let checks=0;await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;create table auth.users(id uuid primary key,email_confirmed_at timestamptz,banned_until timestamptz,raw_app_meta_data jsonb default '{}');create table public.painel_de_desbanimento(id uuid primary key references auth.users(id),tipo_usuario text,recarga numeric default 0);create table public.astros_wallet_movements(id uuid primary key default gen_random_uuid(),user_id uuid,amount_cents bigint,kind text,reference text,created_at timestamptz default now(),unique(kind,reference));`);
for(const file of ['20261018_prospecting.sql','20261019_prospecting_lead_summary.sql','20261019_prospecting_lead_summary.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/',file),'utf8'));
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
for(const id of [A,B]){await db.query('insert into auth.users(id,email_confirmed_at) values($1,now())',[id]);await db.query("insert into painel_de_desbanimento(id,tipo_usuario,recarga) values($1,'cliente',100)",[id]);}
await db.exec("insert into astros_prospect_queries(id,niche,city,country) values('test','dentistas','fortaleza','BR')");
for(const actor of [A,B]) {
 const request=actor===A?'00000000-0000-4000-8000-000000000010':'00000000-0000-4000-8000-000000000011';
 await db.query("insert into astros_prospect_requests(id,user_id,criteria,query_id,quantity,unit_cents,state) values($1,$2,'{}','test',20,10,'completed')",[request,actor]);
 const statuses=actor===A?[...Array(25).fill('new'),'contacted','negotiating','won','discarded']:['new','new','won'];
 for(const [i,status] of statuses.entries()) {
  const business=actor+':'+i;
  await db.query("insert into astros_prospect_businesses(id,data) values($1,'{}')",[business]);
  await db.query("insert into astros_prospect_deliveries(user_id,business_id,request_id,snapshot,status) values($1,$2,$3,'{}',$4)",[actor,business,request,status]);
 }
}
const read=async actor=>(await db.query('select astros_prospect_lead_summary($1) as value',[actor])).rows[0].value;
assert.deepEqual(await read(A),{total:29,new:25,contacted:1,negotiating:1,won:1,discarded:1});checks++;
assert.deepEqual(await read(B),{total:3,new:2,contacted:0,negotiating:0,won:1,discarded:0});checks++;
await db.query("update astros_prospect_deliveries set status='won' where user_id=$1 and business_id=$2",[A,A+':0']);
let r=await read(A);assert.equal(r.total,29);assert.equal(r.new,24);assert.equal(r.won,2);checks+=3;
await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[B]);await assert.rejects(()=>read(B),/Conta indisponível/);checks++;
await db.query("update auth.users set banned_until=null,raw_app_meta_data='{\"astros_password_change_required\":true}' where id=$1",[B]);await assert.rejects(()=>read(B),/Conta indisponível/);checks++;
for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>read(A),/permission denied/);await db.exec('reset role');checks++;}
assert.equal(Number((await db.query('select sum(recarga) n from painel_de_desbanimento')).rows[0].n),200);assert.equal(Number((await db.query('select count(*) n from astros_wallet_movements')).rows[0].n),0);checks+=2;
console.log(JSON.stringify({checks,sql:'passed',ownerIsolation:true,reapplied:true,allPages:true,noFinancialMutation:true}));await db.close();})();
