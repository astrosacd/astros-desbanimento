import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
const db=new PGlite();
const admin=id(),a=id(),b=id();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.painel_de_desbanimento(id uuid primary key,tipo_usuario text,recarga numeric default 100);
create function public.astros_is_admin() returns boolean language sql security definer as $$select exists(select 1 from public.painel_de_desbanimento where id=auth.uid() and tipo_usuario='admin')$$;
`);
await db.query("insert into painel_de_desbanimento(id,tipo_usuario) values($1,'admin'),($2,'cliente'),($3,'cliente')",[admin,a,b]);
const tables={astros_service_jobs:'desbanimento',astros_sms_orders:'sms',astros_social_orders:'social',astros_prospect_requests:'prospecting',astros_cnpj_requests:'prospecting',astros_sms_quotes:'sms',astros_social_quotes:'social'};
for(const table of Object.keys(tables))await db.exec(`create table public.${table}(id uuid primary key,user_id uuid not null,state text default 'pending')`);
const sql=fs.readFileSync(new URL('../supabase/migrations/20261021_module_access.sql',import.meta.url),'utf8');
await db.exec(sql);
const claim=async user=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);
const call=async(name,values=[])=> (await db.query(`select public.${name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) result`,values)).rows[0].result;
const save=(m,on,target=null,notice='')=>call('astros_save_module',[m,on,target,notice]);
const insert=(table,user,ref=id())=>db.query(`insert into public.${table}(id,user_id) values($1,$2)`,[ref,user]);
await claim(a);assert.equal((await call('astros_my_modules')).every(x=>x.enabled),true);
await db.exec('set role authenticated');
await assert.rejects(()=>save('sms',false),/administrativo/);
await assert.rejects(()=>call('astros_admin_modules',[b]),/administrativo/);
for(const table of ['astros_module_settings','astros_module_clients','astros_module_audit'])await assert.rejects(()=>db.query('select * from '+table),/permission denied/);
await assert.rejects(()=>call('astros_module_access',[b,'sms']),/permission denied/);
await db.exec('reset role');await claim(admin);
await assert.rejects(()=>save('sms',false,admin),/cliente/);
await assert.rejects(()=>save('made-up',false),/inválida/);
await assert.rejects(()=>save('sms',false,null,'a'.repeat(301)),/inválida/);
// For all seven entry tables: default allow; individual/global deny; accepted updates survive.
for(const [table,m] of Object.entries(tables)){
 await save(m,true);await save(m,true,a);
 const accepted=id();await insert(table,a,accepted);
 await save(m,false,a);await assert.rejects(()=>insert(table,a),/não está liberado/);
 await insert(table,b); // Another client remains authorized.
 await db.query(`update ${table} set state='completed' where id=$1`,[accepted]);
 await save(m,false,null,'Manutenção programada');
 await assert.rejects(()=>insert(table,b),/manutenção/);
 await save(m,true,a);await assert.rejects(()=>insert(table,a),/manutenção/); // Global wins.
 await db.query(`update ${table} set state='refunded' where id=$1`,[accepted]);
 await claim(a);assert.equal((await call('astros_my_modules')).find(x=>x.module===m).message,'Manutenção programada');await claim(admin);
 await save(m,true);await insert(table,a);
}
// Transaction rollback: even an earlier debit cannot survive a rejected INSERT.
await save('sms',false);
const balance=Number((await db.query('select recarga from painel_de_desbanimento where id=$1',[a])).rows[0].recarga);
await db.exec('begin');await db.query('update painel_de_desbanimento set recarga=recarga-10 where id=$1',[a]);await assert.rejects(()=>insert('astros_sms_orders',a),/manutenção/);await db.exec('rollback');
assert.equal(Number((await db.query('select recarga from painel_de_desbanimento where id=$1',[a])).rows[0].recarga),balance);
// Reinstallation must retain restrictions and not duplicate audit/no-op saves.
const audits=Number((await db.query('select count(*) n from astros_module_audit')).rows[0].n);
await save('sms',false);assert.equal(Number((await db.query('select count(*) n from astros_module_audit')).rows[0].n),audits);
await db.exec(sql);await assert.rejects(()=>insert('astros_sms_orders',a),/manutenção/);
await claim(b);const own=await call('astros_my_modules');assert.equal(own.length,4);assert.equal(own.find(x=>x.module==='sms').enabled,false);
await claim(null);await assert.rejects(()=>call('astros_my_modules'),/Entre novamente/);
await db.close();console.log('Module access SQL: permissions, seven operation boundaries, client isolation, global precedence, existing settlement, rollback and reinstallation passed.');
