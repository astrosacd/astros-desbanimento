-- Additive install: disabled by default; never backfill old accounts or payment orders.
begin;
create table if not exists public.astros_affiliate_settings (
 id boolean primary key default true check(id), enabled boolean not null default false,
 rate_bps integer not null default 0 check(rate_bps between 0 and 10000),
 minimum_cents bigint not null default 0 check(minimum_cents between 0 and 1000000),
 maximum_cents bigint not null default 0 check(maximum_cents between 0 and 1000000),
 worker_at timestamptz, updated_at timestamptz not null default now(),
 check(maximum_cents=0 or maximum_cents>=minimum_cents)
);
insert into public.astros_affiliate_settings(id) values(true) on conflict do nothing;
create table if not exists public.astros_affiliate_accounts (
 user_id uuid primary key references auth.users(id),
 code text not null unique default encode(extensions.gen_random_bytes(16),'hex') check(code ~ '^[a-f0-9]{32}$'),
 rate_bps integer check(rate_bps between 0 and 10000), created_at timestamptz not null default now()
);
create table if not exists public.astros_affiliate_referrals (
 user_id uuid primary key references auth.users(id), referrer_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(), check(user_id<>referrer_id)
);
create index if not exists astros_affiliate_referrer on public.astros_affiliate_referrals(referrer_id,created_at);
create table if not exists public.astros_affiliate_commissions (
 order_id uuid primary key references public.astros_payment_orders(id),
 user_id uuid not null references auth.users(id), referrer_id uuid not null references auth.users(id),
 rate_bps integer not null check(rate_bps between 0 and 10000), amount_cents bigint not null check(amount_cents>0),
 granted_cents bigint not null default 0 check(granted_cents>=0),
 reversed_cents bigint not null default 0 check(reversed_cents>=0 and reversed_cents<=granted_cents),
 refunded_cents bigint not null default 0 check(refunded_cents>=0 and refunded_cents<=amount_cents),
 pending boolean not null default true, revision bigint not null default 0,
 processed_revision bigint not null default -1, attempts integer not null default 0,
 last_error_at timestamptz, retry_at timestamptz not null default now(),
 created_at timestamptz not null default now(), processed_at timestamptz
);
create index if not exists astros_affiliate_pending on public.astros_affiliate_commissions(pending,retry_at,created_at);
create index if not exists astros_affiliate_earnings on public.astros_affiliate_commissions(referrer_id,created_at);
create table if not exists public.astros_affiliate_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 order_id uuid references public.astros_payment_orders(id), referred_id uuid references auth.users(id),
 kind text not null check(kind in ('commission','refund','compensation')),
 amount_cents bigint not null check(amount_cents>0),
 recharge_cents bigint, refunded_cents bigint, rate_bps integer,
 balance_before_cents bigint not null, balance_after_cents bigint not null,
 reference text not null unique, created_at timestamptz not null default now()
);
create index if not exists astros_affiliate_events_owner on public.astros_affiliate_events(user_id,created_at);
create table if not exists public.astros_affiliate_admin_audit (
 id uuid primary key default gen_random_uuid(), actor uuid not null references auth.users(id),
 target_id uuid references auth.users(id), before_value jsonb not null, after_value jsonb not null,
 created_at timestamptz not null default now()
);
create table if not exists public.astros_affiliate_private (
 id boolean primary key default true check(id),
 worker_secret text not null default encode(extensions.gen_random_bytes(32),'hex')
);
insert into public.astros_affiliate_private(id) values(true) on conflict do nothing;
do $$ declare n text;begin
 foreach n in array array['astros_affiliate_settings','astros_affiliate_accounts','astros_affiliate_referrals','astros_affiliate_commissions','astros_affiliate_events','astros_affiliate_admin_audit','astros_affiliate_private'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('revoke all on public.%I from public,anon,authenticated',n);
  execute format('grant all on public.%I to service_role',n);
 end loop;
end $$;

-- Auth INSERT only: later editable metadata can never change attribution.
-- Missing/invalid/paused referrals do not break registration or CAPTCHA.
create or replace function public.astros_affiliate_bind_signup() returns trigger
language plpgsql security definer set search_path='' as $$
declare sponsor uuid; code_value text:=new.raw_user_meta_data->>'astros_referral_code';
begin
 if (select enabled from public.astros_affiliate_settings where id) is not true
  or code_value is null or code_value !~ '^[a-f0-9]{32}$'
  or new.raw_app_meta_data ? 'astros_legacy_import' then return new; end if;
 select a.user_id into sponsor from public.astros_affiliate_accounts a
 join auth.users u on u.id=a.user_id join public.painel_de_desbanimento p on p.id=u.id
 where a.code=code_value and u.email_confirmed_at is not null
 and (u.banned_until is null or u.banned_until<=now()) and p.tipo_usuario in ('cliente','admin');
 if sponsor is null or sponsor=new.id then return new; end if;
 insert into public.astros_affiliate_referrals(user_id,referrer_id) values(new.id,sponsor)
 on conflict(user_id) do nothing;
 return new;
end $$;
revoke all on function public.astros_affiliate_bind_signup() from public,anon,authenticated;
drop trigger if exists astros_affiliate_signup on auth.users;
create trigger astros_affiliate_signup after insert on auth.users for each row execute function public.astros_affiliate_bind_signup();

-- Freeze rules at payment-order creation; no financial eligibility supplied by the browser.
create or replace function public.astros_affiliate_snapshot_order() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.astros_affiliate_settings; sponsor uuid; bps integer;
begin
 select * into s from public.astros_affiliate_settings where id;
 if s.enabled is not true or new.live_mode is not true then return new; end if;
 if new.amount_cents<s.minimum_cents or (s.maximum_cents>0 and new.amount_cents>s.maximum_cents) then return new; end if;
 select r.referrer_id,coalesce(a.rate_bps,s.rate_bps) into sponsor,bps
 from public.astros_affiliate_referrals r join public.astros_affiliate_accounts a on a.user_id=r.referrer_id
 join auth.users u on u.id=a.user_id
 where r.user_id=new.user_id and u.email_confirmed_at is not null
 and (u.banned_until is null or u.banned_until<=now());
 if sponsor is null or bps<=0 or sponsor=new.user_id then return new; end if;
 insert into public.astros_affiliate_commissions(order_id,user_id,referrer_id,rate_bps,amount_cents)
 values(new.id,new.user_id,sponsor,bps,new.amount_cents) on conflict do nothing;
 return new;
end $$;
revoke all on function public.astros_affiliate_snapshot_order() from public,anon,authenticated;
drop trigger if exists astros_affiliate_payment_created on public.astros_payment_orders;
create trigger astros_affiliate_payment_created after insert on public.astros_payment_orders for each row execute function public.astros_affiliate_snapshot_order();
create or replace function public.astros_affiliate_wake_order() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.astros_affiliate_commissions set pending=true,revision=revision+1,retry_at=now() where order_id=new.id;
 return new;
end $$;
revoke all on function public.astros_affiliate_wake_order() from public,anon,authenticated;
drop trigger if exists astros_affiliate_payment_updated on public.astros_payment_orders;
create trigger astros_affiliate_payment_updated after update on public.astros_payment_orders for each row execute function public.astros_affiliate_wake_order();

-- A transparent projection, never a spendable fake balance: available=max(net,0), adjustment=max(-net,0).
-- Record later balance increases that compensate deficits after an affiliate reversal.
create or replace function public.astros_affiliate_note_compensation() returns trigger
language plpgsql security definer set search_path='' as $$
declare before_c bigint:=round(coalesce(old.recarga,0)*100); after_c bigint:=round(coalesce(new.recarga,0)*100); v bigint;
begin
 if before_c<0 and after_c>before_c and exists(select 1 from public.astros_affiliate_commissions where referrer_id=new.id and reversed_cents>0) then
  v:=least(after_c-before_c,-before_c);
  insert into public.astros_affiliate_events(user_id,kind,amount_cents,balance_before_cents,balance_after_cents,reference)
  values(new.id,'compensation',v,before_c,after_c,'affiliate-adjustment:'||gen_random_uuid()::text);
 end if;
 return new;
end $$;
revoke all on function public.astros_affiliate_note_compensation() from public,anon,authenticated;
drop trigger if exists astros_affiliate_compensation on public.painel_de_desbanimento;
create trigger astros_affiliate_compensation after update of recarga on public.painel_de_desbanimento
 for each row execute function public.astros_affiliate_note_compensation();

-- One order per transaction: lease by row lock, atomic ledger/balance/event, safe repeat after timeout.
create or replace function public.astros_affiliate_process_order(p_order uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.astros_affiliate_commissions; o public.astros_payment_orders;
 gross bigint; refunded bigint; target_reversed bigint; delta bigint; b bigint; inserted uuid;
begin
 select * into c from public.astros_affiliate_commissions where order_id=p_order for update skip locked;
 if not found then return jsonb_build_object('busy',true); end if;
 if not c.pending then return jsonb_build_object('repeated',true); end if;
 select * into strict o from public.astros_payment_orders where id=c.order_id;
 if not o.live_mode or o.user_id<>c.user_id or o.amount_cents<>c.amount_cents then raise exception 'Recarga divergente'; end if;
 if o.mp_payment_id is null or not exists (
  select 1 from public.astros_wallet_movements m where m.user_id=c.user_id and m.kind='credit'
  and m.reference=o.mp_payment_id and m.amount_cents=c.amount_cents
 ) then
  update public.astros_affiliate_commissions set pending=false,processed_revision=revision,processed_at=now(),last_error_at=null where order_id=p_order;
  return jsonb_build_object('waitingPayment',true);
 end if;
 -- Pause affects new grants; reversals for already granted commissions always continue.
 if c.granted_cents=0 and (select enabled from public.astros_affiliate_settings where id) is not true then
  update public.astros_affiliate_commissions set retry_at=now()+interval '1 minute' where order_id=p_order;
  return jsonb_build_object('paused',true);
 end if;
 select coalesce(-sum(m.amount_cents),0) into refunded from public.astros_wallet_movements m
 where m.user_id=c.user_id and m.kind='reversal' and m.reference like o.mp_payment_id||':%';
 refunded:=greatest(c.refunded_cents,least(c.amount_cents,refunded));
 gross:=floor(c.amount_cents::numeric*c.rate_bps/10000);
 target_reversed:=gross-floor((c.amount_cents-refunded)::numeric*c.rate_bps/10000);
 select round(coalesce(recarga,0)*100) into b from public.painel_de_desbanimento where id=c.referrer_id for update;
 if not found then raise exception 'Conta do afiliado indisponível'; end if;
 if c.granted_cents=0 and gross>0 then
  insert into public.astros_wallet_movements(user_id,amount_cents,kind,reference)
  values(c.referrer_id,gross,'credit','affiliate:'||p_order::text) returning id into inserted;
  insert into public.astros_affiliate_events(user_id,order_id,referred_id,kind,amount_cents,recharge_cents,rate_bps,balance_before_cents,balance_after_cents,reference)
  values(c.referrer_id,p_order,c.user_id,'commission',gross,c.amount_cents,c.rate_bps,b,b+gross,'affiliate:'||p_order::text);
  update public.painel_de_desbanimento set recarga=(b+gross)/100.0 where id=c.referrer_id;
  b:=b+gross;
 end if;
 delta:=target_reversed-c.reversed_cents;
 if delta>0 then
  insert into public.astros_wallet_movements(user_id,amount_cents,kind,reference)
  values(c.referrer_id,-delta,'reversal','affiliate-refund:'||p_order::text||':'||target_reversed::text);
  insert into public.astros_affiliate_events(user_id,order_id,referred_id,kind,amount_cents,recharge_cents,refunded_cents,rate_bps,balance_before_cents,balance_after_cents,reference)
  values(c.referrer_id,p_order,c.user_id,'refund',delta,c.amount_cents,refunded,c.rate_bps,b,b-delta,'affiliate-refund:'||p_order::text||':'||target_reversed::text);
  update public.painel_de_desbanimento set recarga=(b-delta)/100.0 where id=c.referrer_id;
 end if;
 update public.astros_affiliate_commissions set granted_cents=gross,reversed_cents=target_reversed,refunded_cents=refunded,
 pending=false,processed_revision=revision,processed_at=now(),attempts=0,last_error_at=null where order_id=p_order;
 return jsonb_build_object('processed',true);
end $$;
revoke all on function public.astros_affiliate_process_order(uuid) from public,anon,authenticated;
grant execute on function public.astros_affiliate_process_order(uuid) to service_role;

create or replace function public.astros_affiliate_require_account(p_user uuid) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users u join public.painel_de_desbanimento p on p.id=u.id where u.id=p_user
 and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())
 and coalesce(u.raw_app_meta_data->>'astros_password_change_required','false')<>'true') then raise exception 'Confirme seu acesso à conta'; end if;
