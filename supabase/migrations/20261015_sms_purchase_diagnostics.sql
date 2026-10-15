-- One private, bounded diagnostic per existing SMS order; never stores credentials/payloads.
begin;
create table if not exists public.astros_sms_purchase_diagnostics(
 order_id uuid primary key references public.astros_sms_orders(id),
 category text not null check(category in ('OUT_OF_STOCK','PRICE_NOT_FOUND','BALANCE_ERROR','PARAMETER_ERROR','AUTH_ERROR','RATE_LIMITED','PROVIDER_REJECTED','TRANSPORT_UNCONFIRMED','RESPONSE_UNCONFIRMED')),
 http_status integer check(http_status between 100 and 599),
 detail text not null default '' check(length(detail)<=400),
 created_at timestamptz not null default now()
);
alter table public.astros_sms_purchase_diagnostics enable row level security;
revoke all on public.astros_sms_purchase_diagnostics from public,anon,authenticated;
grant all on public.astros_sms_purchase_diagnostics to service_role;
create or replace function public.astros_sms_record_purchase_diagnostic(request_id uuid,kind text,status_code integer,detail_text text) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into public.astros_sms_purchase_diagnostics(order_id,category,http_status,detail)
 values(request_id,kind,status_code,detail_text) on conflict(order_id) do nothing;
end;$$;
revoke all on function public.astros_sms_record_purchase_diagnostic(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.astros_sms_record_purchase_diagnostic(uuid,text,integer,text) to service_role;
commit;
