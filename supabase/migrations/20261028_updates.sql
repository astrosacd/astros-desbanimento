begin;
create table if not exists public.astros_updates (
 id uuid primary key,
 title text not null check (char_length(btrim(title)) between 3 and 160),
 summary text not null check (char_length(btrim(summary)) between 3 and 400),
 body text not null check (char_length(btrim(body)) between 3 and 12000),
 category text not null check(category in ('new','improvement','fix')),
 status text not null default 'draft' check(status in ('draft','published','archived')),
 version integer not null default 1 check(version>0),
 published_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(status<>'published' or published_at is not null)
);
create index if not exists astros_updates_published on public.astros_updates(published_at desc,id desc) where status='published';
alter table public.astros_updates enable row level security;
revoke all on public.astros_updates from anon,authenticated;
grant select on public.astros_updates to authenticated;
create or replace function public.astros_updates_reader() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and (banned_until is null or banned_until<now()) and coalesce(raw_app_meta_data->>'astros_password_change_required','false')<>'true');
$$;
revoke all on function public.astros_updates_reader() from public,anon;
grant execute on function public.astros_updates_reader() to authenticated;
drop policy if exists astros_updates_read on public.astros_updates;
create policy astros_updates_read on public.astros_updates for select to authenticated using(public.astros_updates_reader() and (status='published' or public.astros_is_admin()));
create or replace function public.astros_update_save(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_row public.astros_updates; next_version integer; target uuid:=(payload->>'id')::uuid; expected integer:=(payload->>'version')::integer;
begin
 if not public.astros_updates_reader() or not public.astros_is_admin() then raise exception 'Acesso não autorizado'; end if;
 if jsonb_typeof(payload)<>'object' or target is null or expected is null or expected<0 then raise exception 'Dados inválidos'; end if;
 perform pg_advisory_xact_lock(hashtextextended('astros-update:'||target::text,0));
 select * into current_row from public.astros_updates where id=target for update;
 if found then
  if current_row.version<>expected then raise exception 'Publicação alterada. Recarregue.'; end if;
  update public.astros_updates set title=btrim(payload->>'title'),summary=btrim(payload->>'summary'),body=btrim(payload->>'body'),category=payload->>'category',status=payload->>'status',version=version+1,updated_at=now(),published_at=case when payload->>'status'='published' then coalesce(published_at,now()) else published_at end where id=target returning version into next_version;
 else
  if expected<>0 then raise exception 'Publicação não encontrada'; end if;
  insert into public.astros_updates(id,title,summary,body,category,status,published_at) values(target,btrim(payload->>'title'),btrim(payload->>'summary'),btrim(payload->>'body'),payload->>'category',payload->>'status',case when payload->>'status'='published' then now() end) returning version into next_version;
 end if;
 return jsonb_build_object('id',target,'version',next_version);
end; $$;
revoke all on function public.astros_update_save(jsonb) from public,anon;
grant execute on function public.astros_update_save(jsonb) to authenticated;
commit;
