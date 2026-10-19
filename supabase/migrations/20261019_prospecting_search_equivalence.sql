begin;
-- Equivalent search routes reuse existing identities. Historical requests and deliveries stay intact.
create or replace function public.astros_prospect_text_key(value text) returns text language sql immutable strict set search_path='' as $$
 select translate(lower(btrim(regexp_replace(value,'[[:space:]]+',' ','g'))),'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn');
$$;
create or replace function public.astros_prospect_equivalent_key(niche text,city text,region text,country text) returns text language sql immutable strict set search_path='' as $$
 select md5(jsonb_build_array(
 coalesce('{"dentista": "dentistas", "dentistas": "dentistas", "restaurante": "restaurantes", "restaurantes": "restaurantes", "academia": "academias", "academias": "academias", "advogado": "advogados", "advogados": "advogados", "clinica": "clinicas", "clinicas": "clinicas", "clinica odontologica": "clinicas odontologicas", "clinicas odontologicas": "clinicas odontologicas", "barbearia": "barbearias", "barbearias": "barbearias", "pizzaria": "pizzarias", "pizzarias": "pizzarias", "salao de beleza": "saloes de beleza", "saloes de beleza": "saloes de beleza", "imobiliaria": "imobiliarias", "imobiliarias": "imobiliarias", "oficina mecanica": "oficinas mecanicas", "oficinas mecanicas": "oficinas mecanicas", "pet shop": "pet shops", "pet shops": "pet shops", "hotel": "hoteis", "hoteis": "hoteis", "farmacia": "farmacias", "farmacias": "farmacias", "padaria": "padarias", "padarias": "padarias", "supermercado": "supermercados", "supermercados": "supermercados", "contabilidade": "contabilidades", "contabilidades": "contabilidades", "escola": "escolas", "escolas": "escolas", "loja de roupa": "lojas de roupas", "lojas de roupas": "lojas de roupas"}'::jsonb->>public.astros_prospect_text_key(niche),public.astros_prospect_text_key(niche)),
 public.astros_prospect_text_key(city),
 case when upper(btrim(country))='BR' then coalesce('{"ac": "acre", "acre": "acre", "al": "alagoas", "alagoas": "alagoas", "ap": "amapa", "amapa": "amapa", "am": "amazonas", "amazonas": "amazonas", "ba": "bahia", "bahia": "bahia", "ce": "ceara", "ceara": "ceara", "df": "distrito federal", "distrito federal": "distrito federal", "es": "espirito santo", "espirito santo": "espirito santo", "go": "goias", "goias": "goias", "ma": "maranhao", "maranhao": "maranhao", "mt": "mato grosso", "mato grosso": "mato grosso", "ms": "mato grosso do sul", "mato grosso do sul": "mato grosso do sul", "mg": "minas gerais", "minas gerais": "minas gerais", "pa": "para", "para": "para", "pb": "paraiba", "paraiba": "paraiba", "pr": "parana", "parana": "parana", "pe": "pernambuco", "pernambuco": "pernambuco", "pi": "piaui", "piaui": "piaui", "rj": "rio de janeiro", "rio de janeiro": "rio de janeiro", "rn": "rio grande do norte", "rio grande do norte": "rio grande do norte", "rs": "rio grande do sul", "rio grande do sul": "rio grande do sul", "ro": "rondonia", "rondonia": "rondonia", "rr": "roraima", "roraima": "roraima", "sc": "santa catarina", "santa catarina": "santa catarina", "sp": "sao paulo", "sao paulo": "sao paulo", "se": "sergipe", "sergipe": "sergipe", "to": "tocantins", "tocantins": "tocantins"}'::jsonb->>public.astros_prospect_text_key(region),public.astros_prospect_text_key(region)) else public.astros_prospect_text_key(region) end,
 upper(btrim(country)))::text);
