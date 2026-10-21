-- Manual routing: preserve SMSPool, all historical orders and the shared wallet.
begin;
alter table public.astros_sms_settings add column if not exists active_supplier text not null default 'smspool' check(active_supplier in ('smspool','five_sim'));
alter table public.astros_sms_private add column if not exists five_sim_key text not null default '';
create table if not exists public.astros_sms_five_settings(
 id boolean primary key default true check(id),
 native_brl_units bigint not null default 0 check(native_brl_units between 0 and 10000000),
 margin_bps integer not null default 0 check(margin_bps between 0 and 100000),
 fee_cents bigint not null default 0 check(fee_cents between 0 and 100000),
 updated_at timestamptz not null default now()
);
insert into public.astros_sms_five_settings(id) values(true) on conflict do nothing;
alter table public.astros_sms_five_settings enable row level security;
revoke all on public.astros_sms_five_settings from public,anon,authenticated;
grant all on public.astros_sms_five_settings to service_role;
alter table public.astros_sms_quotes
 add column if not exists supplier text not null default 'smspool' check(supplier in ('smspool','five_sim')),
 add column if not exists supplier_product text,add column if not exists supplier_country text,
 add column if not exists native_units bigint,add column if not exists native_brl_units bigint;
alter table public.astros_sms_orders
 add column if not exists supplier text not null default 'smspool' check(supplier in ('smspool','five_sim')),
 add column if not exists supplier_product text,add column if not exists supplier_country text,
 add column if not exists native_units bigint,add column if not exists native_brl_units bigint;
-- Native 5SIM units are never recorded as a dollar cost.
alter table public.astros_sms_quotes drop constraint if exists astros_sms_quotes_usd_units_check;
alter table public.astros_sms_quotes drop constraint if exists astros_sms_quotes_supplier_cost;
alter table public.astros_sms_quotes add constraint astros_sms_quotes_supplier_cost check(
 (supplier='smspool' and usd_units>0) or
 (supplier='five_sim' and usd_units=0 and service_id=0 and country_id=0 and pool_id=0 and
 supplier_product ~ '^[a-z0-9]{1,80}$' and supplier_country ~ '^[a-z0-9]{1,80}$' and
 supplier_product is not null and supplier_country is not null and
 native_units is not null and native_units>0 and native_brl_units is not null and native_brl_units between 1 and 10000000));
alter table public.astros_sms_orders drop constraint if exists astros_sms_orders_provider_id_key;
create unique index if not exists astros_sms_supplier_provider on public.astros_sms_orders(supplier,provider_id);
-- Authoritative epoch/routing guards. UPDATE settlement remains independent of active supplier.
create or replace function public.astros_sms_supplier_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.astros_sms_settings;f public.astros_sms_five_settings;
begin
 if tg_op='UPDATE' then
  if (new.supplier,new.supplier_product,new.supplier_country,new.native_units,new.native_brl_units)
   is distinct from (old.supplier,old.supplier_product,old.supplier_country,old.native_units,old.native_brl_units) then raise exception 'Fornecedor imutável';end if;
  return new;
 end if;
 select * into s from public.astros_sms_settings where id=true for share;
 if new.supplier<>s.active_supplier then raise exception 'Atualize o preço antes de comprar';end if;
 if tg_table_name='astros_sms_quotes' then
  if new.settings_version<>s.updated_at then raise exception 'Atualize o preço antes de comprar';end if;
  if new.supplier='five_sim' then
   select * into f from public.astros_sms_five_settings where id=true;
   if new.native_brl_units<>f.native_brl_units or new.price_cents<>
    ceil(new.native_units::numeric*f.native_brl_units*(10000+f.margin_bps)/1000000000000)::bigint+f.fee_cents then raise exception 'Preço divergente';end if;
  end if;
 end if;
 return new;
end;$$;
drop trigger if exists astros_sms_supplier_guard on public.astros_sms_quotes;
create trigger astros_sms_supplier_guard before insert or update on public.astros_sms_quotes for each row execute function public.astros_sms_supplier_guard();
drop trigger if exists astros_sms_supplier_guard on public.astros_sms_orders;
create trigger astros_sms_supplier_guard before insert or update on public.astros_sms_orders for each row execute function public.astros_sms_supplier_guard();
-- Snapshot each new cost in the correct native unit; no historical backfill.
create or replace function public.astros_sms_snapshot_cost() returns trigger
language plpgsql security definer set search_path='' as $$
declare fx bigint;
begin
 if new.supplier='five_sim' then
  new.estimated_cost_cents=ceil(new.native_units::numeric*new.native_brl_units/100000000)::bigint;
 else
  select usd_brl_units into fx from public.astros_sms_settings where id=true;
  if fx>0 then new.estimated_cost_cents=ceil(new.usd_units::numeric*fx/100000000)::bigint;end if;
 end if;
 return new;
