-- Complemento: taxa global e mínimo opcional de recarga. Execute uma vez.
begin;
alter table public.astros_payment_settings add column if not exists minimum_enabled boolean not null default true;
alter table public.astros_payment_settings add column if not exists minimum_recharge_cents bigint not null default 500 check(minimum_recharge_cents between 0 and 1000000);
alter table public.astros_payment_orders drop constraint if exists astros_payment_orders_amount_cents_check;
alter table public.astros_payment_orders add constraint astros_payment_orders_amount_cents_check check(amount_cents between 1 and 1000000);
-- Clientes recebem apenas valores públicos, nunca as credenciais.
create or replace function public.astros_payment_prices() returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('servicePriceCents',service_price_cents,'minimumEnabled',minimum_enabled,'minimumRechargeCents',minimum_recharge_cents)
 from public.astros_payment_settings where id=true and auth.uid() is not null;
$$;
revoke all on function public.astros_payment_prices() from public,anon;
grant execute on function public.astros_payment_prices() to authenticated;
-- Para a contratação efetiva: a taxa é sempre a configuração do admin.
create or replace function public.astros_charge_service(client_id uuid, service_reference text, expected_price_cents bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare price bigint;
begin
 select service_price_cents into price from public.astros_payment_settings where id=true for share;
 if price is null or price<=0 then raise exception 'Taxa do serviço não configurada'; end if;
 if price<>expected_price_cents then raise exception 'A taxa mudou. Confira o novo valor antes de contratar.'; end if;
 perform public.astros_debit_wallet(client_id,price,service_reference);
end;
$$;
revoke all on function public.astros_charge_service(uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.astros_charge_service(uuid,text,bigint) to service_role;
commit;
