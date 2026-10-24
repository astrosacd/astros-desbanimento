-- Install AFTER deploying astros-affiliates with Verify JWT OFF. No other cron is changed.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create or replace function public.astros_affiliate_tick() returns void
language plpgsql security definer set search_path='' as $$
declare k text;
begin
 select worker_secret into strict k from public.astros_affiliate_private where id;
 perform net.http_post(
  url:='https://tevljvidqbvrcgzqypwf.supabase.co/functions/v1/astros-affiliates',
  headers:=jsonb_build_object('Content-Type','application/json','X-Astros-Affiliate-Worker',k),
  body:='{}'::jsonb,timeout_milliseconds:=55000
 );
end $$;
revoke all on function public.astros_affiliate_tick() from public,anon,authenticated;
grant execute on function public.astros_affiliate_tick() to service_role;
do $$ declare j record;begin
 for j in select jobid from cron.job where jobname='astros-affiliate-worker' loop perform cron.unschedule(j.jobid);end loop;
end $$;
select cron.schedule('astros-affiliate-worker','* * * * *','select public.astros_affiliate_tick()');
select public.astros_affiliate_tick();
