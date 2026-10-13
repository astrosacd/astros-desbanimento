begin;
create table if not exists public.astros_overview_banner (
 id boolean primary key default true check(id),
 message text not null default '' check(length(message)<=500),
 enabled boolean not null default false,
 starts_at timestamptz not null default now(),
 ends_at timestamptz not null default (now()+interval '1 day'),
 updated_at timestamptz not null default now(),
 check(ends_at>starts_at),
 check(not enabled or length(btrim(message))>0)
);
insert into public.astros_overview_banner(id) values(true) on conflict do nothing;
alter table public.astros_overview_banner enable row level security;
revoke all on public.astros_overview_banner from anon,authenticated;
grant select,update on public.astros_overview_banner to authenticated;
drop policy if exists astros_banner_read on public.astros_overview_banner;
create policy astros_banner_read on public.astros_overview_banner for select to authenticated using(public.astros_is_admin() or (enabled and starts_at<=now() and ends_at>now()));
drop policy if exists astros_banner_update on public.astros_overview_banner;
create policy astros_banner_update on public.astros_overview_banner for update to authenticated using(public.astros_is_admin()) with check(public.astros_is_admin());
commit;