end;$$;
create or replace function public.astros_sms_reserve_base(actor uuid,request_id uuid,quote uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.astros_sms_quotes;o public.astros_sms_orders;s public.astros_sms_settings;b numeric;
begin
 select recarga into b from public.painel_de_desbanimento where id=actor for update;
 if not found then raise exception 'Conta indisponível';end if;
 select * into o from public.astros_sms_orders where id=request_id;
 if found then
  if o.user_id<>actor or o.quote_id<>quote then raise exception 'Referência divergente';end if;
  return jsonb_build_object('dispatch',false,'id',o.id);
 end if;
 select * into s from public.astros_sms_settings where id=true for share;
 if not s.enabled or (s.active_supplier='smspool' and s.usd_brl_units<=0) or s.worker_at is null or s.worker_at<now()-interval '3 minutes' then raise exception 'Serviço indisponível';end if;
 select * into q from public.astros_sms_quotes where id=quote and user_id=actor for update;
 if not found or q.expires_at<=now() or q.settings_version<>s.updated_at or q.supplier<>s.active_supplier then raise exception 'Atualize o preço antes de comprar';end if;
 if exists(select 1 from public.astros_sms_orders where quote_id=quote) then raise exception 'Cotação já utilizada';end if;
 if (select count(*) from public.astros_sms_orders where user_id=actor and state in ('dispatching','pending','review'))>=5 then raise exception 'Conclua suas ativações em andamento';end if;
 if b is null or b<q.price_cents/100.0 then raise exception 'Saldo insuficiente. Faça uma recarga';end if;
 insert into public.astros_sms_orders(id,user_id,quote_id,service_id,country_id,pool_id,service_name,country_name,usd_units,price_cents,state,supplier,supplier_product,supplier_country,native_units,native_brl_units)
 values(request_id,actor,q.id,q.service_id,q.country_id,q.pool_id,q.service_name,q.country_name,q.usd_units,q.price_cents,'dispatching',q.supplier,q.supplier_product,q.supplier_country,q.native_units,q.native_brl_units);
 update public.painel_de_desbanimento set recarga=recarga-q.price_cents/100.0 where id=actor;
 insert into public.astros_wallet_movements(user_id,amount_cents,kind,reference) values(actor,-q.price_cents,'debit','sms:'||request_id);
 return jsonb_build_object('dispatch',true,'id',request_id);
end;$$;

create or replace function public.astros_sms_reserve(actor uuid,request_id uuid,quote uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.astros_sms_settings;
begin
 if exists(select 1 from public.astros_sms_orders where id=request_id) then return public.astros_sms_reserve_base(actor,request_id,quote);end if;
 perform 1 from public.painel_de_desbanimento where id=actor for update;
 select * into s from public.astros_sms_settings where id=true for share;
 if s.active_supplier='smspool' and s.fx_mode='auto' and (s.fx_checked_at is null or s.fx_checked_at<now()-interval '6 hours' or s.fx_date is null or s.fx_date<current_date-7) then raise exception 'Serviço indisponível';end if;
 if s.active_supplier='five_sim' and not exists(select 1 from public.astros_sms_five_settings f,public.astros_sms_private p where f.id and p.id and f.native_brl_units>0 and p.five_sim_key<>'') then raise exception 'Serviço indisponível';end if;
 return public.astros_sms_reserve_base(actor,request_id,quote);
end;$$;
create or replace function public.astros_sms_configure(actor uuid,active boolean,fx bigint,margin integer,fee bigint,new_key text default '') returns void
language plpgsql security definer set search_path='' as $$
declare s public.astros_sms_settings;p public.astros_sms_private;
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso não autorizado';end if;
 select * into s from public.astros_sms_settings where id=true for update;
 select * into p from public.astros_sms_private where id=true for update;
 if new_key<>'' and new_key<>p.api_key and exists(select 1 from public.astros_sms_orders where supplier='smspool' and state in ('dispatching','pending','review')) then raise exception 'Conclua os pedidos antes de trocar a chave';end if;
 if active and s.active_supplier='smspool' and (coalesce(nullif(new_key,''),nullif(p.api_key,'')) is null or s.worker_at is null or s.worker_at<now()-interval '3 minutes') then raise exception 'Configure a chave e a rotina automática';end if;
 update public.astros_sms_private set api_key=coalesce(nullif(new_key,''),p.api_key),worker_secret=case when p.worker_secret='' then replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','') else p.worker_secret end where id=true;
 update public.astros_sms_settings set enabled=case when s.active_supplier='smspool' then active else s.enabled end,usd_brl_units=fx,margin_bps=margin,fee_cents=fee,updated_at=clock_timestamp(),updated_by=actor where id=true;
end;$$;
revoke all on function public.astros_sms_configure(uuid,boolean,bigint,integer,bigint,text) from public,anon,authenticated;
grant execute on function public.astros_sms_configure(uuid,boolean,bigint,integer,bigint,text) to service_role;

create or replace function public.astros_sms_configure_five(actor uuid,fx bigint,margin integer,fee bigint,new_key text default '') returns void
language plpgsql security definer set search_path='' as $$
declare p public.astros_sms_private;
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso não autorizado';end if;
 if fx is null or fx not between 1 and 10000000 or margin is null or margin not between 0 and 100000 or fee is null or fee not between 0 and 100000 or new_key is null or (new_key<>'' and (length(new_key) not between 20 and 2000 or new_key !~ '^[A-Za-z0-9._-]+$')) then raise exception 'Confira os valores';end if;
 perform 1 from public.astros_sms_settings where id=true for update;
 select * into p from public.astros_sms_private where id=true for update;
 if new_key<>'' and new_key<>p.five_sim_key and exists(select 1 from public.astros_sms_orders where supplier='five_sim' and state in ('dispatching','pending','review')) then raise exception 'Conclua os pedidos antes de trocar a chave';end if;
 if coalesce(nullif(new_key,''),nullif(p.five_sim_key,'')) is null then raise exception 'Configure a chave';end if;
 update public.astros_sms_private set five_sim_key=coalesce(nullif(new_key,''),five_sim_key),worker_secret=case when worker_secret='' then replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','') else worker_secret end where id=true;
 update public.astros_sms_five_settings set native_brl_units=fx,margin_bps=margin,fee_cents=fee,updated_at=clock_timestamp() where id=true;
 update public.astros_sms_settings set updated_at=clock_timestamp(),updated_by=actor where id=true;
end;$$;
create table if not exists public.astros_sms_supplier_audit(id uuid primary key default gen_random_uuid(),actor_id uuid references auth.users(id),previous_supplier text not null,supplier text not null,enabled boolean not null,created_at timestamptz not null default now());
alter table public.astros_sms_supplier_audit enable row level security;
revoke all on public.astros_sms_supplier_audit from public,anon,authenticated;
grant all on public.astros_sms_supplier_audit to service_role;
create or replace function public.astros_sms_select_supplier(actor uuid,chosen text,active boolean) returns void
language plpgsql security definer set search_path='' as $$
declare s public.astros_sms_settings;p public.astros_sms_private;f public.astros_sms_five_settings;
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso não autorizado';end if;
 if chosen is null or chosen not in ('smspool','five_sim') or active is null then raise exception 'Fornecedor inválido';end if;
 select * into s from public.astros_sms_settings where id=true for update;
 select * into p from public.astros_sms_private where id=true;
 select * into f from public.astros_sms_five_settings where id=true;
 if active and (s.worker_at is null or s.worker_at<now()-interval '3 minutes' or
  (chosen='smspool' and (p.api_key='' or s.usd_brl_units<=0)) or
  (chosen='five_sim' and (p.five_sim_key='' or f.native_brl_units<=0))) then raise exception 'Configure o fornecedor e a rotina automática';end if;
 if s.active_supplier=chosen and s.enabled=active then return;end if;
 update public.astros_sms_settings set active_supplier=chosen,enabled=active,updated_at=clock_timestamp(),updated_by=actor where id=true;
 insert into public.astros_sms_supplier_audit(actor_id,previous_supplier,supplier,enabled) values(actor,s.active_supplier,chosen,active);
end;$$;
-- Claim before calling 5SIM cancel (GET with side effects). Never repeat after uncertainty.
create table if not exists public.astros_sms_five_cancels(order_id uuid primary key references public.astros_sms_orders(id),created_at timestamptz not null default now());
alter table public.astros_sms_five_cancels enable row level security;
revoke all on public.astros_sms_five_cancels from public,anon,authenticated;
grant all on public.astros_sms_five_cancels to service_role;
create or replace function public.astros_sms_claim_five_cancel(request_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare o public.astros_sms_orders;inserted uuid;
begin
 select * into o from public.astros_sms_orders where id=request_id for update;
 if not found or o.supplier<>'five_sim' or o.provider_id is null or o.state in ('received','refunded') then return false;end if;
 insert into public.astros_sms_five_cancels(order_id) values(request_id) on conflict do nothing returning order_id into inserted;
 return inserted is not null;
end;$$;
revoke all on function public.astros_sms_supplier_guard(),public.astros_sms_snapshot_cost(),public.astros_sms_configure_five(uuid,bigint,integer,bigint,text),public.astros_sms_select_supplier(uuid,text,boolean),public.astros_sms_claim_five_cancel(uuid),public.astros_sms_reserve(uuid,uuid,uuid),public.astros_sms_reserve_base(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.astros_sms_configure_five(uuid,bigint,integer,bigint,text),public.astros_sms_select_supplier(uuid,text,boolean),public.astros_sms_claim_five_cancel(uuid),public.astros_sms_reserve(uuid,uuid,uuid),public.astros_sms_reserve_base(uuid,uuid,uuid) to service_role;
commit;
