// Reuse the full existing deletion contract against the additive digital extension.
const fs=require('node:fs'),vm=require('node:vm');
let test=fs.readFileSync('scripts/check-account-danger.cjs','utf8');
test=test.replace("'20261026_client_workspace'];", "'20261026_client_workspace','20261028_digital_research'];");
test=test.replace('checks+=2;',`checks+=2;await db.exec(fs.readFileSync('supabase/migrations/20261028_digital_account_deletion.sql','utf8'));await db.exec(fs.readFileSync('supabase/migrations/20261028_digital_account_deletion.sql','utf8'));`);
const marker="await as(owner);p=await view();ok(p.records.some(x=>x.table==='backup_desbanimento'";
if(!test.includes(marker))throw Error('Base deletion test changed; review extension fixture.');
test=test.replace(marker,`// Exercise the new tables before the unchanged final deletion assertions.
await db.exec('reset role');
const digital='30000000-0000-4000-8000-000000000001',foreign='30000000-0000-4000-8000-000000000002';
for(const [rid,uid] of [[digital,client],[foreign,other]]){
 await db.query("insert into astros_digital_requests(id,user_id,tool,query,quantity,unit_cents,reserved_cents,max_usd_cents,state) values($1,$2,'instagram_profile','example',1,10,10,20,'review')",[rid,uid]);
 await db.query("insert into astros_digital_saved(user_id,request_id,username,collection,profile) values($1,$2,'example','Teste','{}')",[uid,rid]);
 await db.query('insert into astros_digital_access(user_id,enabled) values($1,true)',[uid]);
}
await as(owner);p=await view();ok(p.blockers.some(x=>x.includes('pesquisa digital')),'digital pending blocks deletion');
await fail('select astros_deletion_execute($1,$2,$3,true,true)',[client,p.previewId,p.email],'pendências');
await db.exec('reset role');await db.query("update astros_digital_requests set state='completed' where id=$1",[digital]);
await as(owner);p=await view();ok(p.blockers.some(x=>x.includes('cotas atuais')),'digital current quota cannot be erased');
await db.exec('reset role');await db.query("update astros_digital_requests set created_at=now()-interval '2 days' where id=$1",[digital]);
await as(owner);p=await view();ok(!p.blockers.length,'settled old digital records do not prevent deletion');
for(const t of ['astros_digital_saved','astros_digital_requests','astros_digital_access'])ok(p.records.some(x=>x.table===t&&x.count===1),t+' explicit preview');
${marker}`);
const audit='let audit=JSON.stringify';
if(!test.includes(audit))throw Error('Base audit test changed.');
test=test.replace(audit,`for(const t of ['astros_digital_saved','astros_digital_requests','astros_digital_access']){
 ok(Number((await one('select count(*) n from '+t+' where user_id=$1',[client])).n)===0,t+' own rows removed');
 ok(Number((await one('select count(*) n from '+t+' where user_id=$1',[other])).n)===1,t+' foreign rows preserved');
}
${audit}`);
vm.runInNewContext(test,{require,console,process},{filename:'digital-deletion-fixture.cjs'});
