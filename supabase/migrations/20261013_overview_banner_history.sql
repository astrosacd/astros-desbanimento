begin;
create table if not exists public.astros_overview_banners (
 id uuid primary key default gen_random_uuid(),
 message text not null check(length(btrim(message)) between 1 and 500),
 enabled boolean not null default false,
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(ends_at>starts_at)
);
-- Fixed migration ID prevents duplication when this SQL is run again.
insert into public.astros_overview_banners(id,message,enabled,starts_at,ends_at,created_at,updated_at)
select 'efb2ea72-6fe3-4f21-bb4a-e37954a4a08c'::uuid,message,enabled,starts_at,ends_at,updated_at,updated_at
from public.astros_overview_banner where length(btrim(message))>0
on conflict(id) do nothing;
-- The singleton is no longer used; keep no second copy of the imported message.
update public.astros_overview_banner set message='',enabled=false;
alter table public.astros_overview_banners enable row level security;
revoke all on public.astros_overview_banners from anon,authenticated;
grant select,insert,update,delete on public.astros_overview_banners to authenticated;
drop policy if exists astros_banners_read on public.astros_overview_banners;
create policy astros_banners_read on public.astros_overview_banners for select to authenticated using(public.astros_is_admin() or (enabled and starts_at<=now() and ends_at>now()));
drop policy if exists astros_banners_insert on public.astros_overview_banners;
create policy astros_banners_insert on public.astros_overview_banners for insert to authenticated with check(public.astros_is_admin());
drop policy if exists astros_banners_update on public.astros_overview_banners;
create policy astros_banners_update on public.astros_overview_banners for update to authenticated using(public.astros_is_admin()) with check(public.astros_is_admin());
drop policy if exists astros_banners_delete on public.astros_overview_banners;
create policy astros_banners_delete on public.astros_overview_banners for delete to authenticated using(public.astros_is_admin());
create index if not exists astros_banners_created on public.astros_overview_banners(created_at desc,id desc);
commit;
