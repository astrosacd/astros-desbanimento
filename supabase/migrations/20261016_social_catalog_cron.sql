-- Executar depois do SQL de operações e de atualizar astros-social.
create or replace function public.astros_social_catalog_tick() returns void language plpgsql security definer set search_path='' as $$
declare k text;begin
 select worker_secret into k from public.astros_social_private where id=true;if coalesce(k,'')='' then return;end if;
 perform net.http_post(url:='https://tevljvidqbvrcgzqypwf.supabase.co/functions/v1/astros-social',headers:=jsonb_build_object('Content-Type','application/json','X-Astros-Social-Worker',k),body:='{"action":"catalog-worker"}'::jsonb,timeout_milliseconds:=60000);
end;$$;
revoke all on function public.astros_social_catalog_tick() from public,anon,authenticated;
grant execute on function public.astros_social_catalog_tick() to service_role;
select cron.schedule('astros-social-catalog','*/5 * * * *','select public.astros_social_catalog_tick();');
select public.astros_social_catalog_tick();
