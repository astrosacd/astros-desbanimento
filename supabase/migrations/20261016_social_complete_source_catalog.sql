-- Complete source inventory is administrative only. Publication remains manual.
begin;
create table if not exists public.astros_social_source_catalog(id bigint primary key,source_name text not null,source_category text not null,source_type text not null,platform_key text not null check(platform_key ~ '^[a-z][a-z0-9-]{0,79}$'),platform_label text not null,supported boolean not null default false,source_data jsonb not null check(jsonb_typeof(source_data)='object'),available boolean not null default true,updated_at timestamptz not null default now());
alter table public.astros_social_source_catalog enable row level security;
revoke all on public.astros_social_source_catalog from public,anon,authenticated;
grant all on public.astros_social_source_catalog to service_role;
create index if not exists astros_social_source_platform on public.astros_social_source_catalog(platform_key,source_type);
alter table public.astros_social_services drop constraint if exists astros_social_services_network_check;
alter table public.astros_social_services add constraint astros_social_services_network_check check(network='' or network ~ '^[a-z][a-z0-9-]{0,79}$');
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
 update public.astros_social_services c set auto_network=case when x.auto_network ~ '^[a-z][a-z0-9-]{0,79}$' then x.auto_network else '' end,auto_type=case when x.auto_type in ('followers','likes','views','comments','shares','subscribers','other') then x.auto_type else 'other' end from jsonb_to_recordset(items) as x(id bigint,auto_network text,auto_type text) where c.id=x.id;
 update public.astros_social_services c set provider_metrics=coalesce(x.metrics,'{}'::jsonb) from jsonb_to_recordset(items) as x(id bigint,metrics jsonb) where c.id=x.id and c.provider_metrics is distinct from coalesce(x.metrics,'{}'::jsonb);
 perform public.astros_social_apply_automatic();
 n:=jsonb_array_length(items);update public.astros_social_settings set catalog_at=clock_timestamp(),catalog_lease_at=null,catalog_token=null,catalog_error=false where id=true;return n;
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
 if active and exists(select 1 from public.astros_social_services where id=any(services) and (needs_review or network !~ '^[a-z][a-z0-9-]{0,79}$' or length(trim(title))<3)) then raise exception 'Configure a rede e o nome dos serviços antes de liberar';end if;
 update public.astros_social_services set manual_visibility=true,enabled=active,updated_at=clock_timestamp() where id=any(services) and (enabled is distinct from active or not manual_visibility);
 return n;
end;$$;
create or replace function public.astros_social_curate(actor uuid,service bigint,active boolean,platform text,label text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 if platform !~ '^[a-z][a-z0-9-]{0,79}$' or length(trim(label)) not between 3 and 180 or active is null then raise exception 'Confira os campos';end if;
 update public.astros_social_services set enabled=active,network=platform,title=trim(label),updated_at=clock_timestamp() where id=service and available;
 if not found then raise exception 'Serviço indisponível';end if;
end;$$;

create or replace function public.astros_social_catalog_publish(lease uuid,generation uuid,items jsonb,source_items jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;begin
 if source_items is null or jsonb_typeof(source_items)<>'array' or jsonb_array_length(source_items) not between 1 and 20000 or (select count(distinct x->>'id') from jsonb_array_elements(source_items)x)<>jsonb_array_length(source_items) then raise exception 'Catálogo original inválido';end if;
 if exists(select 1 from jsonb_array_elements(items)i where not exists(select 1 from jsonb_array_elements(source_items)s where s->>'id'=i->>'id')) then raise exception 'Catálogo incompatível';end if;
 n:=public.astros_social_catalog_finish(lease,generation,items);
 update public.astros_social_source_catalog set available=false where available and id not in(select (x->>'id')::bigint from jsonb_array_elements(source_items)x);
 insert into public.astros_social_source_catalog(id,source_name,source_category,source_type,platform_key,platform_label,supported,source_data)
 select id,source_name,source_category,source_type,platform_key,platform_label,supported,source_data from jsonb_to_recordset(source_items)as x(id bigint,source_name text,source_category text,source_type text,platform_key text,platform_label text,supported boolean,source_data jsonb)
 on conflict(id) do update set source_name=excluded.source_name,source_category=excluded.source_category,source_type=excluded.source_type,platform_key=excluded.platform_key,platform_label=excluded.platform_label,supported=excluded.supported,source_data=excluded.source_data,available=true,updated_at=clock_timestamp()
 where (astros_social_source_catalog.source_name,astros_social_source_catalog.source_category,astros_social_source_catalog.source_type,astros_social_source_catalog.platform_key,astros_social_source_catalog.platform_label,astros_social_source_catalog.supported,astros_social_source_catalog.source_data,astros_social_source_catalog.available) is distinct from (excluded.source_name,excluded.source_category,excluded.source_type,excluded.platform_key,excluded.platform_label,excluded.supported,excluded.source_data,true);
 return n;
end;$$;
create or replace function public.astros_social_platforms(actor uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if actor is not null and not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 if actor is not null then
 select coalesce(jsonb_agg(p order by p.name),'[]'::jsonb) into result from (select platform_key as id,min(platform_label) as name from public.astros_social_source_catalog where available group by platform_key)p;
 else
 select coalesce(jsonb_agg(p order by p.name),'[]'::jsonb) into result from (select c.network as id,coalesce((select min(s.platform_label) from public.astros_social_source_catalog s where s.platform_key=c.network and s.available),c.network)as name from public.astros_social_services c where c.enabled and c.available and not c.needs_review and c.network<>'' and exists(select 1 from public.astros_social_settings where id=true and enabled) group by c.network)p;
 end if;return result;
end;$$;
create or replace function public.astros_social_source_list(actor uuid,filters jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare pg integer:=coalesce((filters->>'page')::integer,0);result jsonb;begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 if pg not between 0 and 10000 then raise exception 'Página inválida';end if;
 with filtered as (select s.*,c.title as retail_title,coalesce(c.enabled,false)as published from public.astros_social_source_catalog s left join public.astros_social_services c on c.id=s.id where s.available and (coalesce(filters->>'platform','')='' or s.platform_key=filters->>'platform') and (coalesce(filters->>'type','')='' or s.source_type=filters->>'type') and (coalesce(filters->>'search','')='' or strpos(lower(s.source_name||' '||s.source_category||' '||s.id::text),lower(filters->>'search'))>0)),batch as(select * from filtered order by source_category,source_name,id limit 20 offset pg*20)
 select jsonb_build_object('services',coalesce((select jsonb_agg(to_jsonb(batch) order by source_category,source_name,id)from batch),'[]'::jsonb),'total',(select count(*)from filtered),'catalogTotal',(select count(*)from public.astros_social_source_catalog where available),'hasMore',(select count(*)from filtered)>pg*20+20,'types',(select coalesce(jsonb_agg(t order by t),'[]'::jsonb)from(select distinct source_type as t from public.astros_social_source_catalog where available)x)) into result;return result;
end;$$;
revoke all on function public.astros_social_catalog_publish(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.astros_social_platforms(uuid) from public,anon,authenticated;
revoke all on function public.astros_social_source_list(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.astros_social_catalog_publish(uuid,uuid,jsonb,jsonb) to service_role;
grant execute on function public.astros_social_platforms(uuid) to service_role;
grant execute on function public.astros_social_source_list(uuid,jsonb) to service_role;
commit;
