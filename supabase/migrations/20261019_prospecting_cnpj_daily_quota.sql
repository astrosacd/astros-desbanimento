-- Read-only per-account quota; same day boundary and request count as reservation.
begin;
create or replace function public.astros_cnpj_config(actor uuid,administrator boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.astros_cnpj_settings; used_count integer; today timestamp:=date_trunc('day',now() at time zone 'America/Fortaleza'); begin
 perform public.astros_prospect_actor(actor,administrator);select * into s from public.astros_cnpj_settings where id;
 select count(*) into used_count from public.astros_cnpj_requests where user_id=actor and created_at>=today at time zone 'America/Fortaleza' and created_at<(today+interval '1 day') at time zone 'America/Fortaleza';
 return jsonb_build_object('dailyQuota',jsonb_build_object('limit',s.daily_requests,'used',used_count,'remaining',greatest(0,s.daily_requests-used_count),'serverNow',now(),'resetsAt',(today+interval '1 day') at time zone 'America/Fortaleza'),'installed',true,'enabled',s.enabled,'unitCents',s.unit_cents,'enrichEnabled',s.enrich_enabled,'enrichCents',s.enrich_cents)||case when administrator then jsonb_build_object('dailyRequests',s.daily_requests,'dailyCalls',s.daily_calls,'minuteCalls',s.minute_calls,'cacheDays',s.cache_days,'hasKey',exists(select 1 from public.astros_cnpj_private where id and api_key<>'')) else '{}'::jsonb end;
end $$;
revoke all on function public.astros_cnpj_config(uuid,boolean) from public,anon,authenticated;
grant execute on function public.astros_cnpj_config(uuid,boolean) to service_role;
commit;
