-- Classificação automática para serviços simples e redes compatíveis. Sem movimentação financeira.
begin;
alter table public.astros_social_settings add column if not exists auto_catalog_enabled boolean not null default false;
alter table public.astros_social_services add column if not exists auto_network text not null default '';
alter table public.astros_social_services add column if not exists auto_type text not null default 'other';
alter table public.astros_social_services add column if not exists auto_classified boolean not null default false;
alter table public.astros_social_services add column if not exists manual_visibility boolean not null default false;
-- Preserve existing administrator decisions, including deliberately hidden curated items.
update public.astros_social_services set manual_visibility=true where network<>'' and not auto_classified;
create or replace function public.astros_social_apply_automatic() returns void language plpgsql security definer set search_path='' as $$
declare active boolean;begin
 select auto_catalog_enabled into active from public.astros_social_settings where id=true;
 update public.astros_social_services set network=auto_network,title=provider_name,auto_classified=true,needs_review=false,updated_at=clock_timestamp()
 where (auto_classified or (network='' and auto_network in ('instagram','facebook','youtube','tiktok','x','telegram'))) and (network is distinct from auto_network or title is distinct from provider_name or not auto_classified or needs_review);
 update public.astros_social_services set enabled=coalesce(active,false) and available and network<>'' and not needs_review,updated_at=clock_timestamp()
 where not manual_visibility and enabled is distinct from (coalesce(active,false) and available and network<>'' and not needs_review);