end $$;
revoke all on function public.astros_affiliate_require_account(uuid) from public,anon,authenticated;

create or replace function public.astros_affiliate_overview(p_user uuid default null,p_page integer default 1) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target uuid:=coalesce(p_user,actor); a public.astros_affiliate_accounts; s public.astros_affiliate_settings; result jsonb;
begin
 if actor is null or (target<>actor and public.astros_is_admin() is not true) then raise exception 'Acesso não autorizado'; end if;
 perform public.astros_affiliate_require_account(actor);
 if p_page is null or p_page<1 or p_page>100000 then raise exception 'Página inválida'; end if;
 if not exists(select 1 from public.painel_de_desbanimento where id=target) then raise exception 'Conta não encontrada'; end if;
 insert into public.astros_affiliate_accounts(user_id) values(target) on conflict do nothing;
 select * into strict a from public.astros_affiliate_accounts where user_id=target;
 select * into strict s from public.astros_affiliate_settings where id;
 select jsonb_build_object('enabled',s.enabled,'origin',(select origin from public.astros_panel_address where id),'code',a.code,'rateBps',coalesce(a.rate_bps,s.rate_bps),'customRateBps',a.rate_bps,
 'globalRateBps',s.rate_bps,'minimumCents',s.minimum_cents,'maximumCents',s.maximum_cents,
 'workerAt',s.worker_at,'pendingCount',(select count(*) from public.astros_affiliate_commissions where referrer_id=target and pending),
 'referrals',(select count(*) from public.astros_affiliate_referrals where referrer_id=target),
 'payingReferrals',(select count(distinct user_id) from public.astros_affiliate_commissions where referrer_id=target and granted_cents>0),
 'earnedCents',(select coalesce(sum(granted_cents),0) from public.astros_affiliate_commissions where referrer_id=target),
 'reversedCents',(select coalesce(sum(reversed_cents),0) from public.astros_affiliate_commissions where referrer_id=target),
 'availableCents',greatest(0,round(coalesce(p.recarga,0)*100)),
 'adjustmentCents',greatest(0,-round(coalesce(p.recarga,0)*100)),
 'events',(select coalesce(jsonb_agg(v.row order by v.created_at desc,v.id desc),'[]'::jsonb) from (
  select e.created_at,e.id,jsonb_build_object('id',e.id,'kind',e.kind,'amountCents',e.amount_cents,
   'orderId',e.order_id,'rechargeCents',e.recharge_cents,'refundedCents',e.refunded_cents,'rateBps',e.rate_bps,
   'beforeCents',e.balance_before_cents,'afterCents',e.balance_after_cents,'createdAt',e.created_at,
   'referredLabel',case when e.referred_id is null then null else 'Indicado '||left(e.referred_id::text,8) end) row
  from public.astros_affiliate_events e where e.user_id=target
  order by e.created_at desc,e.id desc limit 21 offset (p_page-1)*20
 ) v)) into result from public.painel_de_desbanimento p where p.id=target;
 return result;
