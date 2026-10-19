begin;
create index if not exists astros_prospect_delivery_business on public.astros_prospect_deliveries(business_id,user_id);
create index if not exists astros_prospect_request_query on public.astros_prospect_requests(query_id,id);
create index if not exists astros_prospect_match_seen on public.astros_prospect_matches(query_id,seen_at desc,business_id);
-- Read-only administrative inventory. No provider calls, billing or queue changes.
create or replace function public.astros_prospect_admin_base(
 actor uuid, search_text text default '', account_email text default '',
 query_key text default '', query_page integer default 0, business_page integer default 0
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target uuid;target_info jsonb;overview jsonb;query_rows jsonb;business_rows jsonb;
 query_count bigint;business_count bigint:=0;retention integer;cutoff timestamptz;
begin
 perform public.astros_prospect_actor(actor,true);
 if search_text is null or account_email is null or query_key is null or query_page is null or business_page is null
 or length(search_text)>80 or length(account_email)>254 or length(query_key)>64
 or query_page not between 0 and 10000 or business_page not between 0 and 10000
 then raise exception 'Filtro inválido';end if;
 account_email:=lower(btrim(account_email));search_text:=lower(btrim(search_text));
 select cache_days into retention from public.astros_prospect_settings where id;
 if retention is null then raise exception 'Configuração de prospecção não encontrada';end if;
 cutoff:=now()-make_interval(days=>retention);
 if account_email<>'' then
  if (select count(*) from public.painel_de_desbanimento p where lower(btrim(p.email))=account_email)=1 then
   select p.id,jsonb_build_object('id',p.id,'name',p.nome,'email',p.email)
   into target,target_info from public.painel_de_desbanimento p where lower(btrim(p.email))=account_email;
  end if;
 end if;
 select jsonb_build_object('businesses',(select count(*) from public.astros_prospect_businesses),
 'queries',(select count(*) from public.astros_prospect_queries),
 'deliveries',(select count(*) from public.astros_prospect_deliveries),
 'accounts',(select count(distinct user_id) from public.astros_prospect_deliveries)) into overview;
 select count(*) into query_count from public.astros_prospect_queries q
 where search_text='' or strpos(lower(q.niche||' '||q.city||' '||q.region||' '||q.country),search_text)>0;
 select coalesce(jsonb_agg(x.value order by x.refreshed_at desc,x.id),'[]'::jsonb) into query_rows from (
 select q.id,q.refreshed_at,jsonb_build_object('id',q.id,'niche',q.niche,'city',q.city,'region',q.region,'country',q.country,
 'saved',(select count(*) from public.astros_prospect_matches m where m.query_id=q.id),
 'fresh',(select count(*) from public.astros_prospect_matches m join public.astros_prospect_businesses b on b.id=m.business_id where m.query_id=q.id and m.seen_at>cutoff and b.updated_at>cutoff),
 'lastSeen',(select max(seen_at) from public.astros_prospect_matches m where m.query_id=q.id),
 'deliveries',(select count(*) from public.astros_prospect_deliveries d join public.astros_prospect_requests r on r.id=d.request_id where r.query_id=q.id),
 'neverDelivered',(select count(*) from public.astros_prospect_matches m where m.query_id=q.id and not exists(select 1 from public.astros_prospect_deliveries d where d.business_id=m.business_id)),
 'accountDelivered',case when target is null then null else (select count(*) from public.astros_prospect_matches m join public.astros_prospect_deliveries d on d.business_id=m.business_id and d.user_id=target where m.query_id=q.id) end,
 'accountAvailable',case when target is null then null else (select count(*) from public.astros_prospect_matches m join public.astros_prospect_businesses b on b.id=m.business_id where m.query_id=q.id and m.seen_at>cutoff and b.updated_at>cutoff and not exists(select 1 from public.astros_prospect_deliveries d where d.business_id=m.business_id and d.user_id=target)) end
 ) as value from public.astros_prospect_queries q
 where search_text='' or strpos(lower(q.niche||' '||q.city||' '||q.region||' '||q.country),search_text)>0
 order by q.refreshed_at desc,q.id limit 20 offset query_page*20
 ) x;
 if query_key<>'' then
  if not exists(select 1 from public.astros_prospect_queries where id=query_key) then raise exception 'Pesquisa não encontrada';end if;
  select count(*) into business_count from public.astros_prospect_matches where query_id=query_key;
  select coalesce(jsonb_agg(x.value order by x.seen_at desc,x.id),'[]'::jsonb) into business_rows from (
   select b.id,m.seen_at,jsonb_build_object('id',b.id,'name',b.data->>'name','phone',b.data->>'phone',
   'website',b.data->>'website','websiteStatus',b.data->>'websiteStatus','lastSeen',m.seen_at,
   'fresh',m.seen_at>cutoff and b.updated_at>cutoff,
   'deliveries',(select count(*) from public.astros_prospect_deliveries d where d.business_id=b.id),
   'deliveredToAccount',case when target is null then null else exists(select 1 from public.astros_prospect_deliveries d where d.business_id=b.id and d.user_id=target) end) as value
   from public.astros_prospect_matches m join public.astros_prospect_businesses b on b.id=m.business_id
   where m.query_id=query_key order by m.seen_at desc,b.id limit 20 offset business_page*20
  ) x;
 end if;
 return jsonb_build_object('totals',overview,'target',target_info,'targetRequested',account_email<>'','cacheDays',retention,
 'queries',query_rows,'queryCount',query_count,'queryHasMore',query_count>(query_page+1)*20,
 'businesses',coalesce(business_rows,'[]'::jsonb),'businessCount',business_count,'businessHasMore',business_count>(business_page+1)*20,
 'asOf',now());
end $$;
revoke all on function public.astros_prospect_admin_base(uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.astros_prospect_admin_base(uuid,text,text,text,integer,integer) to service_role;
commit;
