begin;
-- Additional read enrichment only: no wallet writes, no replacement of lead snapshots.
create table if not exists public.astros_instagram_settings (
 id boolean primary key default true check(id), enabled boolean not null default false,
 daily_calls integer not null default 20 check(daily_calls between 1 and 1000),
 user_daily integer not null default 5 check(user_daily between 1 and 100),
 reserve_calls integer not null default 10 check(reserve_calls between 1 and 1000000),
 updated_at timestamptz not null default now()
);
insert into public.astros_instagram_settings(id) values(true) on conflict do nothing;
create table if not exists public.astros_instagram_requests (
 id uuid primary key, user_id uuid not null references public.painel_de_desbanimento(id) on delete cascade,
 lead_id uuid not null, source text not null check(source in ('maps','cnpj')),
 profile_id text not null check(profile_id ~ '^[a-z0-9_][a-z0-9_.]{0,29}$'),
 state text not null default 'processing' check(state in ('processing','completed','failed')),
 result jsonb, created_at timestamptz not null default clock_timestamp(), completed_at timestamptz,
 check(result is null or jsonb_typeof(result)='object')
);
create index if not exists astros_instagram_owner on public.astros_instagram_requests(user_id,created_at desc);
create index if not exists astros_instagram_lead on public.astros_instagram_requests(user_id,source,lead_id,profile_id,created_at desc);
create index if not exists astros_instagram_time on public.astros_instagram_requests(created_at);
create table if not exists public.astros_instagram_audit(id uuid primary key default gen_random_uuid(),actor uuid not null,settings jsonb not null,created_at timestamptz not null default now());
alter table public.astros_instagram_settings enable row level security;
alter table public.astros_instagram_requests enable row level security;
alter table public.astros_instagram_audit enable row level security;
revoke all on public.astros_instagram_settings,public.astros_instagram_requests,public.astros_instagram_audit from public,anon,authenticated;
grant all on public.astros_instagram_settings,public.astros_instagram_requests,public.astros_instagram_audit to service_role;

