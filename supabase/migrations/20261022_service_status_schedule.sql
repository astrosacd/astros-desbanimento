-- Install only AFTER astros-status has been deployed with JWT verification off.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create or replace function public.astros_status_tick() returns void language plpgsql security definer set search_path='' as $$
declare k text;begin
 select worker_secret into k from public.astros_status_private where id;
 if k is null then raise exception 'Monitoramento não instalado'; end if;
 perform net.http_post(url:='https://tevljvidqbvrcgzqypwf.supabase.co/functions/v1/astros-status',headers:=jsonb_build_object('Content-Type','application/json','X-Astros-Status-Worker',k),body:='{"action":"worker"}'::jsonb,timeout_milliseconds:=60000);
end $$;
revoke all on function public.astros_status_tick() from public,anon,authenticated;
grant execute on function public.astros_status_tick() to service_role;
do $$ declare j record;begin for j in select jobid from cron.job where jobname='astros-status-monitor' loop perform cron.unschedule(j.jobid);end loop;end $$;
select cron.schedule('astros-status-monitor','*/2 * * * *','select public.astros_status_tick()');
select public.astros_status_tick();
