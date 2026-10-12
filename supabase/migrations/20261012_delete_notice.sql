create or replace function public.astros_delete_notice(notice_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare removed uuid;
begin
 if not public.astros_is_admin() then raise exception 'Acesso administrativo não autorizado'; end if;
 delete from public.astros_notices where id=notice_id returning id into removed;
 if removed is null then raise exception 'Comunicado não encontrado'; end if;
 delete from public.astros_client_notice where version=notice_id;
 return true;
end;
$$;
revoke all on function public.astros_delete_notice(uuid) from public,anon;
grant execute on function public.astros_delete_notice(uuid) to authenticated;