$$;
create index if not exists astros_prospect_equivalent_query on public.astros_prospect_queries(public.astros_prospect_equivalent_key(niche,city,region,country));
create table if not exists public.astros_prospect_query_aliases(key text primary key,query_id text not null references public.astros_prospect_queries(id));
alter table public.astros_prospect_query_aliases enable row level security;
revoke all on public.astros_prospect_query_aliases from public,anon,authenticated;
grant all on public.astros_prospect_query_aliases to service_role;
create or replace function public.astros_prospect_resolve_query(criteria_input jsonb) returns text language plpgsql security definer set search_path='' as $$
declare equivalent text;chosen text;
begin
 equivalent:=public.astros_prospect_equivalent_key(criteria_input->>'niche',criteria_input->>'city',coalesce(criteria_input->>'region',''),criteria_input->>'country');
 select a.query_id into chosen from public.astros_prospect_query_aliases a where a.key=equivalent for update;
 if chosen is null then
  select q.id into chosen from public.astros_prospect_queries q
  where public.astros_prospect_equivalent_key(q.niche,q.city,q.region,q.country)=equivalent
  order by (select count(*) from public.astros_prospect_matches m where m.query_id=q.id) desc,q.refreshed_at desc,q.id limit 1;
  if chosen is null then
   chosen:=equivalent;
   insert into public.astros_prospect_queries(id,niche,city,region,country) values(chosen,criteria_input->>'niche',criteria_input->>'city',coalesce(criteria_input->>'region',''),criteria_input->>'country') on conflict do nothing;
  end if;
  insert into public.astros_prospect_query_aliases(key,query_id) values(equivalent,chosen) on conflict do nothing;
  select a.query_id into chosen from public.astros_prospect_query_aliases a where a.key=equivalent for update;
 end if;
 -- Reuse committed results from equivalent old routes; never change leases, cursors or requests.
 insert into public.astros_prospect_matches(query_id,business_id,seen_at)
 select chosen,m.business_id,max(m.seen_at) from public.astros_prospect_matches m join public.astros_prospect_queries q on q.id=m.query_id
 where q.id<>chosen and public.astros_prospect_equivalent_key(q.niche,q.city,q.region,q.country)=equivalent
 group by m.business_id order by m.business_id
 on conflict(query_id,business_id) do update set seen_at=greatest(astros_prospect_matches.seen_at,excluded.seen_at);
 return chosen;
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
 query_key:=public.astros_prospect_resolve_query(criteria_input);
 insert into public.astros_prospect_queries(id,niche,city,region,country) values(query_key,criteria_input->>'niche',criteria_input->>'city',criteria_input->>'region',criteria_input->>'country') on conflict do nothing;
 select * into q from public.astros_prospect_queries where id=query_key for update;
 if q.refreshed_at<now()-make_interval(days=>s.cache_days) and (q.lease_until is null or q.lease_until<now()) then update public.astros_prospect_queries set cursor=0,exhausted=false,refreshed_at=now() where id=q.id returning * into q;end if;
 insert into public.astros_prospect_requests(id,user_id,criteria,query_id,quantity,unit_cents,state,expires_at,next_attempt_at,queue_reason) values(request_id,actor,criteria_input,query_key,wanted,s.unit_cents,'queued',now()+interval '24 hours',now(),'capacity') returning * into r;
 return jsonb_build_object('run',false,'request',to_jsonb(r)-'criteria'-'query_id'-'diagnostic'-'user_id');
end $$;
revoke all on function public.astros_prospect_text_key(text),public.astros_prospect_equivalent_key(text,text,text,text),public.astros_prospect_resolve_query(jsonb),public.astros_prospect_begin(uuid,uuid,jsonb,integer,integer) from public,anon,authenticated;
grant execute on function public.astros_prospect_text_key(text),public.astros_prospect_equivalent_key(text,text,text,text),public.astros_prospect_resolve_query(jsonb),public.astros_prospect_begin(uuid,uuid,jsonb,integer,integer) to service_role;
commit;