create or replace function public.astros_instagram_snapshot(actor uuid,lead_key uuid,origin_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare value jsonb;
begin
 perform public.astros_prospect_actor(actor);
 if origin_key='maps' then select snapshot into value from public.astros_prospect_deliveries where id=lead_key and user_id=actor;
 elsif origin_key='cnpj' then select snapshot into value from public.astros_cnpj_deliveries where id=lead_key and user_id=actor;
 else raise exception 'Origem inválida';end if;
 if value is null then raise exception 'Lead não encontrado na sua conta';end if;
 return value;
end $$;

create or replace function public.astros_instagram_config(actor uuid,administrator boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.astros_instagram_settings;
begin
 perform public.astros_prospect_actor(actor,administrator);
 select * into s from public.astros_instagram_settings where id;
 return jsonb_build_object('installed',true,'enabled',s.enabled,'dailyCalls',s.daily_calls,'userDaily',s.user_daily,'reserveCalls',s.reserve_calls,'customerChargeCents',0);
end $$;
create or replace function public.astros_instagram_save(actor uuid,active boolean,daily_limit integer,user_limit integer,reserve_limit integer) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.astros_prospect_actor(actor,true);
 if active is null or daily_limit is null or user_limit is null or reserve_limit is null or daily_limit not between 1 and 1000 or user_limit not between 1 and 100 or reserve_limit not between 1 and 1000000 then raise exception 'Configuração Instagram inválida';end if;
 if active and not exists(select 1 from public.astros_prospect_private where id and api_key<>'') then raise exception 'Configure a chave SerpApi antes de ativar';end if;
 update public.astros_instagram_settings set enabled=active,daily_calls=daily_limit,user_daily=user_limit,reserve_calls=reserve_limit,updated_at=now() where id;
 insert into public.astros_instagram_audit(actor,settings) values(actor,jsonb_build_object('enabled',active,'dailyCalls',daily_limit,'userDaily',user_limit,'reserveCalls',reserve_limit));
end $$;
create or replace function public.astros_instagram_read(actor uuid,lead_key uuid,origin_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.astros_instagram_requests;
begin
 perform public.astros_instagram_snapshot(actor,lead_key,origin_key);
 select * into r from public.astros_instagram_requests where user_id=actor and lead_id=lead_key and source=origin_key order by created_at desc,id desc limit 1;
 if not found then return jsonb_build_object('state','none');end if;
 return jsonb_build_object('id',r.id,'profileId',r.profile_id,'state',case when r.state='processing' and r.created_at<now()-interval '2 minutes' then 'failed' else r.state end,'result',r.result,'queriedAt',r.completed_at,'requestedAt',r.created_at);
end $$;
create or replace function public.astros_instagram_begin(actor uuid,request_key uuid,lead_key uuid,origin_key text,profile_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.astros_instagram_requests;s public.astros_instagram_settings;c public.astros_prospect_capacity;m public.astros_prospect_settings;snapshot_value jsonb; allowed boolean;after_count integer;hour_count integer;daily_count integer;
begin
 perform public.astros_prospect_actor(actor);
 perform 1 from public.painel_de_desbanimento where id=actor for update;
 snapshot_value:=public.astros_instagram_snapshot(actor,lead_key,origin_key);
 if request_key is null or profile_key is null or profile_key!~'^[a-z0-9_][a-z0-9_.]{0,29}$' then raise exception 'Perfil Instagram inválido';end if;
 select * into r from public.astros_instagram_requests where id=request_key;
 if found then
  if r.user_id<>actor or r.lead_id<>lead_key or r.source<>origin_key or r.profile_id<>profile_key then raise exception 'Referência Instagram divergente';end if;
  return jsonb_build_object('dispatch',false,'requestId',r.id);
 end if;
 -- Only links actually saved in this owner's lead are eligible. Never infer by name.
 select exists(select 1 from (
  select snapshot_value->>'website' as url
  union all select item->>'url' from jsonb_array_elements(case when jsonb_typeof(snapshot_value->'contacts')='array' then snapshot_value->'contacts' else '[]'::jsonb end) item
 ) urls where lower(coalesce(url,'')) ~ ('^https://(www\.|m\.)?instagram\.com/'||replace(profile_key,'.','\.')||'/?([?#].*)?$')) into allowed;
 if not allowed or profile_key in ('p','reel','reels','stories','explore','accounts','direct','about','developer','developers','legal','privacy','terms','share') then raise exception 'Perfil não consta nos links deste lead';end if;
 select * into r from public.astros_instagram_requests where user_id=actor and lead_id=lead_key and source=origin_key and profile_id=profile_key and created_at>now()-interval '24 hours' order by created_at desc,id desc limit 1;
 if found then return jsonb_build_object('dispatch',false,'requestId',r.id);end if;
 select * into s from public.astros_instagram_settings where id for share;
 select * into m from public.astros_prospect_settings where id for share;
 if not s.enabled then raise exception 'Consulta Instagram desativada';end if;
 -- Restricts NEW enrichment only; reading an accepted request remains possible.
 if exists(select 1 from public.astros_module_settings where module='prospecting' and not enabled) or exists(select 1 from public.astros_module_clients where module='prospecting' and user_id=actor and not enabled) then raise exception 'Consulta Instagram indisponível para esta conta';end if;
 select * into c from public.astros_prospect_capacity where id for update;
 if c.synced_at is null or c.synced_at<now()-interval '5 minutes' then raise exception 'Aguarde a atualização da cota SerpApi';end if;
 if exists(select 1 from public.astros_prospect_requests where state in ('queued','processing') and expires_at>now()) then raise exception 'Buscas Google Maps têm prioridade. Tente mais tarde';end if;
 if exists(select 1 from public.astros_instagram_requests where state='processing' and created_at>now()-interval '2 minutes') then raise exception 'Outra consulta Instagram está em andamento. Tente mais tarde';end if;
 select count(*) into after_count from (select created_at from public.astros_prospect_dispatches union all select created_at from public.astros_instagram_requests) d where created_at>=c.reserved_after;
 select count(*) into hour_count from (select created_at from public.astros_prospect_dispatches union all select created_at from public.astros_instagram_requests) d where created_at>now()-interval '1 hour';
 select count(*) into daily_count from (select created_at from public.astros_prospect_dispatches union all select created_at from public.astros_instagram_requests) d where (created_at at time zone 'America/Fortaleza')::date=(now() at time zone 'America/Fortaleza')::date;
 if c.remaining-after_count<=s.reserve_calls or c.hour_limit<=0 or greatest(c.hour_used+after_count,hour_count)>=c.hour_limit or (m.daily_calls>0 and daily_count>=m.daily_calls) then raise exception 'Cota reservada às buscas. Tente mais tarde';end if;
 if (select count(*) from public.astros_instagram_requests where (created_at at time zone 'America/Fortaleza')::date=(now() at time zone 'America/Fortaleza')::date)>=s.daily_calls or (select count(*) from public.astros_instagram_requests where user_id=actor and (created_at at time zone 'America/Fortaleza')::date=(now() at time zone 'America/Fortaleza')::date)>=s.user_daily then raise exception 'Limite diário de consultas Instagram atingido';end if;
 insert into public.astros_instagram_requests(id,user_id,lead_id,source,profile_id) values(request_key,actor,lead_key,origin_key,profile_key);
 return jsonb_build_object('dispatch',true,'requestId',request_key);
end $$;
create or replace function public.astros_instagram_finish(actor uuid,request_key uuid,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.astros_prospect_actor(actor);
 if payload is not null and (jsonb_typeof(payload)<>'object' or octet_length(payload::text)>32768) then raise exception 'Resposta Instagram inválida';end if;
 update public.astros_instagram_requests set state=case when payload is null then 'failed' else 'completed' end,result=payload,completed_at=now() where id=request_key and user_id=actor and state='processing';
end $$;
-- Include both consumers in the SAME existing capacity lock. Maps flow otherwise unchanged.
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
 select count(*) into after_count from (select created_at from public.astros_prospect_dispatches union all select created_at from public.astros_instagram_requests) d where created_at>=c.reserved_after;
 select count(*) into hour_count from (select created_at from public.astros_prospect_dispatches union all select created_at from public.astros_instagram_requests) d where created_at>now()-interval '1 hour';
 select count(*) into daily_count from (select created_at from public.astros_prospect_dispatches union all select created_at from public.astros_instagram_requests) d where (created_at at time zone 'America/Fortaleza')::date=(now() at time zone 'America/Fortaleza')::date;
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

revoke all on function public.astros_instagram_snapshot(uuid,uuid,text),public.astros_instagram_config(uuid,boolean),public.astros_instagram_save(uuid,boolean,integer,integer,integer),public.astros_instagram_read(uuid,uuid,text),public.astros_instagram_begin(uuid,uuid,uuid,text,text),public.astros_instagram_finish(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.astros_instagram_snapshot(uuid,uuid,text),public.astros_instagram_config(uuid,boolean),public.astros_instagram_save(uuid,boolean,integer,integer,integer),public.astros_instagram_read(uuid,uuid,text),public.astros_instagram_begin(uuid,uuid,uuid,text,text),public.astros_instagram_finish(uuid,uuid,jsonb) to service_role;
commit;
