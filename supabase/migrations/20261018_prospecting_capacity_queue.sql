begin;
alter table public.astros_prospect_settings drop constraint if exists astros_prospect_settings_daily_calls_check;
alter table public.astros_prospect_settings add constraint astros_prospect_settings_daily_calls_check check(daily_calls between 0 and 1000000);
alter table public.astros_prospect_private add column if not exists worker_secret text not null default replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
alter table public.astros_prospect_requests drop constraint if exists astros_prospect_requests_state_check;
alter table public.astros_prospect_requests add constraint astros_prospect_requests_state_check check(state in ('queued','processing','completed','failed'));
alter table public.astros_prospect_requests add column if not exists next_attempt_at timestamptz not null default now();
alter table public.astros_prospect_requests add column if not exists queue_reason text not null default '';
create table if not exists public.astros_prospect_capacity(id boolean primary key default true check(id),plan text not null default '',monthly integer not null default 0,remaining integer not null default 0,used integer not null default 0,hour_limit integer not null default 0,hour_used integer not null default 0,renewal text not null default '',synced_at timestamptz,reserved_after timestamptz,sync_token uuid,sync_until timestamptz,sync_started_at timestamptz,worker_seen_at timestamptz);
insert into public.astros_prospect_capacity(id) values(true) on conflict do nothing;
create table if not exists public.astros_prospect_dispatches(request_id uuid primary key references public.astros_prospect_requests(id) on delete cascade,created_at timestamptz not null default clock_timestamp());
create index if not exists astros_prospect_dispatch_date on public.astros_prospect_dispatches(created_at);
create index if not exists astros_prospect_queue_due on public.astros_prospect_requests(next_attempt_at,created_at) where state='queued';
alter table public.astros_prospect_capacity enable row level security;
alter table public.astros_prospect_dispatches enable row level security;
revoke all on public.astros_prospect_capacity,public.astros_prospect_dispatches from public,anon,authenticated;
grant all on public.astros_prospect_capacity,public.astros_prospect_dispatches to service_role;
create or replace function public.astros_prospect_sync_claim(force_refresh boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.astros_prospect_capacity;t uuid;begin
 select * into c from public.astros_prospect_capacity where id for update;
 if c.sync_until>now() or (not force_refresh and c.synced_at>now()-interval '2 minutes') then return null;end if;
 t:=gen_random_uuid();update public.astros_prospect_capacity set sync_token=t,sync_until=now()+interval '40 seconds',sync_started_at=clock_timestamp() where id;return t;
end $$;
create or replace function public.astros_prospect_sync_finish(token uuid,details jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if token is null or not exists(select 1 from public.astros_prospect_capacity where id and sync_token=token and sync_until>now()) then return;end if;
 if details is null then update public.astros_prospect_capacity set sync_until=null,sync_token=null where id and sync_token=token;return;end if;
 if coalesce(details->>'remaining','')!~'^[0-9]{1,9}$' or coalesce(details->>'monthly','')!~'^[0-9]{1,9}$' or coalesce(details->>'used','')!~'^[0-9]{1,9}$' or coalesce(details->>'hourLimit','')!~'^[0-9]{1,9}$' or coalesce(details->>'hourUsed','')!~'^[0-9]{1,9}$' then raise exception 'Cota inválida';end if;
 update public.astros_prospect_capacity set plan=left(details->>'plan',80),monthly=(details->>'monthly')::integer,remaining=(details->>'remaining')::integer,used=(details->>'used')::integer,hour_limit=(details->>'hourLimit')::integer,hour_used=(details->>'hourUsed')::integer,renewal=left(coalesce(details->>'renewal',''),40),synced_at=clock_timestamp(),reserved_after=sync_started_at-interval '5 seconds',sync_token=null,sync_until=null where id and sync_token=token;
end $$;
create or replace function public.astros_prospect_heartbeat() returns void language plpgsql security definer set search_path='' as $$begin
 update public.astros_prospect_requests set state='failed',diagnostic='expired',completed_at=now(),queue_reason='' where state in ('queued','processing') and expires_at<=now();
 update public.astros_prospect_queries set lease_id=null,lease_until=null where lease_until<=now();
 delete from public.astros_prospect_dispatches where created_at<now()-interval '35 days';
 update public.astros_prospect_capacity set worker_seen_at=clock_timestamp() where id;
end $$;
create or replace function public.astros_prospect_save(actor uuid,active boolean,unit_price integer,retention_days integer,request_limit integer,call_limit integer,new_key text default '') returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.astros_prospect_actor(actor,true);
 if active is null or unit_price is null or retention_days is null or request_limit is null or call_limit is null or unit_price not between 0 and 10000 or retention_days not between 1 and 30 or request_limit not between 1 and 100 or call_limit not between 0 and 1000000 or new_key is null or length(new_key)>200 or (new_key<>'' and new_key!~'^[A-Za-z0-9_-]{20,200}$') then raise exception 'Configuração inválida';end if;
 perform 1 from public.astros_prospect_settings where id for update;
 if new_key<>'' then update public.astros_prospect_private set api_key=new_key where id; update public.astros_prospect_capacity set synced_at=null,sync_token=null,sync_until=null where id;end if;
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
  if r.state in ('queued','processing') and r.expires_at<=now() then update public.astros_prospect_requests set state='failed',diagnostic='expired',completed_at=now() where id=r.id returning * into r;end if;
  return jsonb_build_object('run',false,'request',to_jsonb(r)-'criteria'-'query_id'-'diagnostic'-'user_id');
 end if;
 select * into s from public.astros_prospect_settings where id for share;
 if not s.enabled then raise exception 'Prospecção temporariamente indisponível';end if;
 if wanted is null or wanted not between 1 and 20 or expected_unit is distinct from s.unit_cents then raise exception 'Consulte o preço novamente';end if;
 if jsonb_typeof(criteria_input)<>'object' or coalesce(length(criteria_input->>'niche'),0) not between 2 and 80 or coalesce(length(criteria_input->>'city'),0) not between 2 and 80 or coalesce(length(criteria_input->>'region'),0)>80 or coalesce(criteria_input->>'country','')!~'^[A-Z]{2}$' or coalesce(criteria_input->>'filter','') not in ('all','missing','social','online','offline','unknown') then raise exception 'Busca inválida';end if;
 if coalesce(balance,0)<wanted*s.unit_cents/100.0 then raise exception 'Saldo insuficiente. Faça uma recarga';end if;
 if not exists(select 1 from public.astros_prospect_capacity where id and worker_seen_at>now()-interval '4 minutes') then raise exception 'Ative o processamento automático de Prospecção';end if;
 if exists(select 1 from public.astros_prospect_requests where user_id=actor and state in ('queued','processing') and expires_at>now()) then raise exception 'Confira a busca anterior antes de iniciar outra';end if;
 if (select count(*) from public.astros_prospect_requests where user_id=actor and (created_at at time zone 'America/Fortaleza')::date=today)>=s.daily_requests then raise exception 'Limite diário de buscas atingido';end if;
 query_key:=md5(concat_ws('|',criteria_input->>'niche',criteria_input->>'city',criteria_input->>'region',criteria_input->>'country'));
 insert into public.astros_prospect_queries(id,niche,city,region,country) values(query_key,criteria_input->>'niche',criteria_input->>'city',criteria_input->>'region',criteria_input->>'country') on conflict do nothing;
 select * into q from public.astros_prospect_queries where id=query_key for update;
 if q.refreshed_at<now()-make_interval(days=>s.cache_days) and (q.lease_until is null or q.lease_until<now()) then update public.astros_prospect_queries set cursor=0,exhausted=false,refreshed_at=now() where id=q.id returning * into q;end if;
 insert into public.astros_prospect_requests(id,user_id,criteria,query_id,quantity,unit_cents,state,expires_at,next_attempt_at,queue_reason) values(request_id,actor,criteria_input,query_key,wanted,s.unit_cents,'queued',now()+interval '24 hours',now(),'capacity') returning * into r;
 return jsonb_build_object('run',false,'request',to_jsonb(r)-'criteria'-'query_id'-'diagnostic'-'user_id');
end $$;
create or replace function public.astros_prospect_claim(request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.astros_prospect_requests;q public.astros_prospect_queries;s public.astros_prospect_settings;c public.astros_prospect_capacity;balance numeric;n integer;after_count integer;hour_count integer;daily_count integer;why text;begin
 -- All account operations lock owner, then request, query, capacity in this order.
 select user_id into r.user_id from public.astros_prospect_requests where id=request_id;
 if not found then return null;end if;
 select recarga into balance from public.painel_de_desbanimento where id=r.user_id for update;
 select * into r from public.astros_prospect_requests where id=request_id for update;
 if r.state<>'queued' or r.next_attempt_at>now() then return null;end if;
 if r.expires_at<=now() then update public.astros_prospect_requests set state='failed',diagnostic='expired',completed_at=now() where id=r.id;return null;end if;
 begin perform public.astros_prospect_actor(r.user_id);exception when others then update public.astros_prospect_requests set state='failed',diagnostic='account',completed_at=now() where id=r.id;return null;end;
 select * into s from public.astros_prospect_settings where id for share;
 if not s.enabled then update public.astros_prospect_requests set state='failed',diagnostic='paused',completed_at=now() where id=r.id;return null;end if;
 if coalesce(balance,0)<r.quantity*r.unit_cents/100.0 then update public.astros_prospect_requests set state='failed',diagnostic='balance',completed_at=now() where id=r.id;return null;end if;
 select * into q from public.astros_prospect_queries where id=r.query_id for update;
 if q.refreshed_at<now()-make_interval(days=>s.cache_days) and (q.lease_until is null or q.lease_until<now()) then update public.astros_prospect_queries set cursor=0,exhausted=false,refreshed_at=now() where id=q.id returning * into q;end if;
 select count(*) into n from public.astros_prospect_candidates(r.user_id,q.id,r.criteria->>'filter',r.quantity);
 if n>=r.quantity or q.exhausted or q.cursor>=120 then
  update public.astros_prospect_requests set state='processing',expires_at=now()+interval '3 minutes',queue_reason='' where id=r.id;
  return jsonb_build_object('id',r.id,'actor',r.user_id,'criteria',r.criteria,'fetch',false);
 end if;
 select * into c from public.astros_prospect_capacity where id for update;
 select count(*) into after_count from public.astros_prospect_dispatches where created_at>=c.reserved_after;
 select count(*) into hour_count from public.astros_prospect_dispatches where created_at>now()-interval '1 hour';
 select count(*) into daily_count from public.astros_prospect_dispatches where (created_at at time zone 'America/Fortaleza')::date=(now() at time zone 'America/Fortaleza')::date;
 if c.synced_at is null or c.synced_at<now()-interval '5 minutes' then why:='checking';
 elsif greatest(0,c.remaining-after_count)<=0 then
  update public.astros_prospect_requests set state='failed',diagnostic='quota',completed_at=now(),queue_reason='' where id=r.id;return null;
 elsif q.lease_until>now() then why:='shared';
 elsif s.daily_calls>0 and daily_count>=s.daily_calls then why:='daily';
 elsif c.hour_limit<=0 or greatest(c.hour_used+after_count,hour_count)>=c.hour_limit then why:='hourly';
 elsif (select count(*) from public.astros_prospect_requests where state='processing' and expires_at>now())>=3 then why:='capacity';
 end if;
 if why is not null then update public.astros_prospect_requests set queue_reason=why,next_attempt_at=now()+interval '1 minute' where id=r.id;return null;end if;
 -- Reserve before dispatch. A lost/uncertain dispatch is never replayed automatically.
 insert into public.astros_prospect_dispatches(request_id) values(r.id) on conflict do nothing;
 if not found then update public.astros_prospect_requests set state='failed',diagnostic='uncertain',completed_at=now() where id=r.id;return null;end if;
 update public.astros_prospect_requests set state='processing',expires_at=now()+interval '3 minutes',queue_reason='' where id=r.id;
 update public.astros_prospect_queries set lease_id=r.id,lease_until=now()+interval '2 minutes' where id=q.id;
 return jsonb_build_object('id',r.id,'actor',r.user_id,'criteria',r.criteria,'fetch',true,'cursor',q.cursor);
end $$;
create or replace function public.astros_prospect_status(actor uuid,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.astros_prospect_requests;begin
 perform public.astros_prospect_actor(actor);perform 1 from public.painel_de_desbanimento where id=actor for update;
 select * into r from public.astros_prospect_requests where id=request_id and user_id=actor for update;
 if not found then raise exception 'Busca não encontrada';end if;
 if r.state in ('queued','processing') and r.expires_at<=now() then update public.astros_prospect_requests set state='failed',diagnostic='expired',completed_at=now(),queue_reason='' where id=r.id returning * into r;end if;
 return (to_jsonb(r)-'criteria'-'query_id'-'diagnostic'-'user_id')||jsonb_build_object('failureReason',case when r.state='failed' then case r.diagnostic when 'quota' then 'capacity' when 'balance' then 'balance' when 'expired' then 'expired' when 'paused' then 'paused' else 'unavailable' end else null end);end $$;
revoke all on function public.astros_prospect_sync_claim(boolean),public.astros_prospect_sync_finish(uuid,jsonb),public.astros_prospect_heartbeat(),public.astros_prospect_claim(uuid) from public,anon,authenticated;
grant execute on function public.astros_prospect_sync_claim(boolean),public.astros_prospect_sync_finish(uuid,jsonb),public.astros_prospect_heartbeat(),public.astros_prospect_claim(uuid) to service_role;
commit;
