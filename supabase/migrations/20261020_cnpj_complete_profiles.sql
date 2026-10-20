-- Atualização cadastral do próprio lead, sem novo débito. Preserva snapshot original e etapa.
begin;
alter table public.astros_cnpj_queries add column if not exists profile_version integer not null default 0;
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
  if q.profile_version<4 then
   if q.lease_until>now() then raise exception 'Esta pesquisa CNPJ já está em andamento';end if;
   update public.astros_cnpj_queries set page=1,exhausted=false,profile_version=4,lease_id=null,lease_until=null where id=key returning * into q;
  end if;
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
create or replace function public.astros_cnpj_candidates(actor uuid,query_key text,cap integer) returns setof public.astros_cnpj_businesses language sql stable security definer set search_path='' as $$
 select b.* from public.astros_cnpj_matches m join public.astros_cnpj_businesses b on b.cnpj=m.cnpj cross join public.astros_cnpj_settings s
 where m.query_id=query_key and b.snapshot->>'dataVersion'='4'
 and b.updated_at>now()-make_interval(days=>s.cache_days) and m.seen_at>now()-make_interval(days=>s.cache_days)
 and not exists(select 1 from public.astros_cnpj_deliveries d where d.user_id=actor and d.cnpj=b.cnpj)
 order by m.seen_at desc,b.cnpj limit greatest(0,least(cap,20));
$$;
revoke all on function public.astros_cnpj_candidates(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.astros_cnpj_candidates(uuid,text,integer) to service_role;
commit;
