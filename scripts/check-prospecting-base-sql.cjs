// Executes the report against PostgreSQL in isolation; no production credentials.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.ASTROS_PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{const db=new PGlite();let checks=0;
await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
create table auth.users(id uuid primary key,email_confirmed_at timestamptz,banned_until timestamptz,raw_app_meta_data jsonb default '{}');
create table public.painel_de_desbanimento(id uuid primary key references auth.users(id),nome text,email text,tipo_usuario text,recarga numeric default 0);
create table public.astros_wallet_movements(id uuid primary key default gen_random_uuid(),user_id uuid,amount_cents bigint,kind text,reference text,created_at timestamptz default now(),unique(kind,reference));`);
for(const file of ['20261018_prospecting.sql','20261019_prospecting_admin_base.sql','20261019_prospecting_admin_base.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/',file),'utf8'));
const admin='00000000-0000-4000-8000-000000000001',A='00000000-0000-4000-8000-000000000002',B='00000000-0000-4000-8000-000000000003';
for(const [id,email,role] of [[admin,'admin@test.com','admin'],[A,'a@test.com','cliente'],[B,'b@test.com','cliente']]){await db.query('insert into auth.users(id,email_confirmed_at) values($1,now())',[id]);await db.query('insert into painel_de_desbanimento(id,nome,email,tipo_usuario,recarga) values($1,$2,$2,$3,100)',[id,email,role]);}
const q1='a'.repeat(32),q2='b'.repeat(32);for(const [id,niche] of [[q1,'dentistas'],[q2,'academias']])await db.query("insert into astros_prospect_queries(id,niche,city,country) values($1,$2,'fortaleza','BR')",[id,niche]);
for(let i=0;i<20;i++){const id='pid:'+i;await db.query('insert into astros_prospect_businesses(id,data) values($1,$2)',[id,{id,name:'Empresa '+i,phone:'85999999999',websiteStatus:'missing'}]);await db.query('insert into astros_prospect_matches(query_id,business_id) values($1,$2)',[q1,id]);}
await db.query("insert into astros_prospect_matches(query_id,business_id) values($1,'pid:0')",[q2]);
for(const [actor,request] of [[A,'00000000-0000-4000-8000-000000000010'],[B,'00000000-0000-4000-8000-000000000011']]){await db.query("insert into astros_prospect_requests(id,user_id,query_id,criteria,quantity,unit_cents,state,delivered) values($1,$2,$3,'{}',5,10,'completed',5)",[request,actor,q1]);for(let i=0;i<5;i++)await db.query("insert into astros_prospect_deliveries(user_id,business_id,request_id,snapshot) values($1,$2,$3,'{}')",[actor,'pid:'+i,request]);}
const report=async(args={})=>(await db.query('select astros_prospect_admin_base($1,$2,$3,$4,$5,$6) as value',[args.actor||admin,args.search||'',args.email||'',args.query||'',args.page||0,args.businessPage||0])).rows[0].value;
let r=await report({email:' A@TEST.COM ',query:q1});assert.deepEqual(r.totals,{businesses:20,queries:2,deliveries:10,accounts:2});checks++;
let q=r.queries.find(q=>q.id===q1);assert.equal(q.saved,20);assert.equal(q.fresh,20);assert.equal(q.deliveries,10);assert.equal(q.neverDelivered,15);assert.equal(q.accountDelivered,5);assert.equal(q.accountAvailable,15);checks+=6;
assert.equal(r.businessCount,20);assert.equal(r.businesses.filter(b=>b.deliveredToAccount).length,5);assert.equal(r.businesses.filter(b=>!b.deliveredToAccount).length,15);checks+=3;
// Existing delivery through another query still blocks repeat delivery to the same account.
q=r.queries.find(q=>q.id===q2);assert.equal(q.accountDelivered,1);assert.equal(q.accountAvailable,0);checks+=2;
await db.exec("update astros_prospect_businesses set updated_at=now()-interval '8 days' where id='pid:19';update astros_prospect_matches set seen_at=now()-interval '8 days' where business_id='pid:18'");r=await report({email:'a@test.com'});q=r.queries.find(q=>q.id===q1);assert.equal(q.saved,20);assert.equal(q.fresh,18);assert.equal(q.accountAvailable,13);checks+=3;
r=await report({email:'missing@test.com'});assert.equal(r.target,null);assert.equal(r.targetRequested,true);assert.equal(r.queries[0].accountAvailable,null);checks+=3;
r=await report();assert.equal(r.targetRequested,false);assert.equal(r.queries[0].accountDelivered,null);checks+=2;
assert.equal((await report({search:'dentista'})).queryCount,1);assert.equal((await report({page:1})).queries.length,0);assert.equal((await report({search:'none'})).queryCount,0);checks+=3;
for(let i=0;i<23;i++)await db.query("insert into astros_prospect_queries(id,niche,city,country) values($1,'outro','recife','BR')",[String(i).padStart(32,'0')]);r=await report();assert.equal(r.queries.length,20);assert.equal(r.queryHasMore,true);assert.equal((await report({page:1})).queries.length,5);checks+=3;
await assert.rejects(()=>report({actor:A}),/Conta indisponível/);await assert.rejects(()=>report({query:'unknown'}),/Pesquisa não encontrada/);await assert.rejects(()=>report({page:10001}),/Filtro inválido/);checks+=3;
await db.exec('set role authenticated');await assert.rejects(()=>report(),/permission denied/);await db.exec('reset role');checks++;
assert.equal(Number((await db.query('select sum(recarga) as n from painel_de_desbanimento')).rows[0].n),300);assert.equal((await db.query('select count(*) as n from astros_wallet_movements')).rows[0].n,0);assert.equal((await db.query('select count(*) as n from astros_prospect_deliveries')).rows[0].n,10);checks+=3;
console.log(JSON.stringify({checks,sql:'passed',reapplied:true,twentySavedFiveDeliveredFifteenAvailable:'passed',adminOnly:'passed',noFinancialMutation:'passed'}));await db.close();})();
