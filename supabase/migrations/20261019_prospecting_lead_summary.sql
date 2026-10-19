begin;
-- Read-only totals for the verified account, independent of filters and pagination.
create or replace function public.astros_prospect_lead_summary(actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare summary jsonb;
begin
 perform public.astros_prospect_actor(actor);
 select jsonb_build_object(
   'total',count(*),
   'new',count(*) filter(where d.status='new'),
   'contacted',count(*) filter(where d.status='contacted'),
   'negotiating',count(*) filter(where d.status='negotiating'),
   'won',count(*) filter(where d.status='won'),
   'discarded',count(*) filter(where d.status='discarded')
 ) into summary from public.astros_prospect_deliveries d where d.user_id=actor;
 return summary;
end $$;
revoke all on function public.astros_prospect_lead_summary(uuid) from public,anon,authenticated;
grant execute on function public.astros_prospect_lead_summary(uuid) to service_role;
commit;
