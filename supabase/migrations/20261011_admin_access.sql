-- Execute uma vez no SQL Editor do seu Supabase. Reutiliza a tabela existente.
-- A transação cancela tudo se houver perfis sem um usuário correspondente no Auth.
begin;
alter table public.painel_de_desbanimento alter column tipo_usuario set default 'cliente';
alter table public.painel_de_desbanimento alter column tipo_usuario set not null;
alter table public.painel_de_desbanimento alter column senha_hash drop not null;
alter table public.painel_de_desbanimento add constraint astros_tipo_usuario_check check (tipo_usuario in ('admin', 'cliente'));
alter table public.painel_de_desbanimento add constraint astros_auth_user_fk foreign key (id) references auth.users(id) on delete cascade;

create or replace function public.astros_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.painel_de_desbanimento where id = auth.uid() and tipo_usuario = 'admin');
$$;
revoke all on function public.astros_is_admin() from public;
grant execute on function public.astros_is_admin() to authenticated;

-- Não aceita o tipo de usuário fornecido pelo cadastro ou pelos metadados.
create or replace function public.astros_create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.painel_de_desbanimento (id, tipo_usuario, nome, email, cpfcnpj, whatsapp, data_do_cadastro, recarga)
 values (new.id, 'cliente', coalesce(new.raw_user_meta_data->>'nome', ''), new.email,
 coalesce(new.raw_user_meta_data->>'cpfcnpj', ''), coalesce(new.raw_user_meta_data->>'whatsapp', ''), now(), 0);
 return new;
end;
$$;
revoke all on function public.astros_create_profile() from public;
create trigger astros_profile_after_signup after insert on auth.users for each row execute function public.astros_create_profile();

-- Protege o papel mesmo se existirem permissões de colunas ou políticas antigas.
create or replace function public.astros_protect_role() returns trigger
language plpgsql set search_path = '' as $$
begin
 if current_user in ('anon', 'authenticated') then
   if TG_OP = 'INSERT' or new.tipo_usuario is distinct from old.tipo_usuario or new.id is distinct from old.id then
     raise exception 'O tipo de usuário só pode ser definido por uma operação administrativa confiável.';
   end if;
 end if;
 return new;
end;
$$;
create trigger astros_protect_profile_role before insert or update on public.painel_de_desbanimento for each row execute function public.astros_protect_role();
alter table public.painel_de_desbanimento enable row level security;
revoke all on public.painel_de_desbanimento from anon, authenticated;
grant select (id, tipo_usuario, nome, cpfcnpj, email, whatsapp, data_do_cadastro, ultimo_login, recarga) on public.painel_de_desbanimento to authenticated;
create policy astros_profile_read on public.painel_de_desbanimento for select to authenticated using (id = auth.uid() or public.astros_is_admin());
create policy astros_profile_read_boundary on public.painel_de_desbanimento as restrictive for select to authenticated using (id = auth.uid() or public.astros_is_admin());
commit;
