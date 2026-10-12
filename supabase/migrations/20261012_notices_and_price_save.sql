-- Complemento único: persistência de valores e avisos configuráveis.
begin;
alter table public.astros_payment_settings add column if not exists minimum_enabled boolean not null default true;
alter table public.astros_payment_settings add column if not exists minimum_recharge_cents bigint not null default 500 check(minimum_recharge_cents between 0 and 1000000);
alter table public.astros_payment_orders drop constraint if exists astros_payment_orders_amount_cents_check;
alter table public.astros_payment_orders add constraint astros_payment_orders_amount_cents_check check(amount_cents between 1 and 1000000);
create or replace function public.astros_payment_prices() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('servicePriceCents',service_price_cents,'minimumEnabled',minimum_enabled,'minimumRechargeCents',minimum_recharge_cents) from public.astros_payment_settings where id=true and auth.uid() is not null;
$$;
revoke all on function public.astros_payment_prices() from public,anon;
grant execute on function public.astros_payment_prices() to authenticated;
create or replace function public.astros_save_prices(price_cents bigint, minimum_on boolean, minimum_cents bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.astros_is_admin() then raise exception 'Acesso administrativo não autorizado'; end if;
 if price_cents is null or price_cents<0 or price_cents>1000000 or minimum_on is null or minimum_cents is null or minimum_cents<0 or minimum_cents>1000000 or (minimum_on and minimum_cents<1) then raise exception 'Valores inválidos'; end if;
 update public.astros_payment_settings set service_price_cents=price_cents,minimum_enabled=minimum_on,minimum_recharge_cents=minimum_cents,updated_at=now() where id=true;
 if not found then raise exception 'Configurações não encontradas'; end if;
 return public.astros_payment_prices();
end;
$$;
revoke all on function public.astros_save_prices(bigint,boolean,bigint) from public,anon;
grant execute on function public.astros_save_prices(bigint,boolean,bigint) to authenticated;
create table if not exists public.astros_client_notice (
 id boolean primary key default true check(id), title text not null default '', body text not null default '', button_label text not null default '', button_url text not null default '',
 enabled boolean not null default false, version uuid not null default gen_random_uuid(), updated_at timestamptz not null default now(),
 check(length(title)<=120 and length(body)<=3000 and length(button_label)<=80 and length(button_url)<=2048),
 check(button_url='' or button_url ~ '^https://[^[:space:]]+$')
);
alter table public.astros_client_notice enable row level security;
revoke all on public.astros_client_notice from anon,authenticated;
grant select,insert,update on public.astros_client_notice to authenticated;
create policy astros_notice_read on public.astros_client_notice for select to authenticated using(enabled or public.astros_is_admin());
create policy astros_notice_insert on public.astros_client_notice for insert to authenticated with check(public.astros_is_admin());
create policy astros_notice_update on public.astros_client_notice for update to authenticated using(public.astros_is_admin()) with check(public.astros_is_admin());
insert into public.astros_client_notice(id) values(true) on conflict do nothing;
commit;
