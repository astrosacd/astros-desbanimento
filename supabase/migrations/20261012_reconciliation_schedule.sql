-- Execute only after the reconciliation SQL and Baserow tracking column are ready.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
-- Supabase Vault is provided by the hosted project.
do $$ begin
 if not exists(select 1 from vault.secrets where name='astros_reconcile_secret') then
  perform vault.create_secret(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'astros_reconcile_secret','Private authorization for Astros submission checks');
 end if;
end $$;
select cron.schedule('astros-reconcile-submissions','* * * * *',$job$
 select net.http_post(
  url:='https://tevljvidqbvrcgzqypwf.supabase.co/functions/v1/astros-submit-number?worker=1',
  headers:=jsonb_build_object('Content-Type','application/json','apikey','sb_publishable_wvwHQDOVefSPivb227u1Iw_lH5qEM_j','x-astros-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='astros_reconcile_secret' limit 1)),
  body:='{}'::jsonb,timeout_milliseconds:=90000
 );
$job$);
create or replace function public.astros_reconcile_ready(worker_hash text) returns boolean
language sql security definer set search_path='' as $$
 select exists(select 1 from cron.job where jobname='astros-reconcile-submissions' and active)
 and exists(select 1 from public.astros_service_worker_status where id=true and last_seen>now()-interval '5 minutes')
 and exists(select 1 from vault.decrypted_secrets where name='astros_reconcile_secret' and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(decrypted_secret,'UTF8')),'hex')=worker_hash);
$$;
revoke all on function public.astros_reconcile_ready(text) from public,anon,authenticated;
grant execute on function public.astros_reconcile_ready(text) to service_role;
-- Copy this value only into Edge Functions > Secrets > ASTROS_RECONCILE_SECRET.
-- Do not share it in chat. The generated value is not stored in source code.
select decrypted_secret as astros_reconcile_secret from vault.decrypted_secrets where name='astros_reconcile_secret';
