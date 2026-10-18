begin;
create table if not exists public.astros_prospect_settings(id boolean primary key default true check(id),enabled boolean not null default false,unit_cents integer not null default 0 check(unit_cents between 0 and 10000),cache_days integer not null default 7 check(cache_days between 1 and 30),daily_requests integer not null default 5 check(daily_requests between 1 and 100),daily_calls integer not null default 20 check(daily_calls between 1 and 5000),updated_at timestamptz not null default now());
create table if not exists public.astros_prospect_private(id boolean primary key default true check(id),api_key text not null default '');
insert into public.astros_prospect_settings(id) values(true) on conflict do nothing;
insert into public.astros_prospect_private(id) values(true) on conflict do nothing;
create table if not exists public.astros_prospect_queries(id text primary key,niche text not null,country text not null,city text not null,region text not null default '',cursor integer not null default 0 check(cursor between 0 and 120 and cursor%20=0),exhausted boolean not null default false,refreshed_at timestamptz not null default now(),lease_id uuid,lease_until timestamptz);
create table if not exists public.astros_prospect_businesses(id text primary key,data jsonb not null,updated_at timestamptz not null default now());
create table if not exists public.astros_prospect_matches(query_id text not null references public.astros_prospect_queries(id) on delete cascade,business_id text not null references public.astros_prospect_businesses(id),seen_at timestamptz not null default now(),primary key(query_id,business_id));
create table if not exists public.astros_prospect_requests(id uuid primary key,user_id uuid not null references public.painel_de_desbanimento(id) on delete cascade,criteria jsonb not null,query_id text not null references public.astros_prospect_queries(id),quantity integer not null check(quantity between 1 and 20),unit_cents integer not null check(unit_cents between 0 and 10000),state text not null default 'processing' check(state in ('processing','completed','failed')),delivered integer not null default 0,charged_cents integer not null default 0,diagnostic text not null default '',created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '3 minutes',completed_at timestamptz);
create table if not exists public.astros_prospect_deliveries(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.painel_de_desbanimento(id) on delete cascade,business_id text not null references public.astros_prospect_businesses(id),request_id uuid not null references public.astros_prospect_requests(id) on delete cascade,snapshot jsonb not null,status text not null default 'new' check(status in ('new','contacted','negotiating','won','discarded')),created_at timestamptz not null default now(),unique(user_id,business_id));
create table if not exists public.astros_prospect_usage(day date primary key,calls integer not null default 0);
create index if not exists astros_prospect_request_owner on public.astros_prospect_requests(user_id,created_at desc);
create index if not exists astros_prospect_delivery_owner on public.astros_prospect_deliveries(user_id,created_at desc);
create index if not exists astros_prospect_match_business on public.astros_prospect_matches(business_id);
-- All writes and the shared catalog remain service-only; no browser can enumerate the common base.
do $$declare t text;begin foreach t in array array['astros_prospect_settings','astros_prospect_private','astros_prospect_queries','astros_prospect_businesses','astros_prospect_matches','astros_prospect_requests','astros_prospect_deliveries','astros_prospect_usage'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end $$;
create or replace function public.astros_prospect_actor(actor uuid,administrator boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.painel_de_desbanimento p join auth.users u on u.id=p.id where p.id=actor and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()) and coalesce((u.raw_app_meta_data->>'astros_password_change_required')::boolean,false)=false and (not administrator or p.tipo_usuario='admin')) then raise exception 'Conta indisponível';end if;
end $$;
create or replace function public.astros_prospect_candidates(actor uuid,query_key text,site_filter text,cap integer) returns setof public.astros_prospect_businesses language sql stable security definer set search_path='' as $$
 select b.* from public.astros_prospect_matches m join public.astros_prospect_businesses b on b.id=m.business_id cross join public.astros_prospect_settings s where m.query_id=query_key and m.seen_at>now()-make_interval(days=>s.cache_days) and b.updated_at>now()-make_interval(days=>s.cache_days) and not exists(select 1 from public.astros_prospect_deliveries d where d.user_id=actor and d.business_id=b.id) and (site_filter='all' or b.data->>'websiteStatus'=site_filter) order by m.seen_at desc,b.id limit greatest(0,least(cap,20));
$$;
create or replace function public.astros_prospect_save(actor uuid,active boolean,unit_price integer,retention_days integer,request_limit integer,call_limit integer,new_key text default '') returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.astros_prospect_actor(actor,true);
 if active is null or unit_price is null or retention_days is null or request_limit is null or call_limit is null or unit_price not between 0 and 10000 or retention_days not between 1 and 30 or request_limit not between 1 and 100 or call_limit not between 1 and 5000 or new_key is null or length(new_key)>200 or (new_key<>'' and new_key!~'^[A-Za-z0-9_-]{20,200}$') then raise exception 'Configuração inválida';end if;
 perform 1 from public.astros_prospect_settings where id for update;
 if new_key<>'' then update public.astros_prospect_private set api_key=new_key where id;end if;
 if active and not exists(select 1 from public.astros_prospect_private where id and api_key<>'') then raise exception 'Configure a chave antes de ativar';end if;
 update public.astros_prospect_settings set enabled=active,unit_cents=unit_price,cache_days=retention_days,daily_requests=request_limit,daily_calls=call_limit,updated_at=now() where id;
