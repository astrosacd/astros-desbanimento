-- Apply after capacity_queue SQL and the updated astros-prospecting function.
-- This schedules only the prospecting module. No manual worker secret is required.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create or replace function public.astros_prospect_tick() returns void language plpgsql security definer set search_path='' as $$
declare k text;begin
 select worker_secret into k from public.astros_prospect_private where id;
 if coalesce(k,'')='' then return;end if;
 perform net.http_post(url:='https://tevljvidqbvrcgzqypwf.supabase.co/functions/v1/astros-prospecting',headers:=jsonb_build_object('Content-Type','application/json','X-Astros-Prospect-Worker',k),body:='{"action":"worker"}'::jsonb,timeout_milliseconds:=120000);
end $$;
revoke all on function public.astros_prospect_tick() from public,anon,authenticated;
grant execute on function public.astros_prospect_tick() to service_role;
do $$declare j bigint;begin for j in select jobid from cron.job where jobname='astros-prospect-queue' loop perform cron.unschedule(j);end loop;end $$;
select cron.schedule('astros-prospect-queue','* * * * *','select public.astros_prospect_tick();');
select public.astros_prospect_tick();
