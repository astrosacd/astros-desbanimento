-- Retira o endereço anterior da configuração ativa. Não altera contas ou saldos.
begin;
alter table public.astros_panel_address drop constraint if exists astros_panel_address_origin_check;
alter table public.astros_panel_address drop constraint if exists astros_panel_address_allowed_origin;
-- Converte apenas endereços retirados; preserva Mais e contingência.
update public.astros_panel_address set origin='https://mais.astroscomunicacaodigital.com',updated_at=now(),updated_by=null
 where origin not in ('https://mais.astroscomunicacaodigital.com','https://desbanimento-de-numeros.lovable.app');
alter table public.astros_panel_address add constraint astros_panel_address_allowed_origin
 check(origin in ('https://mais.astroscomunicacaodigital.com','https://desbanimento-de-numeros.lovable.app'));
create or replace function public.astros_set_panel_address(new_origin text) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.astros_is_admin() then raise exception 'Acesso não autorizado'; end if;
 if new_origin is null or new_origin not in ('https://mais.astroscomunicacaodigital.com','https://desbanimento-de-numeros.lovable.app') then raise exception 'Endereço inválido'; end if;
 update public.astros_panel_address set origin=new_origin,updated_at=now(),updated_by=auth.uid() where id=true;
 if not found then raise exception 'Configuração ausente'; end if;
 return new_origin;
end;
$$;
revoke all on function public.astros_set_panel_address(text) from public,anon;
grant execute on function public.astros_set_panel_address(text) to authenticated;
commit;