end;$$;
create or replace function public.astros_social_auto_catalog(actor uuid,active boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if active is null or not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 perform 1 from public.astros_social_settings where id=true for update;
 update public.astros_social_settings set auto_catalog_enabled=active where id=true;
 perform public.astros_social_apply_automatic();
end;$$;
create or replace function public.astros_social_catalog_finish(lease uuid,generation uuid,items jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare s public.astros_social_settings;g uuid;n integer;
begin
 select * into s from public.astros_social_settings where id=true for update;
 select integration_id into g from public.astros_social_private where id=true for share;
 if s.catalog_token is distinct from lease or lease is null or generation is distinct from g or s.catalog_lease_at is null or s.catalog_lease_at<now()-interval '90 seconds' then raise exception 'Sincronização substituída. Atualize a página';end if;
 if items is null or jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 20000 then raise exception 'Catálogo inválido';end if;
 update public.astros_social_services set available=false,updated_at=clock_timestamp() where available and id not in(select (x->>'id')::bigint from jsonb_array_elements(items) x);
 insert into public.astros_social_services(id,provider_name,provider_category,description,rate_units,minimum,maximum,refill,cancel)
 select id,left(name,180),left(category,180),left(description,4000),rate,minimum,maximum,refill,cancel from jsonb_to_recordset(items) as x(id bigint,name text,category text,description text,rate bigint,minimum integer,maximum integer,refill boolean,cancel boolean)
 on conflict(id) do update set
 provider_name=excluded.provider_name,provider_category=excluded.provider_category,description=excluded.description,rate_units=excluded.rate_units,minimum=excluded.minimum,maximum=excluded.maximum,refill=excluded.refill,cancel=excluded.cancel,available=true,
 needs_review=astros_social_services.needs_review or (astros_social_services.provider_name,astros_social_services.provider_category,astros_social_services.description,astros_social_services.minimum,astros_social_services.maximum,astros_social_services.refill,astros_social_services.cancel) is distinct from (excluded.provider_name,excluded.provider_category,excluded.description,excluded.minimum,excluded.maximum,excluded.refill,excluded.cancel),
 enabled=astros_social_services.enabled and (astros_social_services.provider_name,astros_social_services.provider_category,astros_social_services.description,astros_social_services.minimum,astros_social_services.maximum,astros_social_services.refill,astros_social_services.cancel) is not distinct from (excluded.provider_name,excluded.provider_category,excluded.description,excluded.minimum,excluded.maximum,excluded.refill,excluded.cancel),updated_at=clock_timestamp()
 where (astros_social_services.provider_name,astros_social_services.provider_category,astros_social_services.description,astros_social_services.rate_units,astros_social_services.minimum,astros_social_services.maximum,astros_social_services.refill,astros_social_services.cancel,astros_social_services.available) is distinct from (excluded.provider_name,excluded.provider_category,excluded.description,excluded.rate_units,excluded.minimum,excluded.maximum,excluded.refill,excluded.cancel,true);
 update public.astros_social_services c set auto_network=case when x.auto_network in ('instagram','facebook','youtube','tiktok','x','telegram') then x.auto_network else '' end,auto_type=case when x.auto_type in ('followers','likes','views','comments','shares','subscribers','other') then x.auto_type else 'other' end from jsonb_to_recordset(items) as x(id bigint,auto_network text,auto_type text) where c.id=x.id;
 perform public.astros_social_apply_automatic();
 n:=jsonb_array_length(items);update public.astros_social_settings set catalog_at=clock_timestamp(),catalog_lease_at=null,catalog_token=null,catalog_error=false where id=true;return n;
end;$$;
create or replace function public.astros_social_present(actor uuid,service bigint,active boolean,platform text,label text,customer_text text,category text) returns void language plpgsql security definer set search_path='' as $$
begin
 if customer_text is null or length(customer_text)>4000 or category is null or category not in ('followers','likes','views','comments','shares','subscribers','other') then raise exception 'Confira os campos';end if;
 perform public.astros_social_curate(actor,service,active,platform,label);
 update public.astros_social_services set manual_visibility=true,auto_classified=false,customer_description=trim(customer_text),category_code=category,needs_review=false,updated_at=clock_timestamp() where id=service;
end;$$;
create or replace function public.astros_social_visibility(actor uuid,services bigint[],active boolean) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 if services is null or active is null or cardinality(services) not between 1 and 100 or array_position(services,null) is not null then raise exception 'Seleção inválida';end if;
 if (select count(distinct x) from unnest(services) x)<>cardinality(services) then raise exception 'Seleção inválida';end if;
 perform 1 from public.astros_social_settings where id=true for update;
 perform 1 from public.astros_social_services where id=any(services) order by id for update;
 select count(*) into n from public.astros_social_services where id=any(services);
 if n<>cardinality(services) then raise exception 'Há serviços indisponíveis. Atualize o catálogo e revise a seleção';end if;
 if active and exists(select 1 from public.astros_social_services where id=any(services) and not available) then raise exception 'Há serviços indisponíveis. Atualize o catálogo e revise a seleção';end if;
 if active and exists(select 1 from public.astros_social_services where id=any(services) and (needs_review or network not in ('instagram','facebook','youtube','tiktok','x','telegram') or length(trim(title))<3)) then raise exception 'Configure a rede e o nome dos serviços antes de liberar';end if;
 update public.astros_social_services set manual_visibility=true,enabled=active,updated_at=clock_timestamp() where id=any(services) and (enabled is distinct from active or not manual_visibility);
 return n;
end;$$;
revoke all on function public.astros_social_apply_automatic() from public,anon,authenticated;
grant execute on function public.astros_social_apply_automatic() to service_role;
revoke all on function public.astros_social_auto_catalog(uuid,boolean) from public,anon,authenticated;
grant execute on function public.astros_social_auto_catalog(uuid,boolean) to service_role;

create or replace function public.astros_social_catalog_facets() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(g order by g.network,g.kind,g.category),'[]'::jsonb) from (select network,coalesce(nullif(category_code,''),nullif(auto_type,''),'other') as kind,provider_category as category,count(*) as count from public.astros_social_services where enabled and available and network<>'' and exists(select 1 from public.astros_social_settings where id=true and enabled) group by network,coalesce(nullif(category_code,''),nullif(auto_type,''),'other'),provider_category)g;
$$;
revoke all on function public.astros_social_catalog_facets() from public,anon,authenticated;
grant execute on function public.astros_social_catalog_facets() to service_role;
commit;
