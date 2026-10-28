begin;
create or replace function public.astros_update_delete(update_id uuid, expected_version integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare saved_version integer;
begin
 if not public.astros_updates_reader() or not public.astros_is_admin() then
  raise exception 'Acesso não autorizado';
 end if;
 if update_id is null or expected_version is null or expected_version<1 then
  raise exception 'Dados inválidos';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('astros-update:'||update_id::text,0));
 select version into saved_version from public.astros_updates where id=update_id for update;
 if not found then return true; end if;
 if saved_version<>expected_version then
  raise exception 'Publicação alterada. Recarregue antes de excluir.';
 end if;
 delete from public.astros_updates where id=update_id;
 return true;
end;
$$;
revoke all on function public.astros_update_delete(uuid,integer) from public,anon;
grant execute on function public.astros_update_delete(uuid,integer) to authenticated;
commit;
