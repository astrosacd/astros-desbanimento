-- Carteira Astros. Preserva os valores existentes; recarga é expressa em reais.
begin;
alter table public.painel_de_desbanimento alter column recarga type numeric(14,2) using recarga::numeric;
create table if not exists public.astros_payment_settings (
 id boolean primary key default true check (id), access_token text not null default '', webhook_secret text not null default '',
 enabled boolean not null default false, live_mode boolean not null default false, collector_id text not null default '',
 service_price_cents bigint not null default 0 check (service_price_cents >= 0), updated_at timestamptz not null default now()
);
alter table public.astros_payment_settings enable row level security;
revoke all on public.astros_payment_settings from anon, authenticated;
grant all on public.astros_payment_settings to service_role;
insert into public.astros_payment_settings(id) values (true) on conflict do nothing;
create table if not exists public.astros_payment_orders (
 id uuid primary key, user_id uuid not null references public.painel_de_desbanimento(id), amount_cents bigint not null check (amount_cents between 500 and 1000000),
 method text not null check(method in ('pix','card')), live_mode boolean not null, status text not null default 'creating', mp_payment_id text unique,
 qr_code text, qr_base64 text, checkout_url text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.astros_wallet_movements (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.painel_de_desbanimento(id),
 amount_cents bigint not null, kind text not null check(kind in ('credit','reversal','debit')), reference text not null,
 created_at timestamptz not null default now(), unique(kind,reference)
);
alter table public.astros_payment_orders enable row level security;
alter table public.astros_wallet_movements enable row level security;
revoke all on public.astros_payment_orders, public.astros_wallet_movements from anon, authenticated;
grant all on public.astros_payment_orders, public.astros_wallet_movements to service_role;
grant select on public.astros_payment_orders, public.astros_wallet_movements to authenticated;
create policy astros_orders_read on public.astros_payment_orders for select to authenticated using(user_id = auth.uid() or public.astros_is_admin());
create policy astros_movements_read on public.astros_wallet_movements for select to authenticated using(user_id = auth.uid() or public.astros_is_admin());
-- Apenas a função do servidor chama isto, depois de consultar o pagamento no Mercado Pago.
create or replace function public.astros_apply_payment(order_id uuid, payment_id text, payment_status text, paid_cents bigint, refunded_cents bigint default 0) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.astros_payment_orders; inserted uuid; reversed bigint; target_refund bigint;
begin
 select * into o from public.astros_payment_orders where id=order_id for update;
 if not found or o.amount_cents<>paid_cents then raise exception 'Pagamento divergente'; end if;
 if o.mp_payment_id is not null and o.mp_payment_id<>payment_id then raise exception 'Pagamento já vinculado'; end if;
 if payment_status='approved' then
  insert into public.astros_wallet_movements(user_id,amount_cents,kind,reference) values(o.user_id,paid_cents,'credit',payment_id)
  on conflict(kind,reference) do nothing returning id into inserted;
  if inserted is not null then update public.painel_de_desbanimento set recarga=coalesce(recarga,0)+paid_cents/100.0 where id=o.user_id; end if;
 end if;
 target_refund=case when payment_status in ('refunded','charged_back') then paid_cents else refunded_cents end;
 if target_refund<0 or target_refund>paid_cents then raise exception 'Estorno divergente'; end if;
 if target_refund>0 and exists(select 1 from public.astros_wallet_movements where kind='credit' and reference=payment_id) then
  select coalesce(-sum(amount_cents),0) into reversed from public.astros_wallet_movements where kind='reversal' and reference like payment_id||':%';
  if target_refund>reversed then
   insert into public.astros_wallet_movements(user_id,amount_cents,kind,reference) values(o.user_id,-(target_refund-reversed),'reversal',payment_id||':'||target_refund::text);
   update public.painel_de_desbanimento set recarga=coalesce(recarga,0)-(target_refund-reversed)/100.0 where id=o.user_id;
  end if;
 end if;
 -- Não vincula tentativas recusadas de cartão, que podem ser refeitas no checkout.
 update public.astros_payment_orders set status=payment_status, mp_payment_id=case when payment_status in ('approved','refunded','charged_back') or method='pix' then payment_id else mp_payment_id end, updated_at=now() where id=order_id;
end;
$$;
revoke all on function public.astros_apply_payment(uuid,text,text,bigint,bigint) from public, anon, authenticated;
grant execute on function public.astros_apply_payment(uuid,text,text,bigint,bigint) to service_role;
-- Preparado para a contratação do serviço: débito atômico, saldo suficiente e referência única.
create or replace function public.astros_debit_wallet(client_id uuid, cost_cents bigint, service_reference text) returns void
language plpgsql security definer set search_path = '' as $$
declare balance numeric; old_row public.astros_wallet_movements;
begin
 if cost_cents<=0 or length(service_reference)<1 then raise exception 'Débito inválido'; end if;
 select recarga into balance from public.painel_de_desbanimento where id=client_id for update;
 if not found then raise exception 'Conta não encontrada'; end if;
 select * into old_row from public.astros_wallet_movements where kind='debit' and reference=service_reference;
 if found then
  if old_row.user_id<>client_id or old_row.amount_cents<>-cost_cents then raise exception 'Referência divergente'; end if;
  return;
 end if;
 if coalesce(balance,0)*100<cost_cents then raise exception 'Saldo insuficiente'; end if;
 insert into public.astros_wallet_movements(user_id,amount_cents,kind,reference) values(client_id,-cost_cents,'debit',service_reference);
 update public.painel_de_desbanimento set recarga=coalesce(recarga,0)-cost_cents/100.0 where id=client_id;
end;
$$;
revoke all on function public.astros_debit_wallet(uuid,bigint,text) from public, anon, authenticated;
grant execute on function public.astros_debit_wallet(uuid,bigint,text) to service_role;
commit;
