begin;
create table if not exists public.astros_panel_address (
 id boolean primary key default true check(id),
 origin text not null check(origin in ('https://desbanimento.astroscomunicacaodigital.com','https://desbanimento-de-numeros.lovable.app')),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null
);
-- Preserve current mail destination until the administrator explicitly switches.
insert into public.astros_panel_address(id,origin) values(true,'https://desbanimento-de-numeros.lovable.app') on conflict(id) do nothing;
alter table public.astros_panel_address enable row level security;
revoke all on public.astros_panel_address from anon,authenticated;
grant select(origin,updated_at,id) on public.astros_panel_address to authenticated;
grant select on public.astros_panel_address to service_role;
drop policy if exists astros_panel_address_admin_read on public.astros_panel_address;
create policy astros_panel_address_admin_read on public.astros_panel_address for select to authenticated using(public.astros_is_admin());
create or replace function public.astros_set_panel_address(new_origin text) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.astros_is_admin() then raise exception 'Acesso não autorizado'; end if;
 if new_origin is null or new_origin not in ('https://desbanimento.astroscomunicacaodigital.com','https://desbanimento-de-numeros.lovable.app') then raise exception 'Endereço inválido'; end if;
 update public.astros_panel_address set origin=new_origin,updated_at=now(),updated_by=auth.uid() where id=true;
 if not found then raise exception 'Configuração ausente'; end if;
 return new_origin;
end;
$$;
revoke all on function public.astros_set_panel_address(text) from public,anon;
grant execute on function public.astros_set_panel_address(text) to authenticated;
commit;
