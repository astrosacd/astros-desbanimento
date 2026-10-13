begin;
create table if not exists public.astros_manual_credits (
 id uuid primary key,
 user_id uuid not null references public.painel_de_desbanimento(id),
 admin_id uuid not null references public.painel_de_desbanimento(id),
 amount_cents bigint not null check(amount_cents between 1 and 1000000),
 reason text not null check(length(btrim(reason)) between 3 and 500),
 balance_before_cents bigint not null,
 balance_after_cents bigint not null,
 created_at timestamptz not null default now()
);
alter table public.astros_manual_credits enable row level security;
revoke all on public.astros_manual_credits from anon,authenticated;
grant select on public.astros_manual_credits to authenticated;
drop policy if exists astros_manual_credit_admin_read on public.astros_manual_credits;
create policy astros_manual_credit_admin_read on public.astros_manual_credits for select to authenticated using(public.astros_is_admin());
create or replace function public.astros_credit_client(request_id uuid,client_id uuid,credit_cents bigint,description text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); old public.astros_manual_credits; current_balance numeric; before_cents bigint; after_cents bigint; user_type text;
begin
 if actor is null or not public.astros_is_admin() then raise exception 'Acesso administrativo necessário'; end if;
 if request_id is null or client_id is null or credit_cents is null or credit_cents not between 1 and 1000000 or description is null or length(btrim(description)) not between 3 and 500 then raise exception 'Dados do lançamento inválidos'; end if;
 select recarga,tipo_usuario into current_balance,user_type from public.painel_de_desbanimento where id=client_id for update;
 if not found or user_type is null or user_type not in ('cliente','admin') then raise exception 'Cliente não encontrado'; end if;
 select * into old from public.astros_manual_credits where id=request_id;
 if found then
  if old.user_id<>client_id or old.admin_id<>actor or old.amount_cents<>credit_cents or old.reason<>btrim(description) then raise exception 'Referência já utilizada com dados diferentes'; end if;
  return jsonb_build_object('success',true,'balanceCents',round(coalesce(current_balance,0)*100),'amountCents',old.amount_cents,'repeated',true);
 end if;
 before_cents:=round(coalesce(current_balance,0)*100);after_cents:=before_cents+credit_cents;
 insert into public.astros_manual_credits(id,user_id,admin_id,amount_cents,reason,balance_before_cents,balance_after_cents) values(request_id,client_id,actor,credit_cents,btrim(description),before_cents,after_cents);
 insert into public.astros_wallet_movements(user_id,amount_cents,kind,reference) values(client_id,credit_cents,'credit','manual:'||request_id::text);
 update public.painel_de_desbanimento set recarga=after_cents/100.0 where id=client_id;
 return jsonb_build_object('success',true,'balanceCents',after_cents,'amountCents',credit_cents,'repeated',false);
end $$;
revoke all on function public.astros_credit_client(uuid,uuid,bigint,text) from public,anon;
grant execute on function public.astros_credit_client(uuid,uuid,bigint,text) to authenticated;
commit;
