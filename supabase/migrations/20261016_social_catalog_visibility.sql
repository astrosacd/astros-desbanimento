-- Visibilidade do catálogo: sem alterar carteira, preços, pedidos ou disponibilidade global.
begin;
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
 if active and exists(select 1 from public.astros_social_services where id=any(services) and (network not in ('instagram','facebook','youtube','tiktok','x','telegram') or length(trim(title))<3)) then raise exception 'Configure a rede e o nome dos serviços antes de liberar';end if;
 update public.astros_social_services set enabled=active,updated_at=clock_timestamp() where id=any(services) and enabled is distinct from active;
 return n;
end;$$;
revoke all on function public.astros_social_visibility(uuid,bigint[],boolean) from public,anon,authenticated;
grant execute on function public.astros_social_visibility(uuid,bigint[],boolean) to service_role;
commit;
