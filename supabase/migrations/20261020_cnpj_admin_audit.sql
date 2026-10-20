begin;
create index if not exists astros_cnpj_match_company on public.astros_cnpj_matches(cnpj,query_id);
create index if not exists astros_cnpj_delivery_company on public.astros_cnpj_deliveries(cnpj,created_at desc);
create index if not exists astros_cnpj_delivery_request on public.astros_cnpj_deliveries(request_id,created_at desc);
-- Read-only global CNPJ audit, service-only with verified administrative actor.
create or replace function public.astros_cnpj_admin_snapshot(value jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(key,val),'{}'::jsonb) from (
  select key, value as val from jsonb_each(value)
  where key in ('id','source','cnpj','name','legalName','tradeName','address','phone','city','region','activity','activityCode','size','registrationStatus','registrationDate','registrationReason','openedAt','capitalSocial','legalNature','secondaryActivities','branch','mei','simples','meiSince','simplesSince','providerUpdatedAt','dataVersion','checkedAt','collectedAt','website','websiteStatus','websiteReason','rating','reviews','mapsUrl')
  union all select 'contacts',coalesce((select jsonb_agg(jsonb_build_object('kind',c->>'kind','label',c->>'label','value',c->>'value','url',c->>'url','source',c->>'source')) from (
   select c from jsonb_array_elements(case when jsonb_typeof(value->'contacts')='array' then value->'contacts' else '[]'::jsonb end)c limit 20
  )x),'[]'::jsonb)
 )p;
$$;
create or replace function public.astros_cnpj_admin_audit(
 actor uuid,view_mode text default 'businesses',search_text text default '',account_email text default '',
 query_key text default '',request_key uuid default null,page_number integer default 0
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.astros_prospect_actor(actor,true);
 if view_mode is null or view_mode not in ('businesses','deliveries') or search_text is null or account_email is null or query_key is null or page_number is null
 or length(search_text)>80 or length(account_email)>254 or length(query_key)>64 or page_number not between 0 and 10000 then raise exception 'Filtro inválido';end if;
 search_text:=lower(btrim(search_text));account_email:=lower(btrim(account_email));
 if view_mode='businesses' then
  with filtered as materialized (
   select b.* from public.astros_cnpj_businesses b where
    (search_text='' or strpos(lower(coalesce(b.snapshot->>'name','')||' '||b.cnpj),search_text)>0)
    and (query_key='' or exists(select 1 from public.astros_cnpj_matches m where m.cnpj=b.cnpj and m.query_id=query_key))
    and (request_key is null or exists(select 1 from public.astros_cnpj_requests r join public.astros_cnpj_matches m on m.query_id=r.query_id where r.id=request_key and m.cnpj=b.cnpj))
    and (account_email='' or exists(select 1 from public.astros_cnpj_deliveries d join public.painel_de_desbanimento p on p.id=d.user_id where d.cnpj=b.cnpj and lower(btrim(p.email))=account_email))
  ), selected as (select * from filtered order by updated_at desc,cnpj limit 20 offset page_number*20)
  select jsonb_build_object('total',(select count(*) from filtered),'hasMore',(select count(*) from filtered)>(page_number+1)*20,
   'items',coalesce((select jsonb_agg(jsonb_build_object('id',s.cnpj,'snapshot',public.astros_cnpj_admin_snapshot(s.snapshot),'updatedAt',s.updated_at,
    'deliveryCount',(select count(*) from public.astros_cnpj_deliveries d where d.cnpj=s.cnpj)) order by s.updated_at desc,s.cnpj) from selected s),'[]'::jsonb)) into result;
 else
  with filtered as materialized (
   select d.id from public.astros_cnpj_deliveries d join public.painel_de_desbanimento p on p.id=d.user_id join public.astros_cnpj_requests r on r.id=d.request_id
   where (search_text='' or strpos(lower(coalesce(d.snapshot->>'name','')||' '||d.cnpj),search_text)>0)
    and (account_email='' or lower(btrim(p.email))=account_email) and (query_key='' or r.query_id=query_key)
    and (request_key is null or d.request_id=request_key)
  ), selected as (
   select d.*,p.nome,p.email from filtered f join public.astros_cnpj_deliveries d on d.id=f.id join public.painel_de_desbanimento p on p.id=d.user_id
   order by d.created_at desc,d.id desc limit 20 offset page_number*20
  )
  select jsonb_build_object('total',(select count(*) from filtered),'hasMore',(select count(*) from filtered)>(page_number+1)*20,
   'items',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'snapshot',public.astros_cnpj_admin_snapshot(s.snapshot),
    'createdAt',s.created_at,'stage',s.status,'requestId',s.request_id,'client',jsonb_build_object('name',s.nome,'email',s.email)) order by s.created_at desc,s.id desc) from selected s),'[]'::jsonb)) into result;
 end if;
 return result||jsonb_build_object('asOf',now());
end $$;
revoke all on function public.astros_cnpj_admin_snapshot(jsonb),public.astros_cnpj_admin_audit(uuid,text,text,text,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.astros_cnpj_admin_snapshot(jsonb),public.astros_cnpj_admin_audit(uuid,text,text,text,text,uuid,integer) to service_role;
commit;
