-- Serviço independente de ativações SMS. Carteira compartilhada, registros separados.
begin;
create table if not exists public.astros_sms_settings (
 id boolean primary key default true check(id), enabled boolean not null default false,
 usd_brl_units bigint not null default 0 check(usd_brl_units between 0 and 10000000),
 margin_bps integer not null default 0 check(margin_bps between 0 and 100000),
 fee_cents bigint not null default 0 check(fee_cents between 0 and 100000),
 worker_at timestamptz,updated_at timestamptz not null default now(),updated_by uuid references auth.users(id) on delete set null
);
create table if not exists public.astros_sms_private(id boolean primary key default true check(id),api_key text not null default '',worker_secret text not null default '');
insert into public.astros_sms_settings(id) values(true) on conflict do nothing;
insert into public.astros_sms_private(id) values(true) on conflict do nothing;
create table if not exists public.astros_sms_quotes (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.painel_de_desbanimento(id),
 service_id integer not null,country_id integer not null,pool_id integer not null,
 service_name text not null,country_name text not null,usd_units bigint not null check(usd_units>0),
 price_cents bigint not null check(price_cents between 1 and 1000000),
 settings_version timestamptz not null,expires_at timestamptz not null default now()+interval '2 minutes'
);
create table if not exists public.astros_sms_orders (
 id uuid primary key,user_id uuid not null references public.painel_de_desbanimento(id),quote_id uuid not null unique references public.astros_sms_quotes(id),
 service_id integer not null,country_id integer not null,pool_id integer not null,service_name text not null,country_name text not null,
 usd_units bigint not null,price_cents bigint not null,
 state text not null check(state in ('dispatching','pending','received','refunded','review')),
 provider_id text unique,phone text,code text,expires_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),checked_at timestamptz,
 check ((provider_id is null and state in ('dispatching','review','refunded')) or provider_id is not null)
);
create index if not exists astros_sms_owner_created on public.astros_sms_orders(user_id,created_at desc);
create index if not exists astros_sms_pending on public.astros_sms_orders(checked_at) where state in ('dispatching','pending','review');
alter table public.astros_sms_settings enable row level security;
alter table public.astros_sms_private enable row level security;
alter table public.astros_sms_quotes enable row level security;
alter table public.astros_sms_orders enable row level security;
revoke all on public.astros_sms_settings,public.astros_sms_private,public.astros_sms_quotes,public.astros_sms_orders from anon,authenticated;
grant all on public.astros_sms_settings,public.astros_sms_private,public.astros_sms_quotes,public.astros_sms_orders to service_role;
-- Atomic reserve: stable ID + locked account, before any purchase. No repeat dispatch.
create or replace function public.astros_sms_reserve(actor uuid,request_id uuid,quote uuid) returns jsonb
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
 if not s.enabled or s.usd_brl_units<=0 or s.worker_at is null or s.worker_at<now()-interval '3 minutes' then raise exception 'Serviço indisponível';end if;
 select * into q from public.astros_sms_quotes where id=quote and user_id=actor for update;
 if not found or q.expires_at<=now() or q.settings_version<>s.updated_at then raise exception 'Atualize o preço antes de comprar';end if;
 if exists(select 1 from public.astros_sms_orders where quote_id=quote) then raise exception 'Cotação já utilizada';end if;
 if (select count(*) from public.astros_sms_orders where user_id=actor and state in ('dispatching','pending','review'))>=5 then raise exception 'Conclua suas ativações em andamento';end if;
 if b is null or b<q.price_cents/100.0 then raise exception 'Saldo insuficiente. Faça uma recarga';end if;
 insert into public.astros_sms_orders(id,user_id,quote_id,service_id,country_id,pool_id,service_name,country_name,usd_units,price_cents,state)
 values(request_id,actor,q.id,q.service_id,q.country_id,q.pool_id,q.service_name,q.country_name,q.usd_units,q.price_cents,'dispatching');
 update public.painel_de_desbanimento set recarga=recarga-q.price_cents/100.0 where id=actor;
 insert into public.astros_wallet_movements(user_id,amount_cents,kind,reference) values(actor,-q.price_cents,'debit','sms:'||request_id);
 return jsonb_build_object('dispatch',true,'id',request_id);
