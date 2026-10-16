-- Read-only administrator comparison over the entire operational catalog before pagination.
begin;
create or replace function public.astros_social_admin_catalog(actor uuid,filters jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;pg integer:=coalesce((filters->>'page')::integer,0);sorting text:=coalesce(filters->>'sort','default');minp bigint:=(filters->>'minPriceCents')::bigint;maxp bigint:=(filters->>'maxPriceCents')::bigint;minq integer:=(filters->>'minQuantity')::integer;maxq integer:=(filters->>'maxQuantity')::integer;
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 if coalesce(filters->>'state','all') not in ('all','enabled','hidden','unavailable','unclassified','review') then raise exception 'Filtro inválido';end if;
 if pg not between 0 and 10000 or sorting not in ('default','cheapest','reliability','drop') or coalesce(minp,0)<0 or coalesce(maxp,0)<0 or coalesce(minp,0)>1000000 or coalesce(maxp,0)>1000000 or coalesce(minq,0)<0 or coalesce(maxq,0)<0 or coalesce(minq,0)>100000000 or coalesce(maxq,0)>100000000 or (minp is not null and maxp is not null and minp>maxp) or (minq is not null and maxq is not null and minq>maxq) or length(coalesce(filters->>'region',''))>80 then raise exception 'Confira as preferências';end if;
 with source as (
 select c.*,case when s.fx_units>0 then ceil(c.rate_units::numeric*s.fx_units*(10000+s.margin_bps)/1000000000000)::bigint+s.fee_cents end as reference_price_cents,
 case lower(trim(coalesce(c.provider_metrics->>'reliability',''))) when 'high' then 3 when 'alta' then 3 when 'medium' then 2 when 'média' then 2 when 'media' then 2 when 'low' then 1 when 'baixa' then 1 end as reliability_rank,
 case when trim(coalesce(c.provider_metrics->>'drop_rate',c.provider_metrics->>'drop','')) ~ '^([0-9]{1,2}([.,][0-9]+)?|100([.,]0+)?)\s*%$' then replace(regexp_replace(coalesce(c.provider_metrics->>'drop_rate',c.provider_metrics->>'drop'),'\s*%$',''),',','.')::numeric end as drop_percent
 from public.astros_social_services c cross join public.astros_social_settings s where s.id=true
 and (coalesce(filters->>'state','all')='all' or (filters->>'state'='enabled' and c.enabled and c.available) or (filters->>'state'='hidden' and not c.enabled and c.available) or (filters->>'state'='unavailable' and not c.available) or (filters->>'state'='unclassified' and c.network='') or (filters->>'state'='review' and c.needs_review))
 and (coalesce(filters->>'network','all')='all' or (filters->>'network'='undefined' and c.network='') or c.network=filters->>'network')
 and (coalesce(filters->>'serviceType','all')='all' or coalesce(nullif(c.category_code,''),c.auto_type)=filters->>'serviceType')
 and (coalesce(filters->>'category','')='' or c.provider_category=filters->>'category')
 and (coalesce(filters->>'search','')='' or strpos(lower(c.title||' '||c.provider_name||' '||c.provider_category),lower(filters->>'search'))>0)
 and (coalesce(filters->>'region','')='' or strpos(lower(c.title||' '||c.provider_name||' '||c.provider_category||' '||c.description),lower(filters->>'region'))>0)
 and (minq is null or c.maximum>=minq) and (maxq is null or c.minimum<=maxq)
 ), filtered as (select * from source where (minp is null or reference_price_cents>=minp) and (maxp is null or reference_price_cents<=maxp)),
 numbered as (select *,row_number() over(order by case when sorting='cheapest' then reference_price_cents end asc nulls last,case when sorting='cheapest' and reference_price_cents is null then rate_units end asc nulls last,case when sorting='reliability' then reliability_rank end desc nulls last,case when sorting='drop' then drop_percent end asc nulls last,title,id) as position from filtered),
 batch as (select * from numbered where position>pg*100 and position<=pg*100+100 order by position)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(batch) order by position) from batch),'[]'::jsonb),'hasMore',exists(select 1 from numbered where position>pg*100+100),'total',(select count(*) from filtered)) into result;
 return result;
end;$$;
revoke all on function public.astros_social_admin_catalog(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.astros_social_admin_catalog(uuid,jsonb) to service_role;
commit;
