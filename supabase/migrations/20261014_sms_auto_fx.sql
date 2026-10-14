-- Cotação automática opcional; preserva o modo manual e os saldos existentes.
begin;
alter table public.astros_sms_settings
 add column if not exists fx_mode text not null default 'manual' check(fx_mode in ('manual','auto')),
 add column if not exists deposit_bps integer not null default 325 check(deposit_bps between 0 and 5000),
 add column if not exists conversion_bps integer not null default 400 check(conversion_bps between 0 and 5000),
 add column if not exists extra_bps integer not null default 0 check(extra_bps between 0 and 5000),
 add column if not exists fixed_usd_units bigint not null default 250000 check(fixed_usd_units between 0 and 100000000),
 add column if not exists deposit_usd_units bigint not null default 10000000 check(deposit_usd_units between 1000000 and 10000000000),
 add column if not exists market_units bigint,add column if not exists fx_date date,add column if not exists fx_checked_at timestamptz;
create or replace function public.astros_sms_effective_fx(market bigint,deposit bigint,fixed_fee bigint,deposit_percent integer,conversion integer,extra integer) returns bigint
language plpgsql immutable set search_path='' as $$
declare credit numeric;result bigint;
begin
 if market not between 1 and 10000000 or deposit not between 1000000 and 10000000000 or fixed_fee not between 0 and 100000000 or deposit_percent not between 0 and 5000 or conversion not between 0 and 5000 or extra not between 0 and 5000 then raise exception 'Valores de câmbio inválidos';end if;
 credit=round((deposit::numeric*(10000-deposit_percent)/10000-fixed_fee)/10000)*10000;
 if credit<=0 then raise exception 'Recarga de referência insuficiente para as taxas';end if;
 result=ceil(market::numeric*(10000+conversion)*(10000+extra)*deposit/(100000000*credit));
 if result not between 1 and 10000000 then raise exception 'Cotação fora do limite';end if;return result;
end;$$;
create or replace function public.astros_sms_refresh_fx(market bigint,source_date date) returns void
language plpgsql security definer set search_path='' as $$
declare s public.astros_sms_settings;effective bigint;
begin
 if source_date>current_date+1 or source_date<current_date-7 then raise exception 'Cotação desatualizada';end if;
 select * into s from public.astros_sms_settings where id=true for update;
 if s.fx_mode<>'auto' then return;end if;
 effective=public.astros_sms_effective_fx(market,s.deposit_usd_units,s.fixed_usd_units,s.deposit_bps,s.conversion_bps,s.extra_bps);
 update public.astros_sms_settings set market_units=market,fx_date=source_date,fx_checked_at=clock_timestamp(),usd_brl_units=effective,
 updated_at=case when usd_brl_units<>effective then clock_timestamp() else updated_at end where id=true;
end;$$;
create or replace function public.astros_sms_configure_fx(actor uuid,active boolean,manual_fx bigint,margin integer,fee bigint,new_key text,mode text,deposit bigint,fixed_fee bigint,deposit_percent integer,conversion integer,extra integer,market bigint default null,source_date date default null) returns void
language plpgsql security definer set search_path='' as $$
declare effective bigint;
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso não autorizado';end if;
 if mode not in ('manual','auto') or mode is null then raise exception 'Modo inválido';end if;
 -- Validate all fee inputs even in manual mode.
 effective=public.astros_sms_effective_fx(coalesce(market,50000),deposit,fixed_fee,deposit_percent,conversion,extra);
 if mode='auto' and (market is null or source_date is null or source_date<current_date-7 or source_date>current_date+1) then raise exception 'Cotação desatualizada';end if;
 perform 1 from public.astros_sms_settings where id=true for update;
 perform public.astros_sms_configure(actor,active,case when mode='auto' then effective else manual_fx end,margin,fee,new_key);
 update public.astros_sms_settings set fx_mode=mode,deposit_usd_units=deposit,fixed_usd_units=fixed_fee,deposit_bps=deposit_percent,conversion_bps=conversion,extra_bps=extra,
 market_units=case when mode='auto' then market else market_units end,fx_date=case when mode='auto' then source_date else fx_date end,
 fx_checked_at=case when mode='auto' then clock_timestamp() else fx_checked_at end where id=true;
end;$$;
-- Preserve the original debit protocol, adding an atomic freshness guard.
do $$begin
 if to_regprocedure('public.astros_sms_reserve_base(uuid,uuid,uuid)') is null then
  alter function public.astros_sms_reserve(uuid,uuid,uuid) rename to astros_sms_reserve_base;
 end if;
end;$$;
create or replace function public.astros_sms_reserve(actor uuid,request_id uuid,quote uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.astros_sms_settings;
begin
 -- Existing IDs must still be recoverable even when FX is stale.
 if exists(select 1 from public.astros_sms_orders where id=request_id) then return public.astros_sms_reserve_base(actor,request_id,quote);end if;
 -- Match the existing profile -> settings lock order.
 perform 1 from public.painel_de_desbanimento where id=actor for update;
 select * into s from public.astros_sms_settings where id=true for share;
 if s.fx_mode='auto' and (s.fx_checked_at is null or s.fx_checked_at<now()-interval '6 hours' or s.fx_date is null or s.fx_date<current_date-7) then raise exception 'Serviço indisponível';end if;
 return public.astros_sms_reserve_base(actor,request_id,quote);
end;$$;
revoke all on function public.astros_sms_refresh_fx(bigint,date),public.astros_sms_configure_fx(uuid,boolean,bigint,integer,bigint,text,text,bigint,bigint,integer,integer,integer,bigint,date),public.astros_sms_reserve(uuid,uuid,uuid),public.astros_sms_reserve_base(uuid,uuid,uuid),public.astros_sms_effective_fx(bigint,bigint,bigint,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.astros_sms_refresh_fx(bigint,date),public.astros_sms_configure_fx(uuid,boolean,bigint,integer,bigint,text,text,bigint,bigint,integer,integer,integer,bigint,date),public.astros_sms_reserve(uuid,uuid,uuid),public.astros_sms_reserve_base(uuid,uuid,uuid),public.astros_sms_effective_fx(bigint,bigint,bigint,integer,integer,integer) to service_role;
commit;
