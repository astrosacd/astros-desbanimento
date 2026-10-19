begin;
-- Read-only delivery audit: recipients and the exact projected snapshot actually delivered.
create or replace function public.astros_prospect_admin_deliveries(
 actor uuid,account_email text default '',company_search text default '',query_key text default '',
 business_key text default '',request_key uuid default null,page_number integer default 0
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.astros_prospect_actor(actor,true);
 if account_email is null or company_search is null or query_key is null or business_key is null or page_number is null
 or length(account_email)>254 or length(company_search)>80 or length(query_key)>64 or length(business_key)>250 or page_number not between 0 and 10000 then raise exception 'Filtro inválido';end if;
 account_email:=lower(btrim(account_email));company_search:=translate(lower(btrim(company_search)),'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn');
 with filtered as materialized (
  select d.id,d.user_id,d.business_id,d.request_id,d.created_at
  from public.astros_prospect_deliveries d
  join public.painel_de_desbanimento p on p.id=d.user_id
  join public.astros_prospect_requests r on r.id=d.request_id
  where (account_email='' or lower(btrim(p.email))=account_email)
  and (company_search='' or strpos(translate(lower(coalesce(d.snapshot->>'name','')),'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn'),company_search)>0)
  and (query_key='' or r.query_id=query_key)
  and (business_key='' or d.business_id=business_key)
  and (request_key is null or d.request_id=request_key)
 ), summary as (
  select count(*) as deliveries,count(distinct user_id) as accounts,count(distinct business_id) as businesses,count(distinct request_id) as requests from filtered
 ), selected as (
  select * from filtered order by created_at desc,id desc limit 20 offset page_number*20
 ), items as (
  select d.created_at,d.id,jsonb_build_object('id',d.id,'createdAt',d.created_at,'stage',d.status,
   'client',jsonb_build_object('id',p.id,'name',p.nome,'email',p.email),
   'request',jsonb_build_object('id',r.id,'state',r.state,'unitCents',r.unit_cents,'quantity',r.quantity,'delivered',r.delivered,'chargedCents',r.charged_cents,
     'niche',r.criteria->>'niche','city',r.criteria->>'city','region',r.criteria->>'region','country',r.criteria->>'country'),
   'snapshot',jsonb_build_object('id',d.business_id,'name',d.snapshot->>'name','address',d.snapshot->>'address','phone',d.snapshot->>'phone',
     'website',d.snapshot->>'website','websiteStatus',d.snapshot->>'websiteStatus','websiteReason',d.snapshot->>'websiteReason',
     'mapsUrl',d.snapshot->>'mapsUrl','rating',d.snapshot->'rating','reviews',d.snapshot->'reviews',
     'checkedAt',d.snapshot->>'checkedAt','collectedAt',d.snapshot->>'collectedAt','siteTitle',d.snapshot->>'siteTitle',
     'siteSummary',d.snapshot->>'siteSummary','siteEmails',coalesce((select jsonb_agg(e.value) from (select value from jsonb_array_elements(case when jsonb_typeof(d.snapshot->'siteEmails')='array' then d.snapshot->'siteEmails' else '[]'::jsonb end) where jsonb_typeof(value)='string' limit 5) e),'[]'::jsonb),
     'contacts',coalesce((select jsonb_agg(jsonb_build_object('kind',x.c->>'kind','label',x.c->>'label','value',x.c->>'value','url',x.c->>'url','source',x.c->>'source')) from (
       select value as c from jsonb_array_elements(case when jsonb_typeof(d.snapshot->'contacts')='array' then d.snapshot->'contacts' else '[]'::jsonb end) limit 20
     ) x),'[]'::jsonb))) as value
  from selected s join public.astros_prospect_deliveries d on d.id=s.id
  join public.painel_de_desbanimento p on p.id=d.user_id join public.astros_prospect_requests r on r.id=d.request_id
 )
 select jsonb_build_object('summary',jsonb_build_object('deliveries',z.deliveries,'accounts',z.accounts,'businesses',z.businesses,'requests',z.requests),
 'deliveries',coalesce((select jsonb_agg(i.value order by i.created_at desc,i.id desc) from items i),'[]'::jsonb),
 'hasMore',z.deliveries>(page_number+1)*20,'asOf',now()) into result from summary z;
 return result;
end $$;
revoke all on function public.astros_prospect_admin_deliveries(uuid,text,text,text,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.astros_prospect_admin_deliveries(uuid,text,text,text,text,uuid,integer) to service_role;
commit;