end $$;
create or replace function public.astros_prospect_begin(actor uuid,request_id uuid,criteria_input jsonb,wanted integer,expected_unit integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.astros_prospect_settings;r public.astros_prospect_requests;q public.astros_prospect_queries;balance numeric;query_key text;cached_count integer;today date:=(now() at time zone 'America/Fortaleza')::date;calls integer;
begin
 perform public.astros_prospect_actor(actor);
 if request_id is null then raise exception 'Referência inválida';end if;
 select recarga into balance from public.painel_de_desbanimento where id=actor for update;
 select * into r from public.astros_prospect_requests where id=request_id for update;
 if found then
  if r.user_id<>actor or r.criteria is distinct from criteria_input or r.quantity is distinct from wanted or r.unit_cents is distinct from expected_unit then raise exception 'Referência divergente';end if;
  if r.state='processing' and r.expires_at<=now() then update public.astros_prospect_requests set state='failed',diagnostic='expired',completed_at=now() where id=r.id returning * into r;end if;
  return jsonb_build_object('run',false,'request',to_jsonb(r)-'criteria'-'query_id'-'diagnostic'-'user_id');
 end if;
 select * into s from public.astros_prospect_settings where id for share;
 if not s.enabled then raise exception 'Prospecção temporariamente indisponível';end if;
 if wanted is null or wanted not between 1 and 20 or expected_unit is distinct from s.unit_cents then raise exception 'Consulte o preço novamente';end if;
 if jsonb_typeof(criteria_input)<>'object' or coalesce(length(criteria_input->>'niche'),0) not between 2 and 80 or coalesce(length(criteria_input->>'city'),0) not between 2 and 80 or coalesce(length(criteria_input->>'region'),0)>80 or coalesce(criteria_input->>'country','')!~'^[A-Z]{2}$' or coalesce(criteria_input->>'filter','') not in ('all','missing','social','online','offline','unknown') then raise exception 'Busca inválida';end if;
 if coalesce(balance,0)<wanted*s.unit_cents/100.0 then raise exception 'Saldo insuficiente. Faça uma recarga';end if;
 if exists(select 1 from public.astros_prospect_requests where user_id=actor and state='processing' and expires_at>now()) then raise exception 'Confira a busca anterior antes de iniciar outra';end if;
 if (select count(*) from public.astros_prospect_requests where user_id=actor and (created_at at time zone 'America/Fortaleza')::date=today)>=s.daily_requests then raise exception 'Limite diário de buscas atingido';end if;
 query_key:=md5(concat_ws('|',criteria_input->>'niche',criteria_input->>'city',criteria_input->>'region',criteria_input->>'country'));
 insert into public.astros_prospect_queries(id,niche,city,region,country) values(query_key,criteria_input->>'niche',criteria_input->>'city',criteria_input->>'region',criteria_input->>'country') on conflict do nothing;
 select * into q from public.astros_prospect_queries where id=query_key for update;
 if q.refreshed_at<now()-make_interval(days=>s.cache_days) and (q.lease_until is null or q.lease_until<now()) then update public.astros_prospect_queries set cursor=0,exhausted=false,refreshed_at=now() where id=q.id returning * into q;end if;
 insert into public.astros_prospect_requests(id,user_id,criteria,query_id,quantity,unit_cents) values(request_id,actor,criteria_input,query_key,wanted,s.unit_cents) returning * into r;
 select count(*) into cached_count from public.astros_prospect_candidates(actor,query_key,criteria_input->>'filter',wanted);
 if cached_count>=wanted or q.exhausted or q.cursor>=120 then return jsonb_build_object('run',true,'fetch',false,'query',query_key,'cursor',q.cursor);end if;
 -- Another request already collects this area: use the existing base, do not duplicate provider calls.
 if q.lease_until>now() then return jsonb_build_object('run',true,'fetch',false,'query',query_key,'cursor',q.cursor,'busy',true);end if;
 insert into public.astros_prospect_usage(day,calls) values(today,0) on conflict do nothing;
 select u.calls into calls from public.astros_prospect_usage u where day=today for update;
 if calls>=s.daily_calls then return jsonb_build_object('run',true,'fetch',false,'query',query_key,'cursor',q.cursor,'limited',true);end if;
 update public.astros_prospect_usage set calls=astros_prospect_usage.calls+1 where day=today;
 update public.astros_prospect_queries set lease_id=request_id,lease_until=now()+interval '2 minutes' where id=query_key;
 return jsonb_build_object('run',true,'fetch',true,'query',query_key,'cursor',q.cursor);
end $$;
create or replace function public.astros_prospect_finish(actor uuid,request_id uuid,rows_input jsonb default '[]',page_complete boolean default false,has_next boolean default false,failure text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.astros_prospect_requests;q public.astros_prospect_queries;item jsonb;n integer;charge integer;balance numeric;ids text[];
begin
 perform public.astros_prospect_actor(actor);
 select recarga into balance from public.painel_de_desbanimento where id=actor for update;
 select * into r from public.astros_prospect_requests where id=request_id and user_id=actor for update;
 if not found then raise exception 'Busca não encontrada';end if;
 if r.state<>'processing' then return to_jsonb(r)-'criteria'-'query_id'-'diagnostic'-'user_id';end if;
 select * into q from public.astros_prospect_queries where id=r.query_id for update;
 if r.expires_at<=now() then failure:='expired';end if;
 if failure not in ('','provider','expired','verification') then failure:='provider';end if;
 if page_complete and failure='' and q.lease_id=request_id and q.lease_until>now() then
  if jsonb_typeof(rows_input)<>'array' or jsonb_array_length(rows_input)>20 then raise exception 'Resposta inválida';end if;
  for item in select value from jsonb_array_elements(rows_input) loop
   if coalesce(length(item->>'id'),0) not between 3 and 250 or coalesce(length(item->>'name'),0) not between 1 and 200 or coalesce(item->>'websiteStatus','') not in ('missing','social','online','offline','unknown') then raise exception 'Resposta inválida';end if;
   insert into public.astros_prospect_businesses(id,data) values(item->>'id',item) on conflict(id) do update set data=excluded.data,updated_at=now();
   insert into public.astros_prospect_matches(query_id,business_id) values(q.id,item->>'id') on conflict(query_id,business_id) do update set seen_at=now();
  end loop;
  update public.astros_prospect_queries set cursor=least(cursor+20,120),exhausted=not has_next or cursor>=100,lease_id=null,lease_until=null where id=q.id;
 elsif q.lease_id=request_id then
  -- A timeout is not evidence of an empty page. Preserve cursor; a future explicit new search may fetch again.
  update public.astros_prospect_queries set lease_id=null,lease_until=null where id=q.id;
 end if;
 if failure<>'' then update public.astros_prospect_requests set state='failed',diagnostic=failure,completed_at=now() where id=r.id returning * into r;return to_jsonb(r)-'criteria'-'query_id'-'diagnostic'-'user_id';end if;
 select array_agg(id) into ids from public.astros_prospect_candidates(actor,q.id,r.criteria->>'filter',r.quantity);
 n:=coalesce(cardinality(ids),0);charge:=n*r.unit_cents;
 if coalesce(balance,0)<charge/100.0 then
  update public.astros_prospect_requests set state='failed',diagnostic='balance',completed_at=now() where id=r.id returning * into r;
  return to_jsonb(r)-'criteria'-'query_id'-'diagnostic'-'user_id';
 end if;
 -- Owner row lock + unique(user_id,business_id) enforce per-account non-repetition even across concurrent requests.
 insert into public.astros_prospect_deliveries(user_id,business_id,request_id,snapshot) select actor,b.id,r.id,b.data from public.astros_prospect_businesses b where b.id=any(ids);
 if charge>0 then
  update public.painel_de_desbanimento set recarga=recarga-charge/100.0 where id=actor;
  insert into public.astros_wallet_movements(user_id,amount_cents,kind,reference) values(actor,-charge,'debit','prospect:'||r.id);
 end if;
 update public.astros_prospect_requests set state='completed',delivered=n,charged_cents=charge,completed_at=now() where id=r.id returning * into r;
 return to_jsonb(r)-'criteria'-'query_id'-'diagnostic'-'user_id';
end $$;
create or replace function public.astros_prospect_status(actor uuid,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.astros_prospect_requests;begin
 perform public.astros_prospect_actor(actor);
 perform 1 from public.painel_de_desbanimento where id=actor for update;
 select * into r from public.astros_prospect_requests where id=request_id and user_id=actor for update;
 if not found then raise exception 'Busca não encontrada';end if;
 if r.state='processing' and r.expires_at<=now() then update public.astros_prospect_requests set state='failed',diagnostic='expired',completed_at=now() where id=r.id returning * into r;end if;
 return to_jsonb(r)-'criteria'-'query_id'-'diagnostic'-'user_id';
end $$;
-- Explicit signatures and service-only grants, including internal helpers.
revoke all on function public.astros_prospect_actor(uuid,boolean),public.astros_prospect_candidates(uuid,text,text,integer),public.astros_prospect_save(uuid,boolean,integer,integer,integer,integer,text),public.astros_prospect_begin(uuid,uuid,jsonb,integer,integer),public.astros_prospect_finish(uuid,uuid,jsonb,boolean,boolean,text),public.astros_prospect_status(uuid,uuid) from public,anon,authenticated;
grant execute on function public.astros_prospect_actor(uuid,boolean),public.astros_prospect_candidates(uuid,text,text,integer),public.astros_prospect_save(uuid,boolean,integer,integer,integer,integer,text),public.astros_prospect_begin(uuid,uuid,jsonb,integer,integer),public.astros_prospect_finish(uuid,uuid,jsonb,boolean,boolean,text),public.astros_prospect_status(uuid,uuid) to service_role;
commit;
