-- Run after digital_research.sql. Add only digital research to the current financial report.
begin;
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
  case when m.reference like 'digital:%' and m.kind='debit' then 'digital_debit'
       when m.reference like 'digital-refund:%' and m.kind='reversal' then 'digital_refund'
       when m.reference like 'affiliate:%' and m.kind='credit' then 'affiliate_credit'
       when m.reference like 'affiliate-refund:%' and m.kind='reversal' then 'affiliate_reversal'
       when m.reference like 'prospect:%' then 'prospect_debit'
       when m.reference like 'social:%' then 'social_debit'
       when m.reference like 'social-refund:%' then 'social_refund'
       when m.reference like 'sms:%' then 'sms_debit'
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
   coalesce(-sum(amount_cents) filter(where category='social_debit'),0) social_debits,
   coalesce(sum(amount_cents) filter(where category='social_refund'),0) social_refunds,
   coalesce(-sum(amount_cents) filter(where category='prospect_debit'),0) prospect_debits,
   coalesce(sum(amount_cents) filter(where category='affiliate_credit'),0) affiliate_credits,
   coalesce(-sum(amount_cents) filter(where category='affiliate_reversal'),0) affiliate_reversals,
   coalesce(-sum(amount_cents) filter(where category='digital_debit'),0) digital_debits,
   coalesce(sum(amount_cents) filter(where category='digital_refund'),0) digital_refunds,
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
 ), social_jobs as (
  select count(*) filter(where state in ('completed','partial')) completed_count,
   coalesce(sum(price_cents-refund_cents) filter(where state in ('completed','partial')),0) completed_sales,
   coalesce(sum(price_cents) filter(where state in ('dispatching','pending','processing','review')),0) open_cents,
   coalesce(sum(ceil(actual_cost_units::numeric*fx_units/100000000)) filter(where state in ('completed','partial') and actual_cost_units is not null),0) known_cost,
   coalesce(sum(price_cents-refund_cents-ceil(actual_cost_units::numeric*fx_units/100000000)) filter(where state in ('completed','partial') and actual_cost_units is not null),0) known_gain,
   count(*) filter(where state in ('completed','partial') and actual_cost_units is null) missing_cost_count
  from public.astros_social_orders where created_at>=start_at and created_at<end_at
 ), prospect_jobs as (
  select count(*) filter(where state='completed') completed_count,coalesce(sum(charged_cents) filter(where state='completed'),0) completed_sales,coalesce(sum(delivered) filter(where state='completed'),0) delivered from (select state,charged_cents,delivered,created_at from public.astros_prospect_requests union all select state,charged_cents,delivered,created_at from public.astros_cnpj_requests) operations where created_at>=start_at and created_at<end_at
 ), digital_jobs as (
  select count(*) filter(where state='completed') completed_count,coalesce(sum(charged_cents) filter(where state='completed'),0) completed_sales,coalesce(sum(delivered) filter(where state='completed'),0) delivered,coalesce(sum(reserved_cents) filter(where state in ('dispatching','running','review')),0) open_cents from public.astros_digital_requests where created_at>=start_at and created_at<end_at
 ), daily as (
  select (m.created_at at time zone 'America/Fortaleza')::date as day_bucket,
   coalesce(sum(amount_cents) filter(where category='payment_credit'),0) received,
   coalesce(-sum(amount_cents) filter(where category in ('service_debit','sms_debit','social_debit','prospect_debit','digital_debit')),0) consumed,
   coalesce(sum(amount_cents) filter(where category in ('service_refund','sms_refund','social_refund','digital_refund')),0) returned
  from classified m group by 1
 )
 select jsonb_build_object(
  'from',date_from,'until',date_until,'generatedAt',now(),
  'receivedCents',t.received,'paymentRefundsCents',t.payment_refunds,'netReceiptsCents',t.received-t.payment_refunds,
  'manualCreditsCents',t.manual_credits,'manualReversalsCents',t.manual_reversals,'unclassifiedCount',t.other_count,
  'affiliate',jsonb_build_object('creditedCents',t.affiliate_credits,'reversedCents',t.affiliate_reversals,'netCents',t.affiliate_credits-t.affiliate_reversals),
  'currentBalanceCents',(select coalesce(sum(round(coalesce(recarga,0)*100)),0) from public.painel_de_desbanimento),
  'desban',jsonb_build_object('debitsCents',t.service_debits,'refundsCents',t.service_refunds,'netCents',t.service_debits-t.service_refunds,'paidCount',j.paid_count,'freeCount',j.free_count,'completedSalesCents',j.completed_sales,'openCents',j.open_cents),
  'sms',jsonb_build_object('debitsCents',t.sms_debits,'refundsCents',t.sms_refunds,'netCents',t.sms_debits-t.sms_refunds,'completedCount',s.completed_count,'openCents',s.open_cents,'completedSalesCents',s.completed_sales,'knownCostCents',s.known_cost,'knownGainCents',s.known_gain,'missingCostCount',s.missing_cost_count),
  'social',jsonb_build_object('debitsCents',t.social_debits,'refundsCents',t.social_refunds,'netCents',t.social_debits-t.social_refunds,'completedCount',so.completed_count,'openCents',so.open_cents,'completedSalesCents',so.completed_sales,'knownCostCents',so.known_cost,'knownGainCents',so.known_gain,'missingCostCount',so.missing_cost_count),
  'prospect',jsonb_build_object('debitsCents',t.prospect_debits,'netCents',t.prospect_debits,'completedCount',pr.completed_count,'completedSalesCents',pr.completed_sales,'deliveredCount',pr.delivered),
  'digital',jsonb_build_object('debitsCents',t.digital_debits,'refundsCents',t.digital_refunds,'netCents',t.digital_debits-t.digital_refunds,'completedCount',di.completed_count,'completedSalesCents',di.completed_sales,'deliveredCount',di.delivered,'openCents',di.open_cents),
  'daily',(select coalesce(jsonb_agg(jsonb_build_object('date',days.day_bucket::date,'receivedCents',coalesce(d.received,0),'consumedCents',coalesce(d.consumed,0),'returnedCents',coalesce(d.returned,0)) order by days.day_bucket),'[]'::jsonb) from generate_series(date_from::timestamp,date_until::timestamp,interval '1 day') days(day_bucket) left join daily d on d.day_bucket=days.day_bucket::date)
 ) into result from totals t cross join service_jobs j cross join sms_jobs s cross join social_jobs so cross join prospect_jobs pr cross join digital_jobs di;
 return result;
end;$$;
revoke all on function public.astros_financial_dashboard(date,date) from public,anon,authenticated;
grant execute on function public.astros_financial_dashboard(date,date) to authenticated;
create or replace function public.astros_digital_finance_ready() returns boolean language sql immutable set search_path='' as $$select true$$;
revoke all on function public.astros_digital_finance_ready() from public,anon,authenticated;
grant execute on function public.astros_digital_finance_ready() to service_role;
commit;
