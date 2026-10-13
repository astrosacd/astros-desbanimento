begin;
alter table public.astros_payment_settings add column if not exists public_key text not null default '';
alter table public.astros_payment_orders add column if not exists card_mode text not null default 'link' check(card_mode in ('link','embedded'));
alter table public.astros_payment_orders add column if not exists card_fingerprint text;
create or replace function public.astros_claim_card_payment(order_id uuid,fingerprint text) returns boolean
language plpgsql security definer set search_path='' as $$
declare o public.astros_payment_orders;
begin
 if fingerprint is null or fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Tentativa inválida'; end if;
 select * into o from public.astros_payment_orders where id=order_id for update;
 if not found or o.method<>'card' or o.card_mode<>'embedded' then raise exception 'Recarga inválida'; end if;
 if o.mp_payment_id is not null then return false; end if;
 if o.card_fingerprint is not null and o.card_fingerprint<>fingerprint then raise exception 'Esta recarga já possui uma tentativa de cartão. Confira o pagamento antes de tentar novamente.'; end if;
 update public.astros_payment_orders set card_fingerprint=fingerprint where id=order_id;
 return true;
end $$;
revoke all on function public.astros_claim_card_payment(uuid,text) from public,anon,authenticated;
grant execute on function public.astros_claim_card_payment(uuid,text) to service_role;
commit;
