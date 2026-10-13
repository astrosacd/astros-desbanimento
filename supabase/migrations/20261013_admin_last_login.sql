begin;
create or replace function public.astros_admin_last_logins(user_ids uuid[])
returns table(user_id uuid,last_login_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.astros_is_admin() then raise exception 'Acesso administrativo necessário'; end if;
 if user_ids is null or cardinality(user_ids)>10 then raise exception 'Consulta inválida'; end if;
 return query select u.id,u.last_sign_in_at from auth.users u
 inner join public.painel_de_desbanimento p on p.id=u.id
 where u.id=any(user_ids) and p.tipo_usuario in ('admin','cliente');
end $$;
revoke all on function public.astros_admin_last_logins(uuid[]) from public,anon;
grant execute on function public.astros_admin_last_logins(uuid[]) to authenticated;
commit;
