-- Dashboard administrativo: somente leitura dos registros financeiros existentes.
begin;
alter table public.astros_sms_orders add column if not exists estimated_cost_cents bigint check(estimated_cost_cents>=0);
-- Preserva o custo estimado na cotação da compra; não reavalia pedidos antigos.
create or replace function public.astros_sms_snapshot_cost() returns trigger
language plpgsql security definer set search_path='' as $$
declare fx bigint;
begin
 select usd_brl_units into fx from public.astros_sms_settings where id=true;
 if fx>0 then new.estimated_cost_cents=ceil(new.usd_units::numeric*fx/100000000)::bigint;end if;
 return new;
end;$$;
revoke all on function public.astros_sms_snapshot_cost() from public,anon,authenticated;
drop trigger if exists astros_sms_snapshot_cost on public.astros_sms_orders;
create trigger astros_sms_snapshot_cost before insert on public.astros_sms_orders for each row execute function public.astros_sms_snapshot_cost();
create index if not exists astros_wallet_movements_created on public.astros_wallet_movements(created_at);
create index if not exists astros_service_jobs_created on public.astros_service_jobs(created_at);
create index if not exists astros_sms_orders_created on public.astros_sms_orders(created_at);
create or replace function public.astros_financial_dashboard(date_from date,date_until date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare start_at timestamptz;end_at timestamptz;result jsonb;
begin
 if public.astros_is_admin() is not true then raise exception 'Acesso restrito à administração';end if;
 if date_from is null or date_until is null or date_until<date_from or date_until-date_from>365 then raise exception 'Escolha um período de até 366 dias';end if;
 start_at=date_from::timestamp at time zone 'America/Fortaleza';
 end_at=(date_until+1)::timestamp at time zone 'America/Fortaleza';
 with movements as materialized (
  select m.* from public.astros_wallet_movements m where m.created_at>=start_at and m.created_at<end_at
 ), classified as materialized (
  select m.*,
  case when m.reference like 'sms:%' then 'sms_debit'
       when m.reference like 'sms-refund:%' then 'sms_refund'
       when m.reference like 'service:%' and m.kind='debit' then 'service_debit'
       when m.reference like 'service:%' and m.kind='reversal' then 'service_refund'
       when m.reference like 'manual:%' and m.kind='credit' then 'manual_credit'
       when m.reference like 'manual-reversal:%' and m.kind='reversal' then 'manual_reversal'
       when m.kind='credit' and exists(select 1 from public.astros_payment_orders p where p.mp_payment_id=m.reference and p.user_id=m.user_id and p.live_mode) then 'payment_credit'
       when m.kind='reversal' and exists(select 1 from public.astros_payment_orders p where p.mp_payment_id=split_part(m.reference,':',1) and p.user_id=m.user_id and p.live_mode) then 'payment_refund'
       else 'other' end category
  from movements m
 ), totals as (
  select coalesce(sum(amount_cents) filter(where category='payment_credit'),0) received,
   coalesce(-sum(amount_cents) filter(where category='payment_refund'),0) payment_refunds,
   coalesce(sum(amount_cents) filter(where category='manual_credit'),0) manual_credits,
   coalesce(-sum(amount_cents) filter(where category='manual_reversal'),0) manual_reversals,
   coalesce(-sum(amount_cents) filter(where category='service_debit'),0) service_debits,
   coalesce(sum(amount_cents) filter(where category='service_refund'),0) service_refunds,
   coalesce(-sum(amount_cents) filter(where category='sms_debit'),0) sms_debits,
   coalesce(sum(amount_cents) filter(where category='sms_refund'),0) sms_refunds,
   count(*) filter(where category='other') other_count
  from classified
 ), service_jobs as (
  select count(*) filter(where state='completed' and amount_cents>0) paid_count,
   count(*) filter(where state='completed' and amount_cents=0) free_count,
   coalesce(sum(amount_cents) filter(where state='completed'),0) completed_sales,
   coalesce(sum(amount_cents) filter(where state in ('processing','review')),0) open_cents
  from public.astros_service_jobs where created_at>=start_at and created_at<end_at
 ), sms_jobs as (
  select count(*) filter(where state='received') completed_count,
   coalesce(sum(price_cents) filter(where state in ('dispatching','pending','review')),0) open_cents,
   coalesce(sum(price_cents) filter(where state='received'),0) completed_sales,
   coalesce(sum(estimated_cost_cents) filter(where state='received' and estimated_cost_cents is not null),0) known_cost,
   coalesce(sum(price_cents-estimated_cost_cents) filter(where state='received' and estimated_cost_cents is not null),0) known_gain,
   count(*) filter(where state='received' and estimated_cost_cents is null) missing_cost_count
  from public.astros_sms_orders where created_at>=start_at and created_at<end_at
 ), daily as (
  select (m.created_at at time zone 'America/Fortaleza')::date as day_bucket,
   coalesce(sum(amount_cents) filter(where category='payment_credit'),0) received,
   coalesce(-sum(amount_cents) filter(where category in ('service_debit','sms_debit')),0) consumed,
   coalesce(sum(amount_cents) filter(where category in ('service_refund','sms_refund')),0) returned
  from classified m group by 1
 )
 select jsonb_build_object(
  'from',date_from,'until',date_until,'generatedAt',now(),
  'receivedCents',t.received,'paymentRefundsCents',t.payment_refunds,'netReceiptsCents',t.received-t.payment_refunds,
  'manualCreditsCents',t.manual_credits,'manualReversalsCents',t.manual_reversals,'unclassifiedCount',t.other_count,
  'currentBalanceCents',(select coalesce(sum(round(coalesce(recarga,0)*100)),0) from public.painel_de_desbanimento),
  'desban',jsonb_build_object('debitsCents',t.service_debits,'refundsCents',t.service_refunds,'netCents',t.service_debits-t.service_refunds,'paidCount',j.paid_count,'freeCount',j.free_count,'completedSalesCents',j.completed_sales,'openCents',j.open_cents),
  'sms',jsonb_build_object('debitsCents',t.sms_debits,'refundsCents',t.sms_refunds,'netCents',t.sms_debits-t.sms_refunds,'completedCount',s.completed_count,'openCents',s.open_cents,'completedSalesCents',s.completed_sales,'knownCostCents',s.known_cost,'knownGainCents',s.known_gain,'missingCostCount',s.missing_cost_count),
  'daily',(select coalesce(jsonb_agg(jsonb_build_object('date',days.day_bucket::date,'receivedCents',coalesce(d.received,0),'consumedCents',coalesce(d.consumed,0),'returnedCents',coalesce(d.returned,0)) order by days.day_bucket),'[]'::jsonb) from generate_series(date_from::timestamp,date_until::timestamp,interval '1 day') days(day_bucket) left join daily d on d.day_bucket=days.day_bucket::date)
 ) into result from totals t cross join service_jobs j cross join sms_jobs s;
 return result;
end;$$;
revoke all on function public.astros_financial_dashboard(date,date) from public,anon,authenticated;
grant execute on function public.astros_financial_dashboard(date,date) to authenticated;
commit;