end;$$;
-- Service-only reconciliation. Credit is inserted once and applied under the same lock.
create or replace function public.astros_sms_settle(order_id uuid,target text,provider text default null,number_value text default null,code_value text default null,expiry timestamptz default null) returns void
language plpgsql security definer set search_path='' as $$
declare o public.astros_sms_orders;added uuid;
begin
 select * into o from public.astros_sms_orders where id=order_id for update;
 if not found then raise exception 'Pedido indisponível';end if;
 if o.state in ('received','refunded') then return;end if;
 if target not in ('pending','received','refunded','review') then raise exception 'Estado inválido';end if;
 if o.provider_id is not null and provider is not null and o.provider_id<>provider then raise exception 'Pedido divergente';end if;
 if target in ('pending','received') and coalesce(o.provider_id,provider) is null then raise exception 'Pedido não confirmado';end if;
 if target='received' and coalesce(code_value,'')='' then raise exception 'Código não confirmado';end if;
 if target='refunded' then
  perform 1 from public.painel_de_desbanimento where id=o.user_id for update;
  insert into public.astros_wallet_movements(user_id,amount_cents,kind,reference) values(o.user_id,o.price_cents,'credit','sms-refund:'||o.id)
  on conflict(kind,reference) do nothing returning id into added;
  if added is not null then update public.painel_de_desbanimento set recarga=recarga+o.price_cents/100.0 where id=o.user_id;end if;
 end if;
 update public.astros_sms_orders set state=target,provider_id=coalesce(o.provider_id,provider),phone=coalesce(o.phone,number_value),code=coalesce(code_value,o.code),expires_at=coalesce(expiry,o.expires_at),updated_at=now(),checked_at=now() where id=order_id;
end;$$;
revoke all on function public.astros_sms_reserve(uuid,uuid,uuid),public.astros_sms_settle(uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.astros_sms_reserve(uuid,uuid,uuid),public.astros_sms_settle(uuid,text,text,text,text,timestamptz) to service_role;
create or replace function public.astros_sms_configure(actor uuid,active boolean,fx bigint,margin integer,fee bigint,new_key text default '') returns void
language plpgsql security definer set search_path='' as $$
declare s public.astros_sms_settings;p public.astros_sms_private;
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso não autorizado';end if;
 select * into s from public.astros_sms_settings where id=true for update;
 select * into p from public.astros_sms_private where id=true for update;
 if new_key<>'' and new_key<>p.api_key and exists(select 1 from public.astros_sms_orders where state in ('dispatching','pending','review')) then raise exception 'Conclua os pedidos antes de trocar a chave';end if;
 if active and (coalesce(nullif(new_key,''),nullif(p.api_key,'')) is null or s.worker_at is null or s.worker_at<now()-interval '3 minutes') then raise exception 'Configure a chave e a rotina automática';end if;
 update public.astros_sms_private set api_key=coalesce(nullif(new_key,''),p.api_key),worker_secret=case when p.worker_secret='' then replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','') else p.worker_secret end where id=true;
 update public.astros_sms_settings set enabled=active,usd_brl_units=fx,margin_bps=margin,fee_cents=fee,updated_at=clock_timestamp(),updated_by=actor where id=true;
end;$$;
revoke all on function public.astros_sms_configure(uuid,boolean,bigint,integer,bigint,text) from public,anon,authenticated;
grant execute on function public.astros_sms_configure(uuid,boolean,bigint,integer,bigint,text) to service_role;
create table if not exists public.astros_sms_limits(user_id uuid primary key references public.painel_de_desbanimento(id),window_at timestamptz not null,calls integer not null);
alter table public.astros_sms_limits enable row level security;
revoke all on public.astros_sms_limits from public,anon,authenticated;
grant all on public.astros_sms_limits to service_role;
create or replace function public.astros_sms_gate(actor uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into public.astros_sms_limits(user_id,window_at,calls) values(actor,date_trunc('minute',now()),1)
 on conflict(user_id) do update set calls=case when astros_sms_limits.window_at=date_trunc('minute',now()) then astros_sms_limits.calls+1 else 1 end,window_at=date_trunc('minute',now()) returning calls into n;
 return n<=60;
end;$$;
revoke all on function public.astros_sms_gate(uuid) from public,anon,authenticated;
grant execute on function public.astros_sms_gate(uuid) to service_role;
commit;
