begin;
alter table public.astros_manual_credits add column if not exists reversed_at timestamptz;
alter table public.astros_manual_credits add column if not exists reversed_by uuid references public.painel_de_desbanimento(id);
alter table public.astros_manual_credits add column if not exists reversal_reason text;
create or replace function public.astros_reverse_manual_credit(credit_id uuid,description text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); entry public.astros_manual_credits; current_balance numeric; balance_cents bigint;
begin
 if actor is null or not public.astros_is_admin() then raise exception 'Acesso administrativo necessário'; end if;
 if credit_id is null or description is null or length(btrim(description)) not between 3 and 500 then raise exception 'Informe o motivo do estorno'; end if;
 select * into entry from public.astros_manual_credits where id=credit_id;
 if not found then raise exception 'Crédito não encontrado'; end if;
 -- Same lock order as credits: profile first, then audit.
 select recarga into current_balance from public.painel_de_desbanimento where id=entry.user_id for update;
 if not found then raise exception 'Conta não encontrada'; end if;
 select * into entry from public.astros_manual_credits where id=credit_id for update;
 balance_cents:=round(coalesce(current_balance,0)*100);
 if entry.reversed_at is not null then return jsonb_build_object('success',true,'balanceCents',balance_cents,'repeated',true); end if;
 if balance_cents<entry.amount_cents then raise exception 'Saldo insuficiente para estornar este crédito'; end if;
 insert into public.astros_wallet_movements(user_id,amount_cents,kind,reference) values(entry.user_id,-entry.amount_cents,'reversal','manual-reversal:'||credit_id::text);
 update public.painel_de_desbanimento set recarga=(balance_cents-entry.amount_cents)/100.0 where id=entry.user_id;
 update public.astros_manual_credits set reversed_at=now(),reversed_by=actor,reversal_reason=btrim(description) where id=credit_id;
 return jsonb_build_object('success',true,'balanceCents',balance_cents-entry.amount_cents,'repeated',false);
end $$;
revoke all on function public.astros_reverse_manual_credit(uuid,text) from public,anon;
grant execute on function public.astros_reverse_manual_credit(uuid,text) to authenticated;
commit;
