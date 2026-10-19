-- Ativação CNPJ
begin;
-- Additive CNPJ modality. No changes to Maps queues, cursors, quotas or dispatch.
create table if not exists public.astros_cnpj_settings(id boolean primary key default true check(id),enabled boolean not null default false,unit_cents integer not null default 0 check(unit_cents between 0 and 10000),enrich_enabled boolean not null default false,enrich_cents integer not null default 0 check(enrich_cents between 0 and 10000),daily_requests integer not null default 5 check(daily_requests between 1 and 100),daily_calls integer not null default 20 check(daily_calls between 1 and 10000),minute_calls integer not null default 5 check(minute_calls between 1 and 100),cache_days integer not null default 7 check(cache_days between 1 and 30));
create table if not exists public.astros_cnpj_private(id boolean primary key default true check(id),api_key text not null default '');
insert into public.astros_cnpj_settings(id) values(true) on conflict do nothing;
insert into public.astros_cnpj_private(id) values(true) on conflict do nothing;
create table if not exists public.astros_cnpj_queries(id text primary key,page integer not null default 1,exhausted boolean not null default false,fetched_at timestamptz not null default now(),lease_id uuid,lease_until timestamptz);
create table if not exists public.astros_cnpj_businesses(cnpj text primary key check(cnpj~'^[0-9]{14}$'),snapshot jsonb not null,updated_at timestamptz not null default now());
create table if not exists public.astros_cnpj_matches(query_id text references public.astros_cnpj_queries(id),cnpj text references public.astros_cnpj_businesses(cnpj),seen_at timestamptz not null default now(),primary key(query_id,cnpj));
create table if not exists public.astros_cnpj_requests(id uuid primary key,user_id uuid not null references public.painel_de_desbanimento(id) on delete cascade,operation text not null check(operation in ('search','lookup','enrich')),criteria jsonb not null,query_id text references public.astros_cnpj_queries(id),lead_id uuid,quantity integer not null check(quantity between 1 and 20),unit_cents integer not null check(unit_cents between 0 and 10000),state text not null default 'processing' check(state in ('processing','completed','failed')),delivered integer not null default 0,charged_cents integer not null default 0,diagnostic text not null default '',created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '5 minutes',completed_at timestamptz);
create table if not exists public.astros_cnpj_deliveries(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.painel_de_desbanimento(id) on delete cascade,cnpj text not null references public.astros_cnpj_businesses(cnpj),request_id uuid not null references public.astros_cnpj_requests(id),snapshot jsonb not null,original_snapshot jsonb not null,status text not null default 'new' check(status in ('new','contacted','negotiating','won','discarded')),created_at timestamptz not null default now(),unique(user_id,cnpj));
create table if not exists public.astros_cnpj_calls(request_id uuid primary key references public.astros_cnpj_requests(id),provider text not null check(provider in ('casa','receita')),created_at timestamptz not null default now());
create index if not exists astros_cnpj_delivery_owner on public.astros_cnpj_deliveries(user_id,status,created_at desc);
create index if not exists astros_cnpj_request_owner on public.astros_cnpj_requests(user_id,created_at desc);
create index if not exists astros_cnpj_provider_calls on public.astros_cnpj_calls(provider,created_at);
do $$declare t text;begin foreach t in array array['astros_cnpj_settings','astros_cnpj_private','astros_cnpj_queries','astros_cnpj_businesses','astros_cnpj_matches','astros_cnpj_requests','astros_cnpj_deliveries','astros_cnpj_calls'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end $$;
create or replace function public.astros_cnpj_config(actor uuid,administrator boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.astros_cnpj_settings;begin
 perform public.astros_prospect_actor(actor,administrator);select * into s from public.astros_cnpj_settings where id;
 return jsonb_build_object('installed',true,'enabled',s.enabled,'unitCents',s.unit_cents,'enrichEnabled',s.enrich_enabled,'enrichCents',s.enrich_cents)||case when administrator then jsonb_build_object('dailyRequests',s.daily_requests,'dailyCalls',s.daily_calls,'minuteCalls',s.minute_calls,'cacheDays',s.cache_days,'hasKey',exists(select 1 from public.astros_cnpj_private where id and api_key<>'')) else '{}'::jsonb end;
end $$;
create or replace function public.astros_cnpj_save(actor uuid,settings jsonb,new_key text default '') returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.astros_prospect_actor(actor,true);
 if new_key is null or length(new_key)>500 or new_key~'[[:cntrl:]]' then raise exception 'Configuração CNPJ inválida';end if;
 perform 1 from public.astros_cnpj_settings where id for update;
 if new_key<>'' then update public.astros_cnpj_private set api_key=new_key where id;end if;
 if (settings->>'enabled')::boolean and not exists(select 1 from public.astros_cnpj_private where id and api_key<>'') then raise exception 'Configure a chave CNPJ antes de ativar';end if;
 update public.astros_cnpj_settings set enabled=(settings->>'enabled')::boolean,unit_cents=(settings->>'unitCents')::integer,enrich_enabled=(settings->>'enrichEnabled')::boolean,enrich_cents=(settings->>'enrichCents')::integer,daily_requests=(settings->>'dailyRequests')::integer,daily_calls=(settings->>'dailyCalls')::integer,minute_calls=(settings->>'minuteCalls')::integer,cache_days=(settings->>'cacheDays')::integer where id;
end $$;
create or replace function public.astros_cnpj_candidates(actor uuid,query_key text,cap integer) returns setof public.astros_cnpj_businesses language sql stable security definer set search_path='' as $$
 select b.* from public.astros_cnpj_matches m join public.astros_cnpj_businesses b on b.cnpj=m.cnpj cross join public.astros_cnpj_settings s where m.query_id=query_key and b.updated_at>now()-make_interval(days=>s.cache_days) and m.seen_at>now()-make_interval(days=>s.cache_days) and not exists(select 1 from public.astros_cnpj_deliveries d where d.user_id=actor and d.cnpj=b.cnpj) order by m.seen_at desc,b.cnpj limit greatest(0,least(cap,20));
$$;
create or replace function public.astros_cnpj_begin(actor uuid,request_id uuid,op text,input jsonb,wanted integer,expected_unit integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.astros_cnpj_settings;r public.astros_cnpj_requests;q public.astros_cnpj_queries;d public.astros_cnpj_deliveries;balance numeric;key text;fetch_needed boolean;provider_name text;day_start timestamptz:=date_trunc('day',now() at time zone 'America/Fortaleza') at time zone 'America/Fortaleza';
begin
 perform public.astros_prospect_actor(actor);
 select recarga into balance from public.painel_de_desbanimento where id=actor for update;
 select * into r from public.astros_cnpj_requests where id=request_id for update;
 if found then
  if r.user_id<>actor or r.operation<>op or r.criteria is distinct from input or r.quantity is distinct from wanted or r.unit_cents is distinct from expected_unit then raise exception 'Referência CNPJ divergente';end if;
  return jsonb_build_object('run',false,'request',(to_jsonb(r)-'user_id'-'diagnostic'||jsonb_build_object('failureReason',case when r.diagnostic='balance' then 'balance' when r.state='failed' then 'unavailable' else null end)));
 end if;
 select * into s from public.astros_cnpj_settings where id for update;
 if not s.enabled then raise exception 'Busca CNPJ temporariamente indisponível';end if;
 if request_id is null or op not in ('search','lookup','enrich') or wanted is null or wanted not between 1 and 20 or expected_unit is distinct from (case when input?'refreshLeadId' then 0 when op='enrich' then s.enrich_cents else s.unit_cents end) then raise exception 'Consulte o preço CNPJ novamente';end if;
 if input is null or jsonb_typeof(input)<>'object' or length(input::text)>2000 then raise exception 'Filtros CNPJ inválidos';end if;
 if input?'refreshLeadId' then
  if op<>'lookup' or wanted<>1 then raise exception 'Filtros CNPJ inválidos';end if;
  select * into d from public.astros_cnpj_deliveries where id=(input->>'refreshLeadId')::uuid and user_id=actor;
  if not found or d.cnpj is distinct from input->>'cnpj' then raise exception 'Lead CNPJ não encontrado';end if;
 end if;
 if op='enrich' then
  if not s.enrich_enabled then raise exception 'Consulta complementar indisponível';end if;
  select * into d from public.astros_cnpj_deliveries where id=(input->>'leadId')::uuid and user_id=actor;
  if not found or d.cnpj is distinct from input->>'cnpj' then raise exception 'Lead CNPJ não encontrado';end if;
 end if;
 update public.astros_cnpj_requests set state='failed',diagnostic='expired',completed_at=now() where user_id=actor and state='processing' and expires_at<=now();
 if exists(select 1 from public.astros_cnpj_requests where user_id=actor and state='processing') then raise exception 'Confira a consulta CNPJ em andamento';end if;
 if (select count(*) from public.astros_cnpj_requests where user_id=actor and created_at>=day_start)>=s.daily_requests then raise exception 'Limite diário de consultas CNPJ atingido';end if;
 key:=md5(input::text||op);
 if op<>'enrich' then
  insert into public.astros_cnpj_queries(id) values(key) on conflict do nothing;
  select * into q from public.astros_cnpj_queries where id=key for update;
  if q.fetched_at<now()-make_interval(days=>s.cache_days) and coalesce(q.lease_until,now())<=now() then update public.astros_cnpj_queries set page=1,exhausted=false,fetched_at=now() where id=key returning * into q;end if;
  fetch_needed:=(select count(*) from public.astros_cnpj_candidates(actor,key,wanted))<wanted and not q.exhausted;
  if input?'refreshLeadId' then fetch_needed:=true;elsif op='lookup' and exists(select 1 from public.astros_cnpj_deliveries where user_id=actor and cnpj=input->>'cnpj') then fetch_needed:=false;end if;
  if fetch_needed and q.lease_until>now() then raise exception 'Esta pesquisa CNPJ já está em andamento';end if;
 else fetch_needed:=coalesce((d.snapshot->>'enriched')::boolean,false)=false;end if;
 if coalesce(balance,0)<wanted*expected_unit/100.0 and not (op='enrich' and not fetch_needed) and not (op='lookup' and exists(select 1 from public.astros_cnpj_deliveries where user_id=actor and cnpj=input->>'cnpj')) then raise exception 'Saldo insuficiente. Faça uma recarga';end if;
 provider_name:=case when op='enrich' then 'receita' else 'casa' end;
 if fetch_needed and ((select count(*) from public.astros_cnpj_calls where created_at>=day_start)>=s.daily_calls or (select count(*) from public.astros_cnpj_calls where provider=provider_name and created_at>now()-interval '1 minute')>=case when op='enrich' then 3 else s.minute_calls end) then raise exception 'Limite de consultas CNPJ ao fornecedor atingido';end if;
 insert into public.astros_cnpj_requests(id,user_id,operation,criteria,query_id,lead_id,quantity,unit_cents) values(request_id,actor,op,input,case when op<>'enrich' then key else null end,case when op='enrich' then d.id else null end,wanted,expected_unit) returning * into r;
 if fetch_needed then
  insert into public.astros_cnpj_calls(request_id,provider) values(request_id,provider_name);
  if op<>'enrich' then update public.astros_cnpj_queries set lease_id=request_id,lease_until=now()+interval '5 minutes' where id=key;end if;
 end if;
 return jsonb_build_object('run',true,'fetch',fetch_needed,'page',coalesce(q.page,1),'request',(to_jsonb(r)-'user_id'-'diagnostic'||jsonb_build_object('failureReason',case when r.diagnostic='balance' then 'balance' when r.state='failed' then 'unavailable' else null end)));
end $$;
create or replace function public.astros_cnpj_finish(actor uuid,request_id uuid,rows_input jsonb default '[]',has_next boolean default false,failure text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.astros_cnpj_requests;q public.astros_cnpj_queries;item jsonb;ids text[];n integer:=0;charge integer:=0;balance numeric;d public.astros_cnpj_deliveries;
begin
 perform public.astros_prospect_actor(actor);
 select recarga into balance from public.painel_de_desbanimento where id=actor for update;
 select * into r from public.astros_cnpj_requests where id=request_id and user_id=actor for update;
 if not found then raise exception 'Consulta CNPJ não encontrada';end if;
 if r.state<>'processing' then return (to_jsonb(r)-'user_id'-'diagnostic'||jsonb_build_object('failureReason',case when r.diagnostic='balance' then 'balance' when r.state='failed' then 'unavailable' else null end));end if;
 if r.expires_at<=now() then failure:='expired';end if;
 if jsonb_typeof(rows_input)<>'array' or jsonb_array_length(rows_input)>20 then raise exception 'Resposta CNPJ inválida';end if;
 if r.query_id is not null then select * into q from public.astros_cnpj_queries where id=r.query_id for update;end if;
 if failure<>'' then
  update public.astros_cnpj_requests set state='failed',diagnostic=case when failure in ('expired','provider','invalid','auth','billing','forbidden','request','not_found','rate','outage','http','timeout','connection') then failure else 'provider' end,completed_at=now() where id=r.id returning * into r;
  if q.lease_id=r.id then update public.astros_cnpj_queries set lease_id=null,lease_until=null where id=q.id;end if;
  return (to_jsonb(r)-'user_id'-'diagnostic'||jsonb_build_object('failureReason',case when r.diagnostic='balance' then 'balance' when r.state='failed' then 'unavailable' else null end));
 end if;
 if r.criteria?'refreshLeadId' then
  select * into d from public.astros_cnpj_deliveries where id=(r.criteria->>'refreshLeadId')::uuid and user_id=actor for update;
  if not found then raise exception 'Lead CNPJ não encontrado';end if;
  if jsonb_array_length(rows_input)<>1 then raise exception 'Resposta CNPJ inválida';end if;
  item:=rows_input->0;
  if item->>'cnpj' is distinct from d.cnpj or item->>'source' is distinct from 'cnpj' then raise exception 'Resposta CNPJ inválida';end if;
  update public.astros_cnpj_deliveries set snapshot=item||jsonb_build_object('enriched',coalesce((d.snapshot->>'enriched')::boolean,false),'contacts',coalesce((select jsonb_agg(v) from(select distinct value as v from jsonb_array_elements(coalesce(item->'contacts','[]')||coalesce(d.snapshot->'contacts','[]')) limit 20)c),'[]'::jsonb)) where id=d.id;
  update public.astros_cnpj_businesses set snapshot=item,updated_at=now() where cnpj=d.cnpj;
  if q.lease_id=r.id then update public.astros_cnpj_queries set lease_id=null,lease_until=null where id=q.id;end if;
 elsif r.operation='enrich' then
  select * into d from public.astros_cnpj_deliveries where id=r.lead_id and user_id=actor for update;
  if not found then raise exception 'Lead CNPJ não encontrado';end if;
  if coalesce((d.snapshot->>'enriched')::boolean,false)=false and jsonb_array_length(rows_input)=1 then
   item:=rows_input->0;
   if item->>'cnpj' is distinct from d.cnpj or item->>'source' is distinct from 'cnpj' then raise exception 'Resposta CNPJ inválida';end if;
   charge:=r.unit_cents;
   if coalesce(balance,0)<charge/100.0 then failure:='balance';else update public.astros_cnpj_deliveries set snapshot=item||jsonb_build_object('enriched',true) where id=d.id;end if;
  end if;
 else
  if q.lease_id=r.id and q.lease_until>now() then
   for item in select value from jsonb_array_elements(rows_input) loop
    if coalesce(item->>'cnpj','')!~'^[0-9]{14}$' or coalesce(length(item->>'name'),0) not between 1 and 200 or item->>'source' is distinct from 'cnpj' then raise exception 'Resposta CNPJ inválida';end if;
    insert into public.astros_cnpj_businesses(cnpj,snapshot) values(item->>'cnpj',item) on conflict(cnpj) do update set snapshot=excluded.snapshot,updated_at=now();
    insert into public.astros_cnpj_matches(query_id,cnpj) values(q.id,item->>'cnpj') on conflict(query_id,cnpj) do update set seen_at=now();
   end loop;
   update public.astros_cnpj_queries set page=page+1,exhausted=not has_next,fetched_at=now(),lease_id=null,lease_until=null where id=q.id;
  end if;
  select array_agg(cnpj) into ids from public.astros_cnpj_candidates(actor,q.id,r.quantity);
  n:=coalesce(cardinality(ids),0);charge:=n*r.unit_cents;
  if coalesce(balance,0)<charge/100.0 then failure:='balance';else
   insert into public.astros_cnpj_deliveries(user_id,cnpj,request_id,snapshot,original_snapshot) select actor,b.cnpj,r.id,b.snapshot,b.snapshot from public.astros_cnpj_businesses b where b.cnpj=any(ids);
  end if;
 end if;
 if failure<>'' then update public.astros_cnpj_requests set state='failed',diagnostic='balance',completed_at=now() where id=r.id returning * into r;return (to_jsonb(r)-'user_id'-'diagnostic'||jsonb_build_object('failureReason',case when r.diagnostic='balance' then 'balance' when r.state='failed' then 'unavailable' else null end));end if;
 if charge>0 then
  update public.painel_de_desbanimento set recarga=recarga-charge/100.0 where id=actor;
  insert into public.astros_wallet_movements(user_id,amount_cents,kind,reference) values(actor,-charge,'debit','prospect:cnpj:'||r.id);
 end if;
 update public.astros_cnpj_requests set state='completed',delivered=n,charged_cents=charge,completed_at=now() where id=r.id returning * into r;
 return (to_jsonb(r)-'user_id'-'diagnostic'||jsonb_build_object('failureReason',case when r.diagnostic='balance' then 'balance' when r.state='failed' then 'unavailable' else null end));
end $$;
create or replace function public.astros_cnpj_status(actor uuid,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.astros_cnpj_requests;begin
 perform public.astros_prospect_actor(actor);
 update public.astros_cnpj_requests set state='failed',diagnostic='expired',completed_at=now() where id=request_id and user_id=actor and state='processing' and expires_at<=now();
 select * into r from public.astros_cnpj_requests where id=request_id and user_id=actor;
 if not found then raise exception 'Consulta CNPJ não encontrada';end if;return (to_jsonb(r)-'user_id'-'diagnostic'||jsonb_build_object('failureReason',case when r.diagnostic='balance' then 'balance' when r.state='failed' then 'unavailable' else null end));
end $$;
create or replace function public.astros_prospect_crm_history(actor uuid,page_number integer default 0,search_text text default '',stage text default 'all',source_filter text default 'all') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 perform public.astros_prospect_actor(actor);
 if page_number is null or page_number not between 0 and 10000 or length(search_text)>80 or stage not in ('all','new','contacted','negotiating','won','discarded') or source_filter not in ('all','maps','cnpj') then raise exception 'Filtro inválido';end if;
 with combined as (
  select id,snapshot,status,created_at,request_id,'maps' as source from public.astros_prospect_deliveries where user_id=actor and source_filter in ('all','maps')
  union all select id,snapshot,status,created_at,request_id,'cnpj' from public.astros_cnpj_deliveries where user_id=actor and source_filter in ('all','cnpj')
 ), filtered as(select * from combined where (stage='all' or status=stage) and (search_text='' or position(lower(search_text) in lower(coalesce(snapshot->>'name','')||' '||coalesce(snapshot->>'cnpj','')))>0)), page as(select * from filtered order by created_at desc,id desc offset page_number*20 limit 21)
 select jsonb_build_object('leads',coalesce((select jsonb_agg(to_jsonb(p) order by created_at desc,id desc) from(select * from page order by created_at desc,id desc limit 20)p),'[]'::jsonb),'hasMore',(select count(*)>20 from page)) into result;return result;
end $$;
create or replace function public.astros_prospect_crm_summary(actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin perform public.astros_prospect_actor(actor);
 select jsonb_build_object('total',count(*),'new',count(*) filter(where status='new'),'contacted',count(*) filter(where status='contacted'),'negotiating',count(*) filter(where status='negotiating'),'won',count(*) filter(where status='won'),'discarded',count(*) filter(where status='discarded')) into result from(select status from public.astros_prospect_deliveries where user_id=actor union all select status from public.astros_cnpj_deliveries where user_id=actor)d;return result;
end $$;
create or replace function public.astros_cnpj_stage(actor uuid,lead_id uuid,stage text) returns void language plpgsql security definer set search_path='' as $$
begin perform public.astros_prospect_actor(actor);if stage not in ('new','contacted','negotiating','won','discarded') then raise exception 'Filtro inválido';end if;update public.astros_cnpj_deliveries set status=stage where id=lead_id and user_id=actor;if not found then raise exception 'Lead CNPJ não encontrado';end if;end $$;
-- Service-only signatures, including internal cache helpers.
revoke all on function public.astros_cnpj_config(uuid,boolean),public.astros_cnpj_save(uuid,jsonb,text),public.astros_cnpj_candidates(uuid,text,integer),public.astros_cnpj_begin(uuid,uuid,text,jsonb,integer,integer),public.astros_cnpj_finish(uuid,uuid,jsonb,boolean,text),public.astros_cnpj_status(uuid,uuid),public.astros_prospect_crm_history(uuid,integer,text,text,text),public.astros_prospect_crm_summary(uuid),public.astros_cnpj_stage(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.astros_cnpj_config(uuid,boolean),public.astros_cnpj_save(uuid,jsonb,text),public.astros_cnpj_candidates(uuid,text,integer),public.astros_cnpj_begin(uuid,uuid,text,jsonb,integer,integer),public.astros_cnpj_finish(uuid,uuid,jsonb,boolean,text),public.astros_cnpj_status(uuid,uuid),public.astros_prospect_crm_history(uuid,integer,text,text,text),public.astros_prospect_crm_summary(uuid),public.astros_cnpj_stage(uuid,uuid,text) to service_role;
commit;

-- Executar após 20261019_prospecting_cnpj.sql; inclui ambas as origens sem duplicar entradas.
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
  case when m.reference like 'prospect:%' then 'prospect_debit'
       when m.reference like 'social:%' then 'social_debit'
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
   coalesce(-sum(amount_cents) filter(where category='prospect_debit'),0) prospect_debits,
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
 ), prospect_jobs as (
  select count(*) filter(where state='completed') completed_count,coalesce(sum(charged_cents) filter(where state='completed'),0) completed_sales,coalesce(sum(delivered) filter(where state='completed'),0) delivered from (select state,charged_cents,delivered,created_at from public.astros_prospect_requests union all select state,charged_cents,delivered,created_at from public.astros_cnpj_requests) operations where created_at>=start_at and created_at<end_at
 ), daily as (
  select (m.created_at at time zone 'America/Fortaleza')::date as day_bucket,
   coalesce(sum(amount_cents) filter(where category='payment_credit'),0) received,
   coalesce(-sum(amount_cents) filter(where category in ('service_debit','sms_debit','social_debit','prospect_debit')),0) consumed,
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
  'prospect',jsonb_build_object('debitsCents',t.prospect_debits,'netCents',t.prospect_debits,'completedCount',pr.completed_count,'completedSalesCents',pr.completed_sales,'deliveredCount',pr.delivered),
  'daily',(select coalesce(jsonb_agg(jsonb_build_object('date',days.day_bucket::date,'receivedCents',coalesce(d.received,0),'consumedCents',coalesce(d.consumed,0),'returnedCents',coalesce(d.returned,0)) order by days.day_bucket),'[]'::jsonb) from generate_series(date_from::timestamp,date_until::timestamp,interval '1 day') days(day_bucket) left join daily d on d.day_bucket=days.day_bucket::date)
 ) into result from totals t cross join service_jobs j cross join sms_jobs s cross join social_jobs so cross join prospect_jobs pr;
 return result;
end;$$;
revoke all on function public.astros_financial_dashboard(date,date) from public,anon,authenticated;
grant execute on function public.astros_financial_dashboard(date,date) to authenticated;
commit;
