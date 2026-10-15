-- Módulo independente de redes sociais. Todas as operações financeiras são service-only.
begin;
create table if not exists public.astros_social_settings(
 id boolean primary key default true check(id),enabled boolean not null default false,
 fx_units bigint not null default 0 check(fx_units between 0 and 10000000),
 margin_bps integer not null default 5000 check(margin_bps between 0 and 100000),fee_cents bigint not null default 0 check(fee_cents between 0 and 100000),
 worker_at timestamptz,catalog_at timestamptz,updated_at timestamptz not null default now(),updated_by uuid references auth.users(id)
);
create table if not exists public.astros_social_private(id boolean primary key default true check(id),api_key text not null default '',integration_id uuid not null default gen_random_uuid(),worker_secret text not null default '');
insert into public.astros_social_settings(id) values(true) on conflict do nothing;
insert into public.astros_social_private(id) values(true) on conflict do nothing;
create table if not exists public.astros_social_services(
 id bigint primary key check(id>0),provider_name text not null,provider_category text not null,description text not null default '',
 rate_units bigint not null check(rate_units>0),minimum integer not null check(minimum>0),maximum integer not null check(maximum>=minimum),
 refill boolean not null default false,cancel boolean not null default false,available boolean not null default true,
 enabled boolean not null default false,network text not null default '' check(network in ('','instagram','facebook','youtube','tiktok','x','telegram')),
 title text not null default '',updated_at timestamptz not null default now()
);
create table if not exists public.astros_social_quotes(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.painel_de_desbanimento(id),service_id bigint not null references public.astros_social_services(id),
 title text not null,description text not null default '',integration_id uuid not null,network text not null,link text not null check(length(link)<=1500),quantity integer not null check(quantity>0),
 rate_units bigint not null,cost_units bigint not null,fx_units bigint not null,price_cents bigint not null check(price_cents between 1 and 1000000),
 refill boolean not null,cancel boolean not null,settings_version timestamptz not null,service_version timestamptz not null,
 expires_at timestamptz not null default now()+interval '2 minutes'
);
create table if not exists public.astros_social_orders(
 id uuid primary key,user_id uuid not null references public.painel_de_desbanimento(id),quote_id uuid not null unique references public.astros_social_quotes(id),
 service_id bigint not null,title text not null,description text not null default '',integration_id uuid not null,network text not null,link text not null,quantity integer not null,
 cost_units bigint not null,fx_units bigint not null,price_cents bigint not null,refund_cents bigint not null default 0,
 actual_cost_units bigint,refill boolean not null,cancel boolean not null,provider_id text unique,
 state text not null check(state in ('dispatching','pending','processing','completed','partial','refunded','review')),
 remains integer,start_count bigint,diagnostic text check(diagnostic in ('purchase_rejected','purchase_unconfirmed','status_unconfirmed')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),checked_at timestamptz,
 check(refund_cents between 0 and price_cents)
);
create index if not exists astros_social_owner_created on public.astros_social_orders(user_id,created_at desc,id desc);
create index if not exists astros_social_open on public.astros_social_orders(checked_at) where state in ('dispatching','pending','processing','review');
create index if not exists astros_social_created on public.astros_social_orders(created_at);
create table if not exists public.astros_social_actions(
 id uuid primary key,order_id uuid not null references public.astros_social_orders(id),actor uuid not null references auth.users(id),
 kind text not null check(kind in ('cancel','refill')),state text not null default 'pending' check(state in ('pending','accepted','rejected','uncertain','resolved')),
 created_at timestamptz not null default now(),unique(order_id,kind)
);
create table if not exists public.astros_social_notes(id uuid primary key,order_id uuid not null references public.astros_social_orders(id),actor uuid not null references auth.users(id),body text not null check(length(body) between 10 and 500),created_at timestamptz not null default now());
create table if not exists public.astros_social_limits(user_id uuid primary key references public.painel_de_desbanimento(id),window_at timestamptz not null,calls integer not null);
-- No direct reads or writes for browser/JWT roles, even administrators. Edge verifies actor.
do $$declare t text;begin foreach t in array array['astros_social_settings','astros_social_private','astros_social_services','astros_social_quotes','astros_social_orders','astros_social_actions','astros_social_notes','astros_social_limits'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end;$$;
create or replace function public.astros_social_gate(actor uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;begin
 insert into public.astros_social_limits values(actor,date_trunc('minute',now()),1) on conflict(user_id) do update set calls=case when astros_social_limits.window_at=date_trunc('minute',now()) then astros_social_limits.calls+1 else 1 end,window_at=date_trunc('minute',now()) returning calls into n;return n<=60;end;$$;
create or replace function public.astros_social_configure(actor uuid,active boolean,fx bigint,margin integer,fee bigint,key_value text) returns void language plpgsql security definer set search_path='' as $$
declare oldkey text;s public.astros_social_settings;begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 if fx not between 1 and 10000000 or margin not between 0 and 100000 or fee not between 0 and 100000 or active is null or key_value is null or length(key_value)>200 then raise exception 'Confira os valores';end if;
 select * into s from public.astros_social_settings where id=true for update;
 select api_key into oldkey from public.astros_social_private where id=true for update;
 if key_value<>'' and key_value<>oldkey then
  if exists(select 1 from public.astros_social_orders where state in ('dispatching','pending','processing','review')) or exists(select 1 from public.astros_social_actions where state in ('pending','uncertain')) then raise exception 'Conclua os pedidos antes de trocar a chave';end if;
  update public.astros_social_private set api_key=key_value,integration_id=gen_random_uuid() where id=true;
  update public.astros_social_services set enabled=false,available=false,updated_at=clock_timestamp();
  update public.astros_social_settings set catalog_at=null where id=true;s.catalog_at=null;
 end if;
 if active and (coalesce(nullif(key_value,''),nullif(oldkey,'')) is null or s.catalog_at is null or s.worker_at is null or s.worker_at<now()-interval '3 minutes') then raise exception 'Configure a integração, sincronize serviços e ative a rotina antes de liberar';end if;
 update public.astros_social_private set worker_secret=case when worker_secret='' then gen_random_uuid()::text||gen_random_uuid()::text else worker_secret end where id=true;
 update public.astros_social_settings set enabled=active,fx_units=fx,margin_bps=margin,fee_cents=fee,updated_at=clock_timestamp(),updated_by=actor where id=true;
end;$$;
create or replace function public.astros_social_sync(actor uuid,items jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items)>20000 or jsonb_array_length(items)<1 then raise exception 'Catálogo inválido';end if;
 perform 1 from public.astros_social_settings where id=true for update;
 update public.astros_social_services set available=false,updated_at=clock_timestamp();
 insert into public.astros_social_services(id,provider_name,provider_category,description,rate_units,minimum,maximum,refill,cancel)
 select id,left(name,180),left(category,180),left(description,4000),rate,minimum,maximum,refill,cancel from jsonb_to_recordset(items) as x(id bigint,name text,category text,description text,rate bigint,minimum integer,maximum integer,refill boolean,cancel boolean)
 on conflict(id) do update set provider_name=excluded.provider_name,provider_category=excluded.provider_category,description=excluded.description,rate_units=excluded.rate_units,minimum=excluded.minimum,maximum=excluded.maximum,refill=excluded.refill,cancel=excluded.cancel,available=true,updated_at=clock_timestamp();
 get diagnostics n=row_count;update public.astros_social_settings set catalog_at=clock_timestamp() where id=true;return n;
end;$$;
create or replace function public.astros_social_curate(actor uuid,service bigint,active boolean,platform text,label text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 if platform not in ('instagram','facebook','youtube','tiktok','x','telegram') or length(trim(label)) not between 3 and 180 or active is null then raise exception 'Confira os campos';end if;
 update public.astros_social_services set enabled=active,network=platform,title=trim(label),updated_at=clock_timestamp() where id=service and available;
 if not found then raise exception 'Serviço indisponível';end if;
end;$$;
create or replace function public.astros_social_reserve(actor uuid,request_id uuid,quote uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.astros_social_quotes;o public.astros_social_orders;s public.astros_social_settings;c public.astros_social_services;b numeric;begin
 select recarga into b from public.painel_de_desbanimento where id=actor for update;if not found then raise exception 'Conta indisponível';end if;
 select * into o from public.astros_social_orders where id=request_id;if found then if o.user_id<>actor or o.quote_id<>quote then raise exception 'Referência divergente';end if;return jsonb_build_object('dispatch',false);end if;
 select * into s from public.astros_social_settings where id=true for share;
 if not s.enabled or s.worker_at is null or s.worker_at<now()-interval '3 minutes' then raise exception 'Serviço indisponível';end if;
 select * into q from public.astros_social_quotes where id=quote and user_id=actor for update;
 if not found or q.expires_at<=now() or q.settings_version<>s.updated_at then raise exception 'Consulte o preço novamente';end if;
 select * into c from public.astros_social_services where id=q.service_id for share;
 if not c.enabled or not c.available or c.network='' or q.service_version<>c.updated_at then raise exception 'Consulte o preço novamente';end if;
 if exists(select 1 from public.astros_social_orders where quote_id=quote) then raise exception 'Cotação já utilizada';end if;
 if (select count(*) from public.astros_social_orders where user_id=actor and state in ('dispatching','pending','processing','review'))>=20 then raise exception 'Conclua os pedidos em andamento';end if;
 if b is null or b<q.price_cents/100.0 then raise exception 'Saldo insuficiente. Faça uma recarga';end if;
 insert into public.astros_social_orders(id,user_id,quote_id,service_id,title,description,integration_id,network,link,quantity,cost_units,fx_units,price_cents,refill,cancel,state)
 values(request_id,actor,q.id,q.service_id,q.title,q.description,q.integration_id,q.network,q.link,q.quantity,q.cost_units,q.fx_units,q.price_cents,q.refill,q.cancel,'dispatching');
 update public.painel_de_desbanimento set recarga=recarga-q.price_cents/100.0 where id=actor;
 insert into public.astros_wallet_movements(user_id,amount_cents,kind,reference) values(actor,-q.price_cents,'debit','social:'||request_id);
 return jsonb_build_object('dispatch',true);
end;$$;
-- target=refunded without provider id only for a proven rejection of the single purchase.
create or replace function public.astros_social_settle(order_id uuid,target text,provider text default null,remaining integer default null,charge bigint default null,initial_count bigint default null,reason text default null) returns void language plpgsql security definer set search_path='' as $$
declare o public.astros_social_orders;owner uuid;credit bigint:=0;added uuid;begin
 select user_id into owner from public.astros_social_orders where id=order_id;if owner is null then raise exception 'Pedido não encontrado';end if;
 perform 1 from public.painel_de_desbanimento where id=owner for update;select * into o from public.astros_social_orders where id=order_id for update;
 if o.state in ('completed','partial','refunded') then return;end if;
 if target not in ('pending','processing','completed','partial','refunded','review') then raise exception 'Situação inválida';end if;
 if provider is not null then if provider !~ '^[0-9]{1,20}$' or (o.provider_id is not null and o.provider_id<>provider) then raise exception 'Referência divergente';end if;end if;
 if target in ('completed','partial') and coalesce(provider,o.provider_id) is null then raise exception 'Confirmação necessária';end if;
 if remaining is not null and remaining not between 0 and o.quantity or charge is not null and charge not between 0 and o.cost_units or initial_count is not null and initial_count<0 then raise exception 'Resposta divergente';end if;
 if target='completed' and (remaining is distinct from 0 or charge is null) then raise exception 'Resposta divergente';end if;
 if target='partial' then if remaining is null or charge is null or remaining<=0 or remaining>=o.quantity then raise exception 'Resposta divergente';end if;credit=floor(o.price_cents::numeric*remaining/o.quantity)::bigint;end if;
 if target='refunded' then
  if coalesce(provider,o.provider_id) is null then if reason is distinct from 'purchase_rejected' then raise exception 'Confirmação necessária';end if;
  elsif charge is distinct from 0 then raise exception 'Confirmação necessária';end if;credit=o.price_cents;
 end if;
 if credit>0 then
  insert into public.astros_wallet_movements(user_id,amount_cents,kind,reference) values(o.user_id,credit,'reversal','social-refund:'||o.id) on conflict(kind,reference) do nothing returning id into added;
  if added is not null then update public.painel_de_desbanimento set recarga=coalesce(recarga,0)+credit/100.0 where id=o.user_id;end if;
 end if;
 if target in ('completed','partial','refunded') then update public.astros_social_actions set state='resolved' where astros_social_actions.order_id=o.id and kind='cancel' and state in ('pending','accepted','uncertain');end if;
 update public.astros_social_orders set state=target,provider_id=coalesce(provider,provider_id),remains=coalesce(remaining,remains),start_count=coalesce(initial_count,start_count),actual_cost_units=coalesce(charge,actual_cost_units),refund_cents=greatest(refund_cents,credit),diagnostic=coalesce(reason,diagnostic),checked_at=clock_timestamp(),updated_at=clock_timestamp() where id=order_id;
end;$$;
create or replace function public.astros_social_action_begin(actor uuid,request_id uuid,request_order uuid,mode text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.astros_social_orders;a public.astros_social_actions;begin
 select * into o from public.astros_social_orders where id=request_order for update;
 if not found or (o.user_id<>actor and not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin')) then raise exception 'Pedido indisponível';end if;
 if mode not in ('cancel','refill') then raise exception 'Ação inválida';end if;
 select * into a from public.astros_social_actions where order_id=o.id and kind=mode;
 if found then return jsonb_build_object('dispatch',false,'state',a.state);end if;
 if o.integration_id is distinct from (select integration_id from public.astros_social_private where id=true) then raise exception 'Ação indisponível neste pedido';end if;
 if o.provider_id is null or (mode='cancel' and (not o.cancel or o.state not in ('pending','processing'))) or (mode='refill' and (not o.refill or o.state<>'completed')) then raise exception 'Ação indisponível neste pedido';end if;
 insert into public.astros_social_actions(id,order_id,actor,kind) values(request_id,o.id,actor,mode);
 return jsonb_build_object('dispatch',true,'state','pending');
end;$$;
-- Exact function signatures: no broad/default grants for browser roles.
do $$declare f regprocedure;begin for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'astros_social_%' loop execute format('revoke all on function %s from public,anon,authenticated',f);execute format('grant execute on function %s to service_role',f);end loop;end;$$;
commit;
-- Release old quotes under the same owning wallet lock used by reservation.
begin;
create or replace function public.astros_social_release(actor uuid,request_id uuid,quote uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.astros_social_orders;begin
 perform 1 from public.painel_de_desbanimento where id=actor for update;if not found then raise exception 'Conta indisponível';end if;
 select * into o from public.astros_social_orders where id=request_id;
 if found then if o.user_id<>actor or o.quote_id<>quote then raise exception 'Referência divergente';end if;return jsonb_build_object('released',false,'id',o.id);end if;
 update public.astros_social_quotes set expires_at=least(expires_at,clock_timestamp()) where id=quote and user_id=actor;
 if not found then raise exception 'Cotação indisponível';end if;return jsonb_build_object('released',true);
end;$$;
revoke all on function public.astros_social_release(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.astros_social_release(uuid,uuid,uuid) to service_role;
commit;
