-- Manual release only. Provider prices refresh without replacing administrator names.
begin;
alter table public.astros_social_settings add column if not exists manual_catalog_enforced boolean not null default false;
alter table public.astros_social_services add column if not exists provider_metrics jsonb not null default '{}'::jsonb;
-- Hide the previously automatic catalog once. Reapplying this migration preserves later manual releases.
do $$begin
 perform 1 from public.astros_social_settings where id=true for update;
 if exists(select 1 from public.astros_social_settings where id=true and not manual_catalog_enforced) then
  update public.astros_social_services set enabled=false,updated_at=clock_timestamp() where enabled;
  update public.astros_social_settings set manual_catalog_enforced=true,auto_catalog_enabled=false where id=true;
 end if;
end;$$;
create or replace function public.astros_social_apply_automatic() returns void language plpgsql security definer set search_path='' as $$
begin
 -- Classification is independent of publication. Never enable a service here.
 update public.astros_social_services set network=auto_network,title=case when title='' or (auto_classified and not manual_visibility) then provider_name else title end,auto_classified=true,updated_at=clock_timestamp()
 where (auto_classified or (network='' and auto_network<>'')) and (network is distinct from auto_network or title='' or (auto_classified and not manual_visibility and title is distinct from provider_name));
end;$$;
create or replace function public.astros_social_auto_catalog(actor uuid,active boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 if active is distinct from false then raise exception 'A liberação de serviços é exclusivamente manual';end if;
 update public.astros_social_settings set auto_catalog_enabled=false where id=true;
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
 update public.astros_social_services c set auto_network=case when x.auto_network in ('instagram','facebook','youtube','tiktok','x','telegram','twitch','linkedin','spotify','threads','website','snapchat','whatsapp','kick','pinterest') then x.auto_network else '' end,auto_type=case when x.auto_type in ('followers','likes','views','comments','shares','subscribers','other') then x.auto_type else 'other' end from jsonb_to_recordset(items) as x(id bigint,auto_network text,auto_type text) where c.id=x.id;
 update public.astros_social_services c set provider_metrics=coalesce(x.metrics,'{}'::jsonb) from jsonb_to_recordset(items) as x(id bigint,metrics jsonb) where c.id=x.id and c.provider_metrics is distinct from coalesce(x.metrics,'{}'::jsonb);
 perform public.astros_social_apply_automatic();
 n:=jsonb_array_length(items);update public.astros_social_settings set catalog_at=clock_timestamp(),catalog_lease_at=null,catalog_token=null,catalog_error=false where id=true;return n;
end;$$;
commit;
