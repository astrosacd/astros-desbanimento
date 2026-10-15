-- Aplicar após a função astros-social e salvar a chave, mantendo as compras pausadas.
-- JWT da função precisa ficar desativado para o cron; cada chamada é validada internamente.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create or replace function public.astros_social_tick() returns void language plpgsql security definer set search_path='' as $$
declare k text;begin
 select worker_secret into k from public.astros_social_private where id=true;if coalesce(k,'')='' then return;end if;
 delete from public.astros_social_quotes where id in(select q.id from public.astros_social_quotes q where expires_at<now()-interval '1 day' and not exists(select 1 from public.astros_social_orders o where o.quote_id=q.id) limit 500);
 perform net.http_post(url:='https://tevljvidqbvrcgzqypwf.supabase.co/functions/v1/astros-social',headers:=jsonb_build_object('Content-Type','application/json','X-Astros-Social-Worker',k),body:='{"action":"worker"}'::jsonb,timeout_milliseconds:=60000);
end;$$;
revoke all on function public.astros_social_tick() from public,anon,authenticated;
grant execute on function public.astros_social_tick() to service_role;
select cron.schedule('astros-social-monitor','* * * * *','select public.astros_social_tick();');
select public.astros_social_tick();
