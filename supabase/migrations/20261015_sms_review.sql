-- Auditoria e conciliação administrativa. Não cria cobrança, compra ou estorno livre.
begin;
create table if not exists public.astros_sms_review_actions(
 id uuid primary key,actor_id uuid not null,order_id uuid not null references public.astros_sms_orders(id),
 operation text not null check(operation in ('check','cancel','note')),reason text not null check(length(reason) between 10 and 500),
 state text not null default 'processing' check(state in ('processing','completed','uncertain')),
 previous_state text not null,result_state text,result text not null default '',created_at timestamptz not null default now(),finished_at timestamptz
);
create index if not exists astros_sms_review_order on public.astros_sms_review_actions(order_id,created_at desc);
create unique index if not exists astros_sms_review_cancel_pending on public.astros_sms_review_actions(order_id) where operation='cancel' and state in ('processing','uncertain');
alter table public.astros_sms_review_actions enable row level security;
revoke all on public.astros_sms_review_actions from public,anon,authenticated;
grant all on public.astros_sms_review_actions to service_role;
create or replace function public.astros_sms_review_begin(actor uuid,action_id uuid,request_id uuid,mode text,note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.astros_sms_orders;a public.astros_sms_review_actions;
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso não autorizado';end if;
 if mode not in ('check','cancel','note') or length(trim(note)) not between 10 and 500 then raise exception 'Informe uma justificativa válida';end if;
 select * into o from public.astros_sms_orders where id=request_id for update;
 if not found then raise exception 'Ativação não encontrada';end if;
 select * into a from public.astros_sms_review_actions where id=action_id;
 if found then
  if a.actor_id<>actor or a.order_id<>request_id or a.operation<>mode or a.reason<>trim(note) then raise exception 'Referência divergente';end if;
  return jsonb_build_object('execute',false,'state',a.state);
 end if;
 if mode<>'note' and (o.provider_id is null or o.state in ('received','refunded')) then raise exception 'Não há confirmação do fornecedor para esta ação';end if;
 if mode='cancel' and exists(select 1 from public.astros_sms_review_actions where order_id=request_id and operation='cancel' and state in ('processing','uncertain')) then raise exception 'Um cancelamento já aguarda confirmação. Consulte o fornecedor sem repetir o cancelamento';end if;
 insert into public.astros_sms_review_actions(id,actor_id,order_id,operation,reason,previous_state) values(action_id,actor,request_id,mode,trim(note),o.state);
 return jsonb_build_object('execute',true,'state','processing');
end;$$;
create or replace function public.astros_sms_review_finish(actor uuid,action_id uuid,target text,expected_provider text,code_value text default null,outcome text default 'checked') returns void
language plpgsql security definer set search_path='' as $$
declare a public.astros_sms_review_actions;o public.astros_sms_orders;
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso não autorizado';end if;
 select * into a from public.astros_sms_review_actions where id=action_id;
 if not found or a.actor_id<>actor then raise exception 'Ação indisponível';end if;
 -- Keep the same order -> action lock order as begin.
 select * into o from public.astros_sms_orders where id=a.order_id for update;
 select * into a from public.astros_sms_review_actions where id=action_id for update;
 if a.state<>'processing' then return;end if;
 if outcome not in ('checked','cancel_confirmed','cancel_not_confirmed','noted','unconfirmed') then raise exception 'Resultado inválido';end if;
 if outcome='unconfirmed' then
  update public.astros_sms_review_actions set state='uncertain',result='unconfirmed',result_state=o.state,finished_at=now() where id=action_id;return;
 end if;
 if a.operation='note' then
  if target<>'note' or outcome<>'noted' then raise exception 'Resultado inválido';end if;
 else
  if o.provider_id is null or o.provider_id is distinct from expected_provider then raise exception 'Fornecedor divergente';end if;
  if target not in ('pending','received','refunded','review') then raise exception 'Estado inválido';end if;
  if target='received' and (length(coalesce(code_value,'')) not between 1 and 200) then raise exception 'Código não confirmado';end if;
  perform public.astros_sms_settle(o.id,target,null,null,code_value,null);
 end if;
 update public.astros_sms_review_actions set state='completed',result=outcome,result_state=(select state from public.astros_sms_orders where id=a.order_id),finished_at=now() where id=action_id;
end;$$;
revoke all on function public.astros_sms_review_begin(uuid,uuid,uuid,text,text),public.astros_sms_review_finish(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.astros_sms_review_begin(uuid,uuid,uuid,text,text),public.astros_sms_review_finish(uuid,uuid,text,text,text,text) to service_role;
-- Safely release an unstarted quote before starting another attempt after a network error.
create or replace function public.astros_sms_release_quote(actor uuid,request_id uuid,quote uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.astros_sms_orders;
begin
 perform 1 from public.painel_de_desbanimento where id=actor for update;
 if not found then raise exception 'Conta indisponível';end if;
 select * into o from public.astros_sms_orders where id=request_id;
 if found then
  if o.user_id<>actor or o.quote_id<>quote then raise exception 'Referência divergente';end if;
  return jsonb_build_object('released',false);
 end if;
 if not exists(select 1 from public.astros_sms_quotes where id=quote and user_id=actor) then raise exception 'Cotação indisponível';end if;
 update public.astros_sms_quotes set expires_at='1970-01-01T00:00:00Z' where id=quote and user_id=actor;
 return jsonb_build_object('released',true);
end;$$;
revoke all on function public.astros_sms_release_quote(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.astros_sms_release_quote(uuid,uuid,uuid) to service_role;
commit;
