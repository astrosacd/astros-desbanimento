-- Presentation only: preserve original supplier fields, prices, wallet and orders.
begin;
alter table public.astros_social_services drop constraint if exists astros_social_services_category_code_check;
alter table public.astros_social_services add constraint astros_social_services_category_code_check check(
 category_code in ('','followers','likes','views','comments','shares','subscribers','other') or
 (left(category_code,7)='custom:' and substring(category_code from 8) ~ '^[[:alnum:]][[:alnum:] .,&()/_+-]{0,79}$')
);
create or replace function public.astros_social_present(actor uuid,service bigint,active boolean,platform text,label text,customer_text text,category text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 if customer_text is null or length(customer_text)>4000 or category is null or not (
 category in ('followers','likes','views','comments','shares','subscribers','other') or
 (left(category,7)='custom:' and substring(category from 8) ~ '^[[:alnum:]][[:alnum:] .,&()/_+-]{0,79}$')
 ) then raise exception 'Confira os campos';end if;
 -- Canonicalize repeated custom names without modifying original supplier metadata.
 if left(category,7)='custom:' then
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lower(category),0));
 select coalesce((select c.category_code from public.astros_social_services c where lower(c.category_code)=lower(category) order by c.id limit 1),category) into category;
 end if;
 perform public.astros_social_curate(actor,service,active,platform,label);
 update public.astros_social_services set manual_visibility=true,auto_classified=false,customer_description=trim(customer_text),category_code=category,needs_review=false,updated_at=clock_timestamp() where id=service;
end;$$;
revoke all on function public.astros_social_present(uuid,bigint,boolean,text,text,text,text) from public,anon,authenticated;
grant execute on function public.astros_social_present(uuid,bigint,boolean,text,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
