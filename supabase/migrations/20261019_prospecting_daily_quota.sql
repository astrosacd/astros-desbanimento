begin;
-- Owner-only read model; the existing begin transaction remains the authorization guard.
create or replace function public.astros_prospect_daily_quota(actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare day_start timestamptz;reset_at timestamptz;daily_limit integer;used_count bigint;
begin
 perform public.astros_prospect_actor(actor);
 day_start:=((now() at time zone 'America/Fortaleza')::date)::timestamp at time zone 'America/Fortaleza';
 reset_at:=(((now() at time zone 'America/Fortaleza')::date+1)::timestamp) at time zone 'America/Fortaleza';
 select daily_requests into daily_limit from public.astros_prospect_settings where id;
 if daily_limit is null then raise exception 'Configuração de prospecção não encontrada';end if;
 select count(*) into used_count from public.astros_prospect_requests r where r.user_id=actor and r.created_at>=day_start and r.created_at<reset_at;
 return jsonb_build_object('limit',daily_limit,'used',used_count,'remaining',greatest(0,daily_limit-used_count),'resetsAt',reset_at,'serverNow',now());
end $$;
revoke all on function public.astros_prospect_daily_quota(uuid) from public,anon,authenticated;
grant execute on function public.astros_prospect_daily_quota(uuid) to service_role;
commit;
