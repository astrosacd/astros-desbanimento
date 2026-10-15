-- Visão operacional somente para admin e pausa independente de câmbio/fornecedor.
begin;
create index if not exists astros_sms_attention_created on public.astros_sms_orders(created_at,id) where state in ('review','dispatching','pending');
create table if not exists public.astros_sms_operation_events(id uuid primary key default gen_random_uuid(),actor_id uuid not null,operation text not null check(operation='pause'),created_at timestamptz not null default now());
alter table public.astros_sms_operation_events enable row level security;
revoke all on public.astros_sms_operation_events from public,anon,authenticated;
grant all on public.astros_sms_operation_events to service_role;
create or replace function public.astros_sms_pause(actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare active boolean;
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso não autorizado';end if;
 select enabled into active from public.astros_sms_settings where id=true for update;
 if active then
  update public.astros_sms_settings set enabled=false,updated_at=clock_timestamp(),updated_by=actor where id=true;
  insert into public.astros_sms_operation_events(actor_id,operation) values(actor,'pause');
 end if;
 return jsonb_build_object('enabled',false);
end;$$;
create or replace function public.astros_sms_dashboard(actor uuid,date_from date,date_until date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare start_at timestamptz;end_at timestamptz;result jsonb;
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso não autorizado';end if;
 if date_from is null or date_until is null or date_until<date_from or date_until-date_from>365 then raise exception 'Período inválido';end if;
 start_at=date_from::timestamp at time zone 'America/Fortaleza';end_at=(date_until+1)::timestamp at time zone 'America/Fortaleza';
 with period as materialized(select * from public.astros_sms_orders where created_at>=start_at and created_at<end_at),
 totals as(select count(*) total,count(*) filter(where state='received') received,count(*) filter(where state='refunded') refunded,
 count(*) filter(where state in ('dispatching','pending','review')) open_count,
 coalesce(sum(price_cents) filter(where state='received'),0) sales,
 coalesce(sum(price_cents) filter(where state='refunded'),0) returned,
 coalesce(sum(estimated_cost_cents) filter(where state='received' and estimated_cost_cents is not null),0) cost,
 coalesce(sum(price_cents-estimated_cost_cents) filter(where state='received' and estimated_cost_cents is not null),0) gain,
 count(*) filter(where state='received' and estimated_cost_cents is null) missing from period),
 attention as materialized(select o.id,o.service_name,o.country_name,o.price_cents,o.state,o.phone,o.expires_at,o.created_at,o.provider_id is not null has_provider,p.nome,p.email
 from public.astros_sms_orders o join public.painel_de_desbanimento p on p.id=o.user_id
 where o.state='review' or (o.state='dispatching' and o.created_at<now()-interval '90 seconds') or (o.state='pending' and o.expires_at<=now()))
 select jsonb_build_object('from',date_from,'until',date_until,'generatedAt',now(),'total',t.total,'received',t.received,'refunded',t.refunded,'open',t.open_count,
 'salesCents',t.sales,'returnedCents',t.returned,'knownCostCents',t.cost,'estimatedGainCents',t.gain,'missingCostCount',t.missing,
 'attentionCount',(select count(*) from attention),
 'queue',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'service',q.service_name,'country',q.country_name,'priceCents',q.price_cents,'state',q.state,'phone',q.phone,'expiresAt',q.expires_at,'createdAt',q.created_at,'hasProvider',q.has_provider,'name',q.nome,'email',q.email) order by q.created_at,q.id),'[]'::jsonb) from (select * from attention order by created_at,id limit 20) q)) into result from totals t;
 return result;
end;$$;
revoke all on function public.astros_sms_dashboard(uuid,date,date),public.astros_sms_pause(uuid) from public,anon,authenticated;
grant execute on function public.astros_sms_dashboard(uuid,date,date),public.astros_sms_pause(uuid) to service_role;
commit;
