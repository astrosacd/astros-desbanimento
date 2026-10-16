-- Apresentação em português e sincronização automática; não altera saldos nem pedidos existentes.
begin;
alter table public.astros_social_services add column if not exists customer_description text not null default '' check(length(customer_description)<=4000);
alter table public.astros_social_services add column if not exists category_code text not null default '' check(category_code in ('','followers','likes','views','comments','shares','subscribers','other'));
alter table public.astros_social_services add column if not exists needs_review boolean not null default false;
alter table public.astros_social_quotes add column if not exists customer_description text not null default '';
alter table public.astros_social_orders add column if not exists customer_description text not null default '';
alter table public.astros_social_settings add column if not exists catalog_attempt_at timestamptz;
alter table public.astros_social_settings add column if not exists catalog_lease_at timestamptz;
alter table public.astros_social_settings add column if not exists catalog_token uuid;
alter table public.astros_social_settings add column if not exists catalog_error boolean not null default false;
create or replace function public.astros_social_present(actor uuid,service bigint,active boolean,platform text,label text,customer_text text,category text) returns void language plpgsql security definer set search_path='' as $$
begin
 if customer_text is null or length(customer_text)>4000 or category is null or category not in ('followers','likes','views','comments','shares','subscribers','other') then raise exception 'Confira os campos';end if;
 perform public.astros_social_curate(actor,service,active,platform,label);
 update public.astros_social_services set customer_description=trim(customer_text),category_code=category,needs_review=false,updated_at=clock_timestamp() where id=service;
end;$$;
create or replace function public.astros_social_catalog_claim(actor uuid default null,force_refresh boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.astros_social_settings;g uuid;k text;t uuid;
begin
 if force_refresh is null then raise exception 'Acesso restrito';end if;
 if force_refresh and actor is null then raise exception 'Acesso restrito';end if;
 if actor is not null and not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 select * into s from public.astros_social_settings where id=true for update;
 select integration_id,api_key into g,k from public.astros_social_private where id=true for share;
 if coalesce(k,'')='' or (s.catalog_lease_at is not null and s.catalog_lease_at>now()-interval '90 seconds') then return jsonb_build_object('started',false);end if;
 if not force_refresh and (s.catalog_attempt_at>now()-interval '5 minutes' or (not s.catalog_error and s.catalog_at>now()-interval '1 hour')) then return jsonb_build_object('started',false);end if;
 t:=gen_random_uuid();update public.astros_social_settings set catalog_token=t,catalog_lease_at=clock_timestamp(),catalog_attempt_at=clock_timestamp() where id=true;
 return jsonb_build_object('started',true,'token',t,'generation',g);
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
 n:=jsonb_array_length(items);update public.astros_social_settings set catalog_at=clock_timestamp(),catalog_lease_at=null,catalog_token=null,catalog_error=false where id=true;return n;
end;$$;
create or replace function public.astros_social_catalog_fail(lease uuid) returns void language sql security definer set search_path='' as $$update public.astros_social_settings set catalog_error=true,catalog_token=null,catalog_lease_at=null where id=true and catalog_token=lease;$$;
create or replace function public.astros_social_operations(actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 select jsonb_build_object('total',count(*),'active',count(*) filter(where state in ('dispatching','pending','processing')),'completed',count(*) filter(where state='completed'),'partial',count(*) filter(where state='partial'),'refunded',count(*) filter(where state='refunded'),'review',count(*) filter(where state='review')) into result from public.astros_social_orders;
 return result||jsonb_build_object('attentionCount',(select count(*) from public.astros_social_orders where state='review' or (state in ('dispatching','pending','processing') and created_at<now()-interval '24 hours')),'attention',coalesce((select jsonb_agg(x order by x.created_at,x.id) from(select id,title,state,created_at from public.astros_social_orders where state='review' or (state in ('dispatching','pending','processing') and created_at<now()-interval '24 hours') order by created_at,id limit 20)x),'[]'::jsonb),'checkedAt',clock_timestamp());
end;$$;
create or replace function public.astros_social_reserve(actor uuid,request_id uuid,quote uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.astros_social_quotes;o public.astros_social_orders;s public.astros_social_settings;c public.astros_social_services;b numeric;begin
 select recarga into b from public.painel_de_desbanimento where id=actor for update;if not found then raise exception 'Conta indisponível';end if;
 select * into o from public.astros_social_orders where id=request_id;if found then if o.user_id<>actor or o.quote_id<>quote then raise exception 'Referência divergente';end if;return jsonb_build_object('dispatch',false);end if;
 select * into s from public.astros_social_settings where id=true for share;
 if not s.enabled or s.worker_at is null or s.worker_at<now()-interval '3 minutes' then raise exception 'Serviço indisponível';end if;
 select * into q from public.astros_social_quotes where id=quote and user_id=actor for update;
 if not found or q.expires_at<=now() or q.settings_version<>s.updated_at then raise exception 'Consulte o preço novamente';end if;
 select * into c from public.astros_social_services where id=q.service_id for share;
 if not c.enabled or not c.available or c.network='' or q.service_version<>c.updated_at then raise exception 'Consulte o preço novamente';end if;
 if exists(select 1 from public.astros_social_orders where quote_id=quote) then raise exception 'Cotação já utilizada';end if;
 if (select count(*) from public.astros_social_orders where user_id=actor and state in ('dispatching','pending','processing','review'))>=20 then raise exception 'Conclua os pedidos em andamento';end if;
 if b is null or b<q.price_cents/100.0 then raise exception 'Saldo insuficiente. Faça uma recarga';end if;
 insert into public.astros_social_orders(id,user_id,quote_id,service_id,title,description,customer_description,integration_id,network,link,quantity,cost_units,fx_units,price_cents,refill,cancel,state)
 values(request_id,actor,q.id,q.service_id,q.title,q.description,q.customer_description,q.integration_id,q.network,q.link,q.quantity,q.cost_units,q.fx_units,q.price_cents,q.refill,q.cancel,'dispatching');
 update public.painel_de_desbanimento set recarga=recarga-q.price_cents/100.0 where id=actor;
 insert into public.astros_wallet_movements(user_id,amount_cents,kind,reference) values(actor,-q.price_cents,'debit','social:'||request_id);
 return jsonb_build_object('dispatch',true);
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
 update public.astros_social_services set enabled=active,updated_at=clock_timestamp() where id=any(services) and enabled is distinct from active;
 return n;
end;$$;
revoke all on function public.astros_social_present(uuid,bigint,boolean,text,text,text,text) from public,anon,authenticated;
grant execute on function public.astros_social_present(uuid,bigint,boolean,text,text,text,text) to service_role;
revoke all on function public.astros_social_catalog_claim(uuid,boolean) from public,anon,authenticated;
grant execute on function public.astros_social_catalog_claim(uuid,boolean) to service_role;
revoke all on function public.astros_social_catalog_finish(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.astros_social_catalog_finish(uuid,uuid,jsonb) to service_role;
revoke all on function public.astros_social_catalog_fail(uuid) from public,anon,authenticated;
grant execute on function public.astros_social_catalog_fail(uuid) to service_role;
revoke all on function public.astros_social_operations(uuid) from public,anon,authenticated;
grant execute on function public.astros_social_operations(uuid) to service_role;
commit;
