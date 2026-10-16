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
  update public.astros_social_services set enabled=false,available=false,updated_at=clock_timestamp() where enabled or available;
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
 update public.astros_social_services set available=false,updated_at=clock_timestamp() where available;
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

-- Executar após social_services. Amplia o relatório existente sem somar recargas como vendas.
begin;
create or replace function public.astros_financial_dashboard(date_from date,date_until date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare start_at timestamptz;end_at timestamptz;result jsonb;
begin
 if public.astros_is_admin() is not true then raise exception 'Acesso restrito à administração';end if;
 if date_from is null or date_until is null or date_until<date_from or date_until-date_from>365 then raise exception 'Escolha um período de até 366 dias';end if;
 start_at=date_from::timestamp at time zone 'America/Fortaleza';
 end_at=(date_until+1)::timestamp at time zone 'America/Fortaleza';
 with movements as materialized (
  select m.* from public.astros_wallet_movements m where m.created_at>=start_at and m.created_at<end_at
 ), classified as materialized (
  select m.*,
  case when m.reference like 'social:%' then 'social_debit'
       when m.reference like 'social-refund:%' then 'social_refund'
       when m.reference like 'sms:%' then 'sms_debit'
       when m.reference like 'sms-refund:%' then 'sms_refund'
       when m.reference like 'service:%' and m.kind='debit' then 'service_debit'
       when m.reference like 'service:%' and m.kind='reversal' then 'service_refund'
       when m.reference like 'manual:%' and m.kind='credit' then 'manual_credit'
       when m.reference like 'manual-reversal:%' and m.kind='reversal' then 'manual_reversal'
       when m.kind='credit' and exists(select 1 from public.astros_payment_orders p where p.mp_payment_id=m.reference and p.user_id=m.user_id and p.live_mode) then 'payment_credit'
       when m.kind='reversal' and exists(select 1 from public.astros_payment_orders p where p.mp_payment_id=split_part(m.reference,':',1) and p.user_id=m.user_id and p.live_mode) then 'payment_refund'
       else 'other' end category
  from movements m
 ), totals as (
  select coalesce(sum(amount_cents) filter(where category='payment_credit'),0) received,
   coalesce(-sum(amount_cents) filter(where category='payment_refund'),0) payment_refunds,
   coalesce(sum(amount_cents) filter(where category='manual_credit'),0) manual_credits,
   coalesce(-sum(amount_cents) filter(where category='manual_reversal'),0) manual_reversals,
   coalesce(-sum(amount_cents) filter(where category='service_debit'),0) service_debits,
   coalesce(sum(amount_cents) filter(where category='service_refund'),0) service_refunds,
   coalesce(-sum(amount_cents) filter(where category='sms_debit'),0) sms_debits,
   coalesce(sum(amount_cents) filter(where category='sms_refund'),0) sms_refunds,
   coalesce(-sum(amount_cents) filter(where category='social_debit'),0) social_debits,
   coalesce(sum(amount_cents) filter(where category='social_refund'),0) social_refunds,
   count(*) filter(where category='other') other_count
  from classified
 ), service_jobs as (
  select count(*) filter(where state='completed' and amount_cents>0) paid_count,
   count(*) filter(where state='completed' and amount_cents=0) free_count,
   coalesce(sum(amount_cents) filter(where state='completed'),0) completed_sales,
   coalesce(sum(amount_cents) filter(where state in ('processing','review')),0) open_cents
  from public.astros_service_jobs where created_at>=start_at and created_at<end_at
 ), sms_jobs as (
  select count(*) filter(where state='received') completed_count,
   coalesce(sum(price_cents) filter(where state in ('dispatching','pending','review')),0) open_cents,
   coalesce(sum(price_cents) filter(where state='received'),0) completed_sales,
   coalesce(sum(estimated_cost_cents) filter(where state='received' and estimated_cost_cents is not null),0) known_cost,
   coalesce(sum(price_cents-estimated_cost_cents) filter(where state='received' and estimated_cost_cents is not null),0) known_gain,
   count(*) filter(where state='received' and estimated_cost_cents is null) missing_cost_count
  from public.astros_sms_orders where created_at>=start_at and created_at<end_at
 ), social_jobs as (
  select count(*) filter(where state in ('completed','partial')) completed_count,
   coalesce(sum(price_cents-refund_cents) filter(where state in ('completed','partial')),0) completed_sales,
   coalesce(sum(price_cents) filter(where state in ('dispatching','pending','processing','review')),0) open_cents,
   coalesce(sum(ceil(actual_cost_units::numeric*fx_units/100000000)) filter(where state in ('completed','partial') and actual_cost_units is not null),0) known_cost,
   coalesce(sum(price_cents-refund_cents-ceil(actual_cost_units::numeric*fx_units/100000000)) filter(where state in ('completed','partial') and actual_cost_units is not null),0) known_gain,
   count(*) filter(where state in ('completed','partial') and actual_cost_units is null) missing_cost_count
  from public.astros_social_orders where created_at>=start_at and created_at<end_at
 ), daily as (
  select (m.created_at at time zone 'America/Fortaleza')::date as day_bucket,
   coalesce(sum(amount_cents) filter(where category='payment_credit'),0) received,
   coalesce(-sum(amount_cents) filter(where category in ('service_debit','sms_debit','social_debit')),0) consumed,
   coalesce(sum(amount_cents) filter(where category in ('service_refund','sms_refund','social_refund')),0) returned
  from classified m group by 1
 )
 select jsonb_build_object(
  'from',date_from,'until',date_until,'generatedAt',now(),
  'receivedCents',t.received,'paymentRefundsCents',t.payment_refunds,'netReceiptsCents',t.received-t.payment_refunds,
  'manualCreditsCents',t.manual_credits,'manualReversalsCents',t.manual_reversals,'unclassifiedCount',t.other_count,
  'currentBalanceCents',(select coalesce(sum(round(coalesce(recarga,0)*100)),0) from public.painel_de_desbanimento),
  'desban',jsonb_build_object('debitsCents',t.service_debits,'refundsCents',t.service_refunds,'netCents',t.service_debits-t.service_refunds,'paidCount',j.paid_count,'freeCount',j.free_count,'completedSalesCents',j.completed_sales,'openCents',j.open_cents),
  'sms',jsonb_build_object('debitsCents',t.sms_debits,'refundsCents',t.sms_refunds,'netCents',t.sms_debits-t.sms_refunds,'completedCount',s.completed_count,'openCents',s.open_cents,'completedSalesCents',s.completed_sales,'knownCostCents',s.known_cost,'knownGainCents',s.known_gain,'missingCostCount',s.missing_cost_count),
  'social',jsonb_build_object('debitsCents',t.social_debits,'refundsCents',t.social_refunds,'netCents',t.social_debits-t.social_refunds,'completedCount',so.completed_count,'openCents',so.open_cents,'completedSalesCents',so.completed_sales,'knownCostCents',so.known_cost,'knownGainCents',so.known_gain,'missingCostCount',so.missing_cost_count),
  'daily',(select coalesce(jsonb_agg(jsonb_build_object('date',days.day_bucket::date,'receivedCents',coalesce(d.received,0),'consumedCents',coalesce(d.consumed,0),'returnedCents',coalesce(d.returned,0)) order by days.day_bucket),'[]'::jsonb) from generate_series(date_from::timestamp,date_until::timestamp,interval '1 day') days(day_bucket) left join daily d on d.day_bucket=days.day_bucket::date)
 ) into result from totals t cross join service_jobs j cross join sms_jobs s cross join social_jobs so;
 return result;
end;$$;
revoke all on function public.astros_financial_dashboard(date,date) from public,anon,authenticated;
grant execute on function public.astros_financial_dashboard(date,date) to authenticated;
commit;

-- Visibilidade do catálogo: sem alterar carteira, preços, pedidos ou disponibilidade global.
begin;
create or replace function public.astros_social_visibility(actor uuid,services bigint[],active boolean) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 if services is null or active is null or cardinality(services) not between 1 and 100 or array_position(services,null) is not null then raise exception 'Seleção inválida';end if;
 if (select count(distinct x) from unnest(services) x)<>cardinality(services) then raise exception 'Seleção inválida';end if;
 perform 1 from public.astros_social_settings where id=true for update;
 perform 1 from public.astros_social_services where id=any(services) order by id for update;
 select count(*) into n from public.astros_social_services where id=any(services);
 if n<>cardinality(services) then raise exception 'Há serviços indisponíveis. Atualize o catálogo e revise a seleção';end if;
 if active and exists(select 1 from public.astros_social_services where id=any(services) and not available) then raise exception 'Há serviços indisponíveis. Atualize o catálogo e revise a seleção';end if;
 if active and exists(select 1 from public.astros_social_services where id=any(services) and (network not in ('instagram','facebook','youtube','tiktok','x','telegram') or length(trim(title))<3)) then raise exception 'Configure a rede e o nome dos serviços antes de liberar';end if;
 update public.astros_social_services set enabled=active,updated_at=clock_timestamp() where id=any(services) and enabled is distinct from active;
 return n;
end;$$;
revoke all on function public.astros_social_visibility(uuid,bigint[],boolean) from public,anon,authenticated;
grant execute on function public.astros_social_visibility(uuid,bigint[],boolean) to service_role;
commit;

-- Apresentação em português e sincronização automática; não altera saldos nem pedidos existentes.
begin;
alter table public.astros_social_services add column if not exists customer_description text not null default '' check(length(customer_description)<=4000);
alter table public.astros_social_services add column if not exists category_code text not null default '' check(category_code in ('','followers','likes','views','comments','shares','subscribers','other'));
alter table public.astros_social_services add column if not exists needs_review boolean not null default false;
alter table public.astros_social_quotes add column if not exists customer_description text not null default '';
alter table public.astros_social_orders add column if not exists customer_description text not null default '';
alter table public.astros_social_settings add column if not exists catalog_attempt_at timestamptz;
alter table public.astros_social_settings add column if not exists catalog_lease_at timestamptz;
alter table public.astros_social_settings add column if not exists catalog_token uuid;
alter table public.astros_social_settings add column if not exists catalog_error boolean not null default false;
create or replace function public.astros_social_present(actor uuid,service bigint,active boolean,platform text,label text,customer_text text,category text) returns void language plpgsql security definer set search_path='' as $$
begin
 if customer_text is null or length(customer_text)>4000 or category is null or category not in ('followers','likes','views','comments','shares','subscribers','other') then raise exception 'Confira os campos';end if;
 perform public.astros_social_curate(actor,service,active,platform,label);
 update public.astros_social_services set customer_description=trim(customer_text),category_code=category,needs_review=false,updated_at=clock_timestamp() where id=service;
end;$$;
create or replace function public.astros_social_catalog_claim(actor uuid default null,force_refresh boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.astros_social_settings;g uuid;k text;t uuid;
begin
 if force_refresh is null then raise exception 'Acesso restrito';end if;
 if force_refresh and actor is null then raise exception 'Acesso restrito';end if;
 if actor is not null and not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 select * into s from public.astros_social_settings where id=true for update;
 select integration_id,api_key into g,k from public.astros_social_private where id=true for share;
 if coalesce(k,'')='' or (s.catalog_lease_at is not null and s.catalog_lease_at>now()-interval '90 seconds') then return jsonb_build_object('started',false);end if;
 if not force_refresh and (s.catalog_attempt_at>now()-interval '5 minutes' or (not s.catalog_error and s.catalog_at>now()-interval '1 hour')) then return jsonb_build_object('started',false);end if;
 t:=gen_random_uuid();update public.astros_social_settings set catalog_token=t,catalog_lease_at=clock_timestamp(),catalog_attempt_at=clock_timestamp() where id=true;
 return jsonb_build_object('started',true,'token',t,'generation',g);
end;$$;
create or replace function public.astros_social_catalog_finish(lease uuid,generation uuid,items jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare s public.astros_social_settings;g uuid;n integer;
begin
 select * into s from public.astros_social_settings where id=true for update;
 select integration_id into g from public.astros_social_private where id=true for share;
 if s.catalog_token is distinct from lease or lease is null or generation is distinct from g or s.catalog_lease_at is null or s.catalog_lease_at<now()-interval '90 seconds' then raise exception 'Sincronização substituída. Atualize a página';end if;
 if items is null or jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 20000 then raise exception 'Catálogo inválido';end if;
 update public.astros_social_services set available=false,updated_at=clock_timestamp() where available and id not in(select (x->>'id')::bigint from jsonb_array_elements(items) x);
 insert into public.astros_social_services(id,provider_name,provider_category,description,rate_units,minimum,maximum,refill,cancel)
 select id,left(name,180),left(category,180),left(description,4000),rate,minimum,maximum,refill,cancel from jsonb_to_recordset(items) as x(id bigint,name text,category text,description text,rate bigint,minimum integer,maximum integer,refill boolean,cancel boolean)
 on conflict(id) do update set
 provider_name=excluded.provider_name,provider_category=excluded.provider_category,description=excluded.description,rate_units=excluded.rate_units,minimum=excluded.minimum,maximum=excluded.maximum,refill=excluded.refill,cancel=excluded.cancel,available=true,
 needs_review=astros_social_services.needs_review or (astros_social_services.provider_name,astros_social_services.provider_category,astros_social_services.description,astros_social_services.minimum,astros_social_services.maximum,astros_social_services.refill,astros_social_services.cancel) is distinct from (excluded.provider_name,excluded.provider_category,excluded.description,excluded.minimum,excluded.maximum,excluded.refill,excluded.cancel),
 enabled=astros_social_services.enabled and (astros_social_services.provider_name,astros_social_services.provider_category,astros_social_services.description,astros_social_services.minimum,astros_social_services.maximum,astros_social_services.refill,astros_social_services.cancel) is not distinct from (excluded.provider_name,excluded.provider_category,excluded.description,excluded.minimum,excluded.maximum,excluded.refill,excluded.cancel),updated_at=clock_timestamp()
 where (astros_social_services.provider_name,astros_social_services.provider_category,astros_social_services.description,astros_social_services.rate_units,astros_social_services.minimum,astros_social_services.maximum,astros_social_services.refill,astros_social_services.cancel,astros_social_services.available) is distinct from (excluded.provider_name,excluded.provider_category,excluded.description,excluded.rate_units,excluded.minimum,excluded.maximum,excluded.refill,excluded.cancel,true);
 n:=jsonb_array_length(items);update public.astros_social_settings set catalog_at=clock_timestamp(),catalog_lease_at=null,catalog_token=null,catalog_error=false where id=true;return n;
end;$$;
create or replace function public.astros_social_catalog_fail(lease uuid) returns void language sql security definer set search_path='' as $$update public.astros_social_settings set catalog_error=true,catalog_token=null,catalog_lease_at=null where id=true and catalog_token=lease;$$;
create or replace function public.astros_social_operations(actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 select jsonb_build_object('total',count(*),'active',count(*) filter(where state in ('dispatching','pending','processing')),'completed',count(*) filter(where state='completed'),'partial',count(*) filter(where state='partial'),'refunded',count(*) filter(where state='refunded'),'review',count(*) filter(where state='review')) into result from public.astros_social_orders;
 return result||jsonb_build_object('attentionCount',(select count(*) from public.astros_social_orders where state='review' or (state in ('dispatching','pending','processing') and created_at<now()-interval '24 hours')),'attention',coalesce((select jsonb_agg(x order by x.created_at,x.id) from(select id,title,state,created_at from public.astros_social_orders where state='review' or (state in ('dispatching','pending','processing') and created_at<now()-interval '24 hours') order by created_at,id limit 20)x),'[]'::jsonb),'checkedAt',clock_timestamp());
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
 insert into public.astros_social_orders(id,user_id,quote_id,service_id,title,description,customer_description,integration_id,network,link,quantity,cost_units,fx_units,price_cents,refill,cancel,state)
 values(request_id,actor,q.id,q.service_id,q.title,q.description,q.customer_description,q.integration_id,q.network,q.link,q.quantity,q.cost_units,q.fx_units,q.price_cents,q.refill,q.cancel,'dispatching');
 update public.painel_de_desbanimento set recarga=recarga-q.price_cents/100.0 where id=actor;
 insert into public.astros_wallet_movements(user_id,amount_cents,kind,reference) values(actor,-q.price_cents,'debit','social:'||request_id);
 return jsonb_build_object('dispatch',true);
end;$$;
create or replace function public.astros_social_visibility(actor uuid,services bigint[],active boolean) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 if services is null or active is null or cardinality(services) not between 1 and 100 or array_position(services,null) is not null then raise exception 'Seleção inválida';end if;
 if (select count(distinct x) from unnest(services) x)<>cardinality(services) then raise exception 'Seleção inválida';end if;
 perform 1 from public.astros_social_settings where id=true for update;
 perform 1 from public.astros_social_services where id=any(services) order by id for update;
 select count(*) into n from public.astros_social_services where id=any(services);
 if n<>cardinality(services) then raise exception 'Há serviços indisponíveis. Atualize o catálogo e revise a seleção';end if;
 if active and exists(select 1 from public.astros_social_services where id=any(services) and not available) then raise exception 'Há serviços indisponíveis. Atualize o catálogo e revise a seleção';end if;
 if active and exists(select 1 from public.astros_social_services where id=any(services) and (needs_review or network not in ('instagram','facebook','youtube','tiktok','x','telegram') or length(trim(title))<3)) then raise exception 'Configure a rede e o nome dos serviços antes de liberar';end if;
 update public.astros_social_services set enabled=active,updated_at=clock_timestamp() where id=any(services) and enabled is distinct from active;
 return n;
end;$$;
revoke all on function public.astros_social_present(uuid,bigint,boolean,text,text,text,text) from public,anon,authenticated;
grant execute on function public.astros_social_present(uuid,bigint,boolean,text,text,text,text) to service_role;
revoke all on function public.astros_social_catalog_claim(uuid,boolean) from public,anon,authenticated;
grant execute on function public.astros_social_catalog_claim(uuid,boolean) to service_role;
revoke all on function public.astros_social_catalog_finish(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.astros_social_catalog_finish(uuid,uuid,jsonb) to service_role;
revoke all on function public.astros_social_catalog_fail(uuid) from public,anon,authenticated;
grant execute on function public.astros_social_catalog_fail(uuid) to service_role;
revoke all on function public.astros_social_operations(uuid) from public,anon,authenticated;
grant execute on function public.astros_social_operations(uuid) to service_role;
commit;

-- Classificação automática para serviços simples e redes compatíveis. Sem movimentação financeira.
begin;
alter table public.astros_social_settings add column if not exists auto_catalog_enabled boolean not null default false;
alter table public.astros_social_services add column if not exists auto_network text not null default '';
alter table public.astros_social_services add column if not exists auto_type text not null default 'other';
alter table public.astros_social_services add column if not exists auto_classified boolean not null default false;
alter table public.astros_social_services add column if not exists manual_visibility boolean not null default false;
-- Preserve existing administrator decisions, including deliberately hidden curated items.
update public.astros_social_services set manual_visibility=true where network<>'' and not auto_classified;
create or replace function public.astros_social_apply_automatic() returns void language plpgsql security definer set search_path='' as $$
declare active boolean;begin
 select auto_catalog_enabled into active from public.astros_social_settings where id=true;
 update public.astros_social_services set network=auto_network,title=provider_name,auto_classified=true,needs_review=false,updated_at=clock_timestamp()
 where (auto_classified or (network='' and auto_network in ('instagram','facebook','youtube','tiktok','x','telegram'))) and (network is distinct from auto_network or title is distinct from provider_name or not auto_classified or needs_review);
 update public.astros_social_services set enabled=coalesce(active,false) and available and network<>'' and not needs_review,updated_at=clock_timestamp()
 where not manual_visibility and enabled is distinct from (coalesce(active,false) and available and network<>'' and not needs_review);
end;$$;
create or replace function public.astros_social_auto_catalog(actor uuid,active boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if active is null or not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 perform 1 from public.astros_social_settings where id=true for update;
 update public.astros_social_settings set auto_catalog_enabled=active where id=true;
 perform public.astros_social_apply_automatic();
end;$$;
create or replace function public.astros_social_catalog_finish(lease uuid,generation uuid,items jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare s public.astros_social_settings;g uuid;n integer;
begin
 select * into s from public.astros_social_settings where id=true for update;
 select integration_id into g from public.astros_social_private where id=true for share;
 if s.catalog_token is distinct from lease or lease is null or generation is distinct from g or s.catalog_lease_at is null or s.catalog_lease_at<now()-interval '90 seconds' then raise exception 'Sincronização substituída. Atualize a página';end if;
 if items is null or jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 20000 then raise exception 'Catálogo inválido';end if;
 update public.astros_social_services set available=false,updated_at=clock_timestamp() where available and id not in(select (x->>'id')::bigint from jsonb_array_elements(items) x);
 insert into public.astros_social_services(id,provider_name,provider_category,description,rate_units,minimum,maximum,refill,cancel)
 select id,left(name,180),left(category,180),left(description,4000),rate,minimum,maximum,refill,cancel from jsonb_to_recordset(items) as x(id bigint,name text,category text,description text,rate bigint,minimum integer,maximum integer,refill boolean,cancel boolean)
 on conflict(id) do update set
 provider_name=excluded.provider_name,provider_category=excluded.provider_category,description=excluded.description,rate_units=excluded.rate_units,minimum=excluded.minimum,maximum=excluded.maximum,refill=excluded.refill,cancel=excluded.cancel,available=true,
 needs_review=astros_social_services.needs_review or (astros_social_services.provider_name,astros_social_services.provider_category,astros_social_services.description,astros_social_services.minimum,astros_social_services.maximum,astros_social_services.refill,astros_social_services.cancel) is distinct from (excluded.provider_name,excluded.provider_category,excluded.description,excluded.minimum,excluded.maximum,excluded.refill,excluded.cancel),
 enabled=astros_social_services.enabled and (astros_social_services.provider_name,astros_social_services.provider_category,astros_social_services.description,astros_social_services.minimum,astros_social_services.maximum,astros_social_services.refill,astros_social_services.cancel) is not distinct from (excluded.provider_name,excluded.provider_category,excluded.description,excluded.minimum,excluded.maximum,excluded.refill,excluded.cancel),updated_at=clock_timestamp()
 where (astros_social_services.provider_name,astros_social_services.provider_category,astros_social_services.description,astros_social_services.rate_units,astros_social_services.minimum,astros_social_services.maximum,astros_social_services.refill,astros_social_services.cancel,astros_social_services.available) is distinct from (excluded.provider_name,excluded.provider_category,excluded.description,excluded.rate_units,excluded.minimum,excluded.maximum,excluded.refill,excluded.cancel,true);
 update public.astros_social_services c set auto_network=case when x.auto_network in ('instagram','facebook','youtube','tiktok','x','telegram') then x.auto_network else '' end,auto_type=case when x.auto_type in ('followers','likes','views','comments','shares','subscribers','other') then x.auto_type else 'other' end from jsonb_to_recordset(items) as x(id bigint,auto_network text,auto_type text) where c.id=x.id;
 perform public.astros_social_apply_automatic();
 n:=jsonb_array_length(items);update public.astros_social_settings set catalog_at=clock_timestamp(),catalog_lease_at=null,catalog_token=null,catalog_error=false where id=true;return n;
end;$$;
create or replace function public.astros_social_present(actor uuid,service bigint,active boolean,platform text,label text,customer_text text,category text) returns void language plpgsql security definer set search_path='' as $$
begin
 if customer_text is null or length(customer_text)>4000 or category is null or category not in ('followers','likes','views','comments','shares','subscribers','other') then raise exception 'Confira os campos';end if;
 perform public.astros_social_curate(actor,service,active,platform,label);
 update public.astros_social_services set manual_visibility=true,auto_classified=false,customer_description=trim(customer_text),category_code=category,needs_review=false,updated_at=clock_timestamp() where id=service;
end;$$;
create or replace function public.astros_social_visibility(actor uuid,services bigint[],active boolean) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 if services is null or active is null or cardinality(services) not between 1 and 100 or array_position(services,null) is not null then raise exception 'Seleção inválida';end if;
 if (select count(distinct x) from unnest(services) x)<>cardinality(services) then raise exception 'Seleção inválida';end if;
 perform 1 from public.astros_social_settings where id=true for update;
 perform 1 from public.astros_social_services where id=any(services) order by id for update;
 select count(*) into n from public.astros_social_services where id=any(services);
 if n<>cardinality(services) then raise exception 'Há serviços indisponíveis. Atualize o catálogo e revise a seleção';end if;
 if active and exists(select 1 from public.astros_social_services where id=any(services) and not available) then raise exception 'Há serviços indisponíveis. Atualize o catálogo e revise a seleção';end if;
 if active and exists(select 1 from public.astros_social_services where id=any(services) and (needs_review or network not in ('instagram','facebook','youtube','tiktok','x','telegram') or length(trim(title))<3)) then raise exception 'Configure a rede e o nome dos serviços antes de liberar';end if;
 update public.astros_social_services set manual_visibility=true,enabled=active,updated_at=clock_timestamp() where id=any(services) and (enabled is distinct from active or not manual_visibility);
 return n;
end;$$;
revoke all on function public.astros_social_apply_automatic() from public,anon,authenticated;
grant execute on function public.astros_social_apply_automatic() to service_role;
revoke all on function public.astros_social_auto_catalog(uuid,boolean) from public,anon,authenticated;
grant execute on function public.astros_social_auto_catalog(uuid,boolean) to service_role;

create or replace function public.astros_social_catalog_facets() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(g order by g.network,g.kind,g.category),'[]'::jsonb) from (select network,coalesce(nullif(category_code,''),nullif(auto_type,''),'other') as kind,provider_category as category,count(*) as count from public.astros_social_services where enabled and available and network<>'' and exists(select 1 from public.astros_social_settings where id=true and enabled) group by network,coalesce(nullif(category_code,''),nullif(auto_type,''),'other'),provider_category)g;
$$;
revoke all on function public.astros_social_catalog_facets() from public,anon,authenticated;
grant execute on function public.astros_social_catalog_facets() to service_role;
commit;

-- Expand supported network taxonomy only. No wallet or order mutations.
begin;
alter table public.astros_social_services drop constraint if exists astros_social_services_network_check;
alter table public.astros_social_services add constraint astros_social_services_network_check check(network in ('','instagram','facebook','youtube','tiktok','x','telegram','twitch','linkedin','spotify','threads','website','snapchat','whatsapp','kick','pinterest'));
create or replace function public.astros_social_apply_automatic() returns void language plpgsql security definer set search_path='' as $$
declare active boolean;begin
 select auto_catalog_enabled into active from public.astros_social_settings where id=true;
 update public.astros_social_services set network=auto_network,title=provider_name,auto_classified=true,needs_review=false,updated_at=clock_timestamp()
 where (auto_classified or (network='' and auto_network in ('instagram','facebook','youtube','tiktok','x','telegram','twitch','linkedin','spotify','threads','website','snapchat','whatsapp','kick','pinterest'))) and (network is distinct from auto_network or title is distinct from provider_name or not auto_classified or needs_review);
 update public.astros_social_services set enabled=coalesce(active,false) and available and network<>'' and not needs_review,updated_at=clock_timestamp()
 where not manual_visibility and enabled is distinct from (coalesce(active,false) and available and network<>'' and not needs_review);
end;$$;
create or replace function public.astros_social_catalog_finish(lease uuid,generation uuid,items jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare s public.astros_social_settings;g uuid;n integer;
begin
 select * into s from public.astros_social_settings where id=true for update;
 select integration_id into g from public.astros_social_private where id=true for share;
 if s.catalog_token is distinct from lease or lease is null or generation is distinct from g or s.catalog_lease_at is null or s.catalog_lease_at<now()-interval '90 seconds' then raise exception 'Sincronização substituída. Atualize a página';end if;
 if items is null or jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 20000 then raise exception 'Catálogo inválido';end if;
 update public.astros_social_services set available=false,updated_at=clock_timestamp() where available and id not in(select (x->>'id')::bigint from jsonb_array_elements(items) x);
 insert into public.astros_social_services(id,provider_name,provider_category,description,rate_units,minimum,maximum,refill,cancel)
 select id,left(name,180),left(category,180),left(description,4000),rate,minimum,maximum,refill,cancel from jsonb_to_recordset(items) as x(id bigint,name text,category text,description text,rate bigint,minimum integer,maximum integer,refill boolean,cancel boolean)
 on conflict(id) do update set
 provider_name=excluded.provider_name,provider_category=excluded.provider_category,description=excluded.description,rate_units=excluded.rate_units,minimum=excluded.minimum,maximum=excluded.maximum,refill=excluded.refill,cancel=excluded.cancel,available=true,
 needs_review=astros_social_services.needs_review or (astros_social_services.provider_name,astros_social_services.provider_category,astros_social_services.description,astros_social_services.minimum,astros_social_services.maximum,astros_social_services.refill,astros_social_services.cancel) is distinct from (excluded.provider_name,excluded.provider_category,excluded.description,excluded.minimum,excluded.maximum,excluded.refill,excluded.cancel),
 enabled=astros_social_services.enabled and (astros_social_services.provider_name,astros_social_services.provider_category,astros_social_services.description,astros_social_services.minimum,astros_social_services.maximum,astros_social_services.refill,astros_social_services.cancel) is not distinct from (excluded.provider_name,excluded.provider_category,excluded.description,excluded.minimum,excluded.maximum,excluded.refill,excluded.cancel),updated_at=clock_timestamp()
 where (astros_social_services.provider_name,astros_social_services.provider_category,astros_social_services.description,astros_social_services.rate_units,astros_social_services.minimum,astros_social_services.maximum,astros_social_services.refill,astros_social_services.cancel,astros_social_services.available) is distinct from (excluded.provider_name,excluded.provider_category,excluded.description,excluded.rate_units,excluded.minimum,excluded.maximum,excluded.refill,excluded.cancel,true);
 update public.astros_social_services c set auto_network=case when x.auto_network in ('instagram','facebook','youtube','tiktok','x','telegram','twitch','linkedin','spotify','threads','website','snapchat','whatsapp','kick','pinterest') then x.auto_network else '' end,auto_type=case when x.auto_type in ('followers','likes','views','comments','shares','subscribers','other') then x.auto_type else 'other' end from jsonb_to_recordset(items) as x(id bigint,auto_network text,auto_type text) where c.id=x.id;
 perform public.astros_social_apply_automatic();
 n:=jsonb_array_length(items);update public.astros_social_settings set catalog_at=clock_timestamp(),catalog_lease_at=null,catalog_token=null,catalog_error=false where id=true;return n;
end;$$;
create or replace function public.astros_social_visibility(actor uuid,services bigint[],active boolean) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 if services is null or active is null or cardinality(services) not between 1 and 100 or array_position(services,null) is not null then raise exception 'Seleção inválida';end if;
 if (select count(distinct x) from unnest(services) x)<>cardinality(services) then raise exception 'Seleção inválida';end if;
 perform 1 from public.astros_social_settings where id=true for update;
 perform 1 from public.astros_social_services where id=any(services) order by id for update;
 select count(*) into n from public.astros_social_services where id=any(services);
 if n<>cardinality(services) then raise exception 'Há serviços indisponíveis. Atualize o catálogo e revise a seleção';end if;
 if active and exists(select 1 from public.astros_social_services where id=any(services) and not available) then raise exception 'Há serviços indisponíveis. Atualize o catálogo e revise a seleção';end if;
 if active and exists(select 1 from public.astros_social_services where id=any(services) and (needs_review or network not in ('instagram','facebook','youtube','tiktok','x','telegram','twitch','linkedin','spotify','threads','website','snapchat','whatsapp','kick','pinterest') or length(trim(title))<3)) then raise exception 'Configure a rede e o nome dos serviços antes de liberar';end if;
 update public.astros_social_services set manual_visibility=true,enabled=active,updated_at=clock_timestamp() where id=any(services) and (enabled is distinct from active or not manual_visibility);
 return n;
end;$$;
create or replace function public.astros_social_curate(actor uuid,service bigint,active boolean,platform text,label text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 if platform not in ('instagram','facebook','youtube','tiktok','x','telegram','twitch','linkedin','spotify','threads','website','snapchat','whatsapp','kick','pinterest') or length(trim(label)) not between 3 and 180 or active is null then raise exception 'Confira os campos';end if;
 update public.astros_social_services set enabled=active,network=platform,title=trim(label),updated_at=clock_timestamp() where id=service and available;
 if not found then raise exception 'Serviço indisponível';end if;
end;$$;
commit;

-- Manual release only. Provider prices refresh without replacing administrator names.
begin;
alter table public.astros_social_settings add column if not exists manual_catalog_enforced boolean not null default false;
alter table public.astros_social_services add column if not exists provider_metrics jsonb not null default '{}'::jsonb;
-- Hide the previously automatic catalog once. Reapplying this migration preserves later manual releases.
do $$begin
 perform 1 from public.astros_social_settings where id=true for update;
 if exists(select 1 from public.astros_social_settings where id=true and not manual_catalog_enforced) then
  update public.astros_social_services set enabled=false,updated_at=clock_timestamp() where enabled;
  update public.astros_social_settings set manual_catalog_enforced=true,auto_catalog_enabled=false where id=true;
 end if;
end;$$;
create or replace function public.astros_social_apply_automatic() returns void language plpgsql security definer set search_path='' as $$
begin
 -- Classification is independent of publication. Never enable a service here.
 update public.astros_social_services set network=auto_network,title=case when title='' or (auto_classified and not manual_visibility) then provider_name else title end,auto_classified=true,updated_at=clock_timestamp()
 where (auto_classified or (network='' and auto_network<>'')) and (network is distinct from auto_network or title='' or (auto_classified and not manual_visibility and title is distinct from provider_name));
end;$$;
create or replace function public.astros_social_auto_catalog(actor uuid,active boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 if active is distinct from false then raise exception 'A liberação de serviços é exclusivamente manual';end if;
 update public.astros_social_settings set auto_catalog_enabled=false where id=true;
end;$$;
create or replace function public.astros_social_catalog_finish(lease uuid,generation uuid,items jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare s public.astros_social_settings;g uuid;n integer;
begin
 select * into s from public.astros_social_settings where id=true for update;
 select integration_id into g from public.astros_social_private where id=true for share;
 if s.catalog_token is distinct from lease or lease is null or generation is distinct from g or s.catalog_lease_at is null or s.catalog_lease_at<now()-interval '90 seconds' then raise exception 'Sincronização substituída. Atualize a página';end if;
 if items is null or jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 20000 then raise exception 'Catálogo inválido';end if;
 update public.astros_social_services set available=false,updated_at=clock_timestamp() where available and id not in(select (x->>'id')::bigint from jsonb_array_elements(items) x);
 insert into public.astros_social_services(id,provider_name,provider_category,description,rate_units,minimum,maximum,refill,cancel)
 select id,left(name,180),left(category,180),left(description,4000),rate,minimum,maximum,refill,cancel from jsonb_to_recordset(items) as x(id bigint,name text,category text,description text,rate bigint,minimum integer,maximum integer,refill boolean,cancel boolean)
 on conflict(id) do update set
 provider_name=excluded.provider_name,provider_category=excluded.provider_category,description=excluded.description,rate_units=excluded.rate_units,minimum=excluded.minimum,maximum=excluded.maximum,refill=excluded.refill,cancel=excluded.cancel,available=true,
 needs_review=astros_social_services.needs_review or (astros_social_services.provider_name,astros_social_services.provider_category,astros_social_services.description,astros_social_services.minimum,astros_social_services.maximum,astros_social_services.refill,astros_social_services.cancel) is distinct from (excluded.provider_name,excluded.provider_category,excluded.description,excluded.minimum,excluded.maximum,excluded.refill,excluded.cancel),
 enabled=astros_social_services.enabled and (astros_social_services.provider_name,astros_social_services.provider_category,astros_social_services.description,astros_social_services.minimum,astros_social_services.maximum,astros_social_services.refill,astros_social_services.cancel) is not distinct from (excluded.provider_name,excluded.provider_category,excluded.description,excluded.minimum,excluded.maximum,excluded.refill,excluded.cancel),updated_at=clock_timestamp()
 where (astros_social_services.provider_name,astros_social_services.provider_category,astros_social_services.description,astros_social_services.rate_units,astros_social_services.minimum,astros_social_services.maximum,astros_social_services.refill,astros_social_services.cancel,astros_social_services.available) is distinct from (excluded.provider_name,excluded.provider_category,excluded.description,excluded.rate_units,excluded.minimum,excluded.maximum,excluded.refill,excluded.cancel,true);
 update public.astros_social_services c set auto_network=case when x.auto_network in ('instagram','facebook','youtube','tiktok','x','telegram','twitch','linkedin','spotify','threads','website','snapchat','whatsapp','kick','pinterest') then x.auto_network else '' end,auto_type=case when x.auto_type in ('followers','likes','views','comments','shares','subscribers','other') then x.auto_type else 'other' end from jsonb_to_recordset(items) as x(id bigint,auto_network text,auto_type text) where c.id=x.id;
 update public.astros_social_services c set provider_metrics=coalesce(x.metrics,'{}'::jsonb) from jsonb_to_recordset(items) as x(id bigint,metrics jsonb) where c.id=x.id and c.provider_metrics is distinct from coalesce(x.metrics,'{}'::jsonb);
 perform public.astros_social_apply_automatic();
 n:=jsonb_array_length(items);update public.astros_social_settings set catalog_at=clock_timestamp(),catalog_lease_at=null,catalog_token=null,catalog_error=false where id=true;return n;
end;$$;
commit;

-- Read-only customer catalog preferences over the complete released catalog, before pagination.
begin;
create or replace function public.astros_social_client_catalog(filters jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;pg integer:=coalesce((filters->>'page')::integer,0);sorting text:=coalesce(filters->>'sort','default');minp bigint:=(filters->>'minPriceCents')::bigint;maxp bigint:=(filters->>'maxPriceCents')::bigint;minq integer:=(filters->>'minQuantity')::integer;maxq integer:=(filters->>'maxQuantity')::integer;
begin
 if pg not between 0 and 10000 or sorting not in ('default','cheapest','reliability','drop') or coalesce(minp,0)<0 or coalesce(maxp,0)<0 or coalesce(minp,0)>1000000 or coalesce(maxp,0)>1000000 or coalesce(minq,0)<0 or coalesce(maxq,0)<0 or coalesce(minq,0)>100000000 or coalesce(maxq,0)>100000000 or (minp is not null and maxp is not null and minp>maxp) or (minq is not null and maxq is not null and minq>maxq) or length(coalesce(filters->>'region',''))>80 then raise exception 'Confira as preferências';end if;
 with source as (
 select c.*,ceil(c.rate_units::numeric*s.fx_units*(10000+s.margin_bps)/1000000000000)::bigint+s.fee_cents as reference_price_cents,
 case lower(trim(coalesce(c.provider_metrics->>'reliability',''))) when 'high' then 3 when 'alta' then 3 when 'medium' then 2 when 'média' then 2 when 'media' then 2 when 'low' then 1 when 'baixa' then 1 end as reliability_rank,
 case when trim(coalesce(c.provider_metrics->>'drop_rate',c.provider_metrics->>'drop','')) ~ '^([0-9]{1,2}([.,][0-9]+)?|100([.,]0+)?)\s*%$' then replace(regexp_replace(coalesce(c.provider_metrics->>'drop_rate',c.provider_metrics->>'drop'),'\s*%$',''),',','.')::numeric end as drop_percent
 from public.astros_social_services c cross join public.astros_social_settings s where s.id=true and s.enabled and s.fx_units>0 and c.enabled and c.available and not c.needs_review and c.network<>''
 and (coalesce(filters->>'network','all')='all' or c.network=filters->>'network')
 and (coalesce(filters->>'serviceType','all')='all' or coalesce(nullif(c.category_code,''),c.auto_type)=filters->>'serviceType')
 and (coalesce(filters->>'category','')='' or c.provider_category=filters->>'category')
 and (coalesce(filters->>'search','')='' or strpos(lower(c.title||' '||c.provider_name||' '||c.provider_category),lower(filters->>'search'))>0)
 and (coalesce(filters->>'region','')='' or strpos(lower(c.title||' '||c.provider_name||' '||c.provider_category||' '||c.description),lower(filters->>'region'))>0)
 and (minq is null or c.maximum>=minq) and (maxq is null or c.minimum<=maxq)
 ), filtered as (select * from source where reference_price_cents between coalesce(minp,0) and coalesce(maxp,9223372036854775807)),
 numbered as (select *,row_number() over(order by case when sorting='cheapest' then reference_price_cents end asc nulls last,case when sorting='reliability' then reliability_rank end desc nulls last,case when sorting='drop' then drop_percent end asc nulls last,title,id) as position from filtered),
 batch as (select * from numbered where position>pg*500 and position<=pg*500+500 order by position)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(batch) order by position) from batch),'[]'::jsonb),'hasMore',exists(select 1 from numbered where position>pg*500+500),'total',(select count(*) from filtered)) into result;
 return result;
end;$$;
revoke all on function public.astros_social_client_catalog(jsonb) from public,anon,authenticated;
grant execute on function public.astros_social_client_catalog(jsonb) to service_role;
commit;
