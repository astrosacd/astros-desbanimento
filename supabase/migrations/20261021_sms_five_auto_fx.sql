-- Câmbio exclusivo da 5SIM; instalação preserva configurações e pedidos existentes.
begin;
alter table public.astros_sms_five_settings
 add column if not exists fx_mode text not null default 'manual' check(fx_mode in ('manual','auto')),
 add column if not exists deposit_usd_units bigint not null default 10000000 check(deposit_usd_units between 1000000 and 10000000000),
 add column if not exists fixed_usd_units bigint not null default 350000 check(fixed_usd_units between 0 and 100000000),
 add column if not exists deposit_bps integer not null default 375 check(deposit_bps between 0 and 5000),
 add column if not exists conversion_bps integer not null default 0 check(conversion_bps between 0 and 5000),
 add column if not exists market_units bigint,add column if not exists fx_date date,add column if not exists fx_checked_at timestamptz;
create or replace function public.astros_sms_five_effective_fx(market bigint,deposit bigint,fixed_fee bigint,deposit_percent integer,conversion integer) returns bigint
language plpgsql immutable set search_path='' as $$
declare result bigint;
begin
 if market is null or market not between 1 and 10000000 or deposit is null or deposit not between 1000000 and 10000000000 or fixed_fee is null or fixed_fee not between 0 and 100000000 or deposit_percent is null or deposit_percent not between 0 and 5000 or conversion is null or conversion not between 0 and 5000 then raise exception 'Valores de câmbio inválidos';end if;
 -- Estimativa de taxas adicionadas ao saldo desejado; não reutiliza a fórmula SMSPool de taxas deduzidas.
 result=ceil(market::numeric*(deposit::numeric*(10000+deposit_percent)+fixed_fee::numeric*10000)*(10000+conversion)/(deposit::numeric*100000000));
 if result not between 1 and 10000000 then raise exception 'Cotação fora do limite';end if;return result;
end;$$;
create or replace function public.astros_sms_refresh_five_fx(market bigint,source_date date) returns void
language plpgsql security definer set search_path='' as $$
declare f public.astros_sms_five_settings;rate bigint;
begin
 if source_date is null or source_date>current_date+1 or source_date<current_date-7 then raise exception 'Cotação desatualizada';end if;
 perform 1 from public.astros_sms_settings where id=true for update;
 select * into f from public.astros_sms_five_settings where id=true for update;
 if f.fx_mode<>'auto' then return;end if;
 rate=public.astros_sms_five_effective_fx(market,f.deposit_usd_units,f.fixed_usd_units,f.deposit_bps,f.conversion_bps);
 update public.astros_sms_five_settings set market_units=market,fx_date=source_date,fx_checked_at=clock_timestamp(),native_brl_units=rate,updated_at=case when native_brl_units<>rate then clock_timestamp() else updated_at end where id=true;
 if rate<>f.native_brl_units then update public.astros_sms_settings set updated_at=clock_timestamp() where id=true and active_supplier='five_sim';end if;
end;$$;
create or replace function public.astros_sms_configure_five(actor uuid,fx bigint,margin integer,fee bigint,new_key text default '') returns void
language plpgsql security definer set search_path='' as $$
declare p public.astros_sms_private;
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso não autorizado';end if;
 if fx is null or fx not between 1 and 10000000 or margin is null or margin not between 0 and 100000 or fee is null or fee not between 0 and 100000 or new_key is null or (new_key<>'' and (length(new_key) not between 20 and 2000 or new_key !~ '^[A-Za-z0-9._-]+$')) then raise exception 'Confira os valores';end if;
 perform 1 from public.astros_sms_settings where id=true for update;
 select * into p from public.astros_sms_private where id=true for update;
 if new_key<>'' and new_key<>p.five_sim_key and exists(select 1 from public.astros_sms_orders where supplier='five_sim' and state in ('dispatching','pending','review')) then raise exception 'Conclua os pedidos antes de trocar a chave';end if;
 if coalesce(nullif(new_key,''),nullif(p.five_sim_key,'')) is null then raise exception 'Configure a chave';end if;
 update public.astros_sms_private set five_sim_key=coalesce(nullif(new_key,''),five_sim_key),worker_secret=case when worker_secret='' then replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','') else worker_secret end where id=true;
 update public.astros_sms_five_settings set native_brl_units=fx,margin_bps=margin,fee_cents=fee,fx_mode='manual',updated_at=clock_timestamp() where id=true;
 update public.astros_sms_settings set updated_at=clock_timestamp(),updated_by=actor where id=true;
end;$$;
create or replace function public.astros_sms_configure_five_fx(actor uuid,fx bigint,margin integer,fee bigint,new_key text,mode text,deposit bigint,fixed_fee bigint,deposit_percent integer,conversion integer,market bigint default null,source_date date default null) returns void
language plpgsql security definer set search_path='' as $$
declare rate bigint;
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso não autorizado';end if;
 if mode is null or mode not in ('manual','auto') then raise exception 'Modo inválido';end if;
 rate=public.astros_sms_five_effective_fx(coalesce(market,50000),deposit,fixed_fee,deposit_percent,conversion);
 if mode='auto' and (market is null or source_date is null or source_date>current_date+1 or source_date<current_date-7) then raise exception 'Cotação desatualizada';end if;
 perform 1 from public.astros_sms_settings where id=true for update;
 perform public.astros_sms_configure_five(actor,case when mode='auto' then rate else fx end,margin,fee,new_key);
 update public.astros_sms_five_settings set fx_mode=mode,deposit_usd_units=deposit,fixed_usd_units=fixed_fee,deposit_bps=deposit_percent,conversion_bps=conversion,
 market_units=case when mode='auto' then market else market_units end,fx_date=case when mode='auto' then source_date else fx_date end,
 fx_checked_at=case when mode='auto' then clock_timestamp() else fx_checked_at end where id=true;
end;$$;
-- Additive INSERT guard, leaving recovery/settlement and module controls intact.
create or replace function public.astros_sms_five_fx_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare f public.astros_sms_five_settings;
begin
 if new.supplier<>'five_sim' then return new;end if;
 perform 1 from public.astros_sms_settings where id=true for share;
 select * into f from public.astros_sms_five_settings where id=true;
 if f.fx_mode='auto' and (f.fx_checked_at is null or f.fx_checked_at<now()-interval '6 hours' or f.fx_date is null or f.fx_date<current_date-7 or f.fx_date>current_date+1) then raise exception 'Serviço indisponível';end if;
 return new;
end;$$;
drop trigger if exists astros_sms_five_fx_guard on public.astros_sms_quotes;
create trigger astros_sms_five_fx_guard before insert on public.astros_sms_quotes for each row execute function public.astros_sms_five_fx_guard();
drop trigger if exists astros_sms_five_fx_guard on public.astros_sms_orders;
create trigger astros_sms_five_fx_guard before insert on public.astros_sms_orders for each row execute function public.astros_sms_five_fx_guard();
revoke all on function public.astros_sms_five_effective_fx(bigint,bigint,bigint,integer,integer),public.astros_sms_refresh_five_fx(bigint,date),public.astros_sms_configure_five_fx(uuid,bigint,integer,bigint,text,text,bigint,bigint,integer,integer,bigint,date),public.astros_sms_five_fx_guard() from public,anon,authenticated;
grant execute on function public.astros_sms_five_effective_fx(bigint,bigint,bigint,integer,integer),public.astros_sms_refresh_five_fx(bigint,date),public.astros_sms_configure_five_fx(uuid,bigint,integer,bigint,text,text,bigint,bigint,integer,integer,bigint,date) to service_role;
commit;
