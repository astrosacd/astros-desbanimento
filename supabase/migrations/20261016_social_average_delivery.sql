begin;
alter table public.astros_social_services add column if not exists customer_average_time text not null default '' check(length(customer_average_time)<=120);
create or replace function public.astros_social_present_details(actor uuid,service bigint,active boolean,platform text,label text,customer_text text,category text,average_text text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 if average_text is null or length(average_text)>120 then raise exception 'Confira os campos';end if;
 perform public.astros_social_present(actor,service,active,platform,label,customer_text,category);
 update public.astros_social_services set customer_average_time=trim(average_text),updated_at=clock_timestamp() where id=service;
end;$$;
revoke all on function public.astros_social_present_details(uuid,bigint,boolean,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.astros_social_present_details(uuid,bigint,boolean,text,text,text,text,text) to service_role;
commit;
