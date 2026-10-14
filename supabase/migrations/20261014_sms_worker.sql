-- Execute APÓS salvar as configurações SMS (ainda desativadas) e publicar astros-sms.
-- A chave privada permanece dentro da tabela protegida, nunca no texto do cron.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create or replace function public.astros_sms_tick() returns void
language plpgsql security definer set search_path='' as $$
declare secret_value text;
begin
 select worker_secret into secret_value from public.astros_sms_private where id=true;
 if coalesce(secret_value,'')='' then return;end if;
 delete from public.astros_sms_quotes where id in(select q.id from public.astros_sms_quotes q where q.expires_at<now()-interval '1 day' and not exists(select 1 from public.astros_sms_orders o where o.quote_id=q.id) limit 500);
 perform net.http_post(url:='https://tevljvidqbvrcgzqypwf.supabase.co/functions/v1/astros-sms',
 headers:=jsonb_build_object('Content-Type','application/json','X-Astros-Sms-Worker',secret_value),
 body:='{"action":"worker"}'::jsonb,timeout_milliseconds:=60000);
end;$$;
revoke all on function public.astros_sms_tick() from public,anon,authenticated;
grant execute on function public.astros_sms_tick() to service_role;
select cron.schedule('astros-sms-monitor','* * * * *','select public.astros_sms_tick();');
select public.astros_sms_tick();
