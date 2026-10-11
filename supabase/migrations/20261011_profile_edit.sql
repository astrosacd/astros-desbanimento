-- Atualiza somente o nome da própria conta, em uma transação.
begin;
create or replace function public.astros_update_own_name(new_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare user_id uuid := auth.uid(); clean_name text := btrim(new_name);
begin
 if user_id is null then raise exception 'Acesso não autorizado'; end if;
 if clean_name is null or length(clean_name) < 3 or length(clean_name) > 120 or clean_name !~ '\S+\s+\S+' then
  raise exception 'Informe seu nome completo';
 end if;
 update public.painel_de_desbanimento set nome = clean_name where id = user_id;
 if not found then raise exception 'Perfil não encontrado'; end if;
 update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('nome', clean_name), updated_at = now() where id = user_id;
 if not found then raise exception 'Conta não encontrada'; end if;
end;
$$;
revoke all on function public.astros_update_own_name(text) from public, anon;
grant execute on function public.astros_update_own_name(text) to authenticated;
commit;
