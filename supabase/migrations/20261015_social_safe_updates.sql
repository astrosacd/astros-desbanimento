-- Replace only social configuration/catalog routines; preserve data and permissions.
begin;
create or replace function public.astros_social_configure(actor uuid,active boolean,fx bigint,margin integer,fee bigint,key_value text) returns void language plpgsql security definer set search_path='' as $$
declare oldkey text;s public.astros_social_settings;begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 if fx not between 1 and 10000000 or margin not between 0 and 100000 or fee not between 0 and 100000 or active is null or key_value is null or length(key_value)>200 then raise exception 'Confira os valores';end if;
 select * into s from public.astros_social_settings where id=true for update;
 select api_key into oldkey from public.astros_social_private where id=true for update;
 if key_value<>'' and key_value<>oldkey then
  if exists(select 1 from public.astros_social_orders where state in ('dispatching','pending','processing','review')) or exists(select 1 from public.astros_social_actions where state in ('pending','uncertain')) then raise exception 'Conclua os pedidos antes de trocar a chave';end if;
  update public.astros_social_private set api_key=key_value,integration_id=gen_random_uuid() where id=true;
  update public.astros_social_services set enabled=false,available=false,updated_at=clock_timestamp() where enabled or available;
  update public.astros_social_settings set catalog_at=null where id=true;s.catalog_at=null;
 end if;
 if active and (coalesce(nullif(key_value,''),nullif(oldkey,'')) is null or s.catalog_at is null or s.worker_at is null or s.worker_at<now()-interval '3 minutes') then raise exception 'Configure a integração, sincronize serviços e ative a rotina antes de liberar';end if;
 update public.astros_social_private set worker_secret=case when worker_secret='' then gen_random_uuid()::text||gen_random_uuid()::text else worker_secret end where id=true;
 update public.astros_social_settings set enabled=active,fx_units=fx,margin_bps=margin,fee_cents=fee,updated_at=clock_timestamp(),updated_by=actor where id=true;
end;$$;
create or replace function public.astros_social_sync(actor uuid,items jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items)>20000 or jsonb_array_length(items)<1 then raise exception 'Catálogo inválido';end if;
 perform 1 from public.astros_social_settings where id=true for update;
 update public.astros_social_services set available=false,updated_at=clock_timestamp() where available;
 insert into public.astros_social_services(id,provider_name,provider_category,description,rate_units,minimum,maximum,refill,cancel)
 select id,left(name,180),left(category,180),left(description,4000),rate,minimum,maximum,refill,cancel from jsonb_to_recordset(items) as x(id bigint,name text,category text,description text,rate bigint,minimum integer,maximum integer,refill boolean,cancel boolean)
 on conflict(id) do update set provider_name=excluded.provider_name,provider_category=excluded.provider_category,description=excluded.description,rate_units=excluded.rate_units,minimum=excluded.minimum,maximum=excluded.maximum,refill=excluded.refill,cancel=excluded.cancel,available=true,updated_at=clock_timestamp();
 get diagnostics n=row_count;update public.astros_social_settings set catalog_at=clock_timestamp() where id=true;return n;
end;$$;

commit;