end $$;
revoke all on function public.astros_affiliate_overview(uuid,integer) from public,anon;
grant execute on function public.astros_affiliate_overview(uuid,integer) to authenticated;

create or replace function public.astros_affiliate_admin_config(p_target uuid default null,p_value jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.astros_affiliate_settings; before_v jsonb; after_v jsonb; bps integer; minimum_v bigint; maximum_v bigint;
begin
 if auth.uid() is null or public.astros_is_admin() is not true then raise exception 'Acesso administrativo necessário'; end if;
 perform public.astros_affiliate_require_account(auth.uid());
 select * into strict s from public.astros_affiliate_settings where id for update;
 if p_target is null then
  before_v:=jsonb_build_object('enabled',s.enabled,'rateBps',s.rate_bps,'minimumCents',s.minimum_cents,'maximumCents',s.maximum_cents);
  if p_value is not null then
   if jsonb_typeof(p_value->'enabled')<>'boolean' or jsonb_typeof(p_value->'rateBps')<>'number' or jsonb_typeof(p_value->'minimumCents')<>'number' or jsonb_typeof(p_value->'maximumCents')<>'number' then raise exception 'Configuração inválida'; end if;
   bps:=(p_value->>'rateBps')::integer; minimum_v:=(p_value->>'minimumCents')::bigint; maximum_v:=(p_value->>'maximumCents')::bigint;
   if (p_value->>'enabled')::boolean and (s.worker_at is null or s.worker_at<now()-interval '5 minutes') then raise exception 'Execute a rotina de afiliação antes de ativar'; end if;
   update public.astros_affiliate_settings set enabled=(p_value->>'enabled')::boolean,rate_bps=bps,minimum_cents=minimum_v,maximum_cents=maximum_v,updated_at=now() where id;
  end if;
  select jsonb_build_object('enabled',enabled,'rateBps',rate_bps,'minimumCents',minimum_cents,'maximumCents',maximum_cents,'workerAt',worker_at,
   'pendingCount',(select count(*) from public.astros_affiliate_commissions where pending),
   'errorCount',(select count(*) from public.astros_affiliate_commissions where last_error_at is not null)) into after_v from public.astros_affiliate_settings where id;
 else
  if not exists(select 1 from public.painel_de_desbanimento where id=p_target) then raise exception 'Conta não encontrada'; end if;
  insert into public.astros_affiliate_accounts(user_id) values(p_target) on conflict do nothing;
  select jsonb_build_object('customRateBps',rate_bps) into before_v from public.astros_affiliate_accounts where user_id=p_target for update;
  if p_value is not null then
   if not p_value ? 'customRateBps' then raise exception 'Configuração inválida'; end if;
   update public.astros_affiliate_accounts set rate_bps=(p_value->>'customRateBps')::integer where user_id=p_target;
  end if;
  select jsonb_build_object('customRateBps',rate_bps,'globalRateBps',s.rate_bps) into after_v from public.astros_affiliate_accounts where user_id=p_target;
 end if;
 if p_value is not null then insert into public.astros_affiliate_admin_audit(actor,target_id,before_value,after_value) values(auth.uid(),p_target,before_v,after_v); end if;
 return after_v;
end $$;
revoke all on function public.astros_affiliate_admin_config(uuid,jsonb) from public,anon;
grant execute on function public.astros_affiliate_admin_config(uuid,jsonb) to authenticated;
create or replace function public.astros_affiliate_worker_authorize(p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join public.painel_de_desbanimento p on p.id=u.id
 where u.id=p_actor and p.tipo_usuario='admin' and u.email_confirmed_at is not null
 and (u.banned_until is null or u.banned_until<=now())
 and coalesce(u.raw_app_meta_data->>'astros_password_change_required','false')<>'true');
$$;
revoke all on function public.astros_affiliate_worker_authorize(uuid) from public,anon,authenticated;
grant execute on function public.astros_affiliate_worker_authorize(uuid) to service_role;
commit;
