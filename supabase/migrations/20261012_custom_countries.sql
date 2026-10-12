begin;
create table if not exists public.astros_custom_countries (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(btrim(name)) between 2 and 80),
 ddi text not null check(ddi ~ '^[1-9][0-9]{0,2}$' and ddi<>'55'),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index if not exists astros_custom_country_name on public.astros_custom_countries(lower(btrim(name)));
alter table public.astros_custom_countries enable row level security;
revoke all on public.astros_custom_countries from anon;
grant select,insert,update,delete on public.astros_custom_countries to authenticated;
grant all on public.astros_custom_countries to service_role;
create policy astros_countries_read on public.astros_custom_countries for select to authenticated using(true);
create policy astros_countries_insert on public.astros_custom_countries for insert to authenticated with check(public.astros_is_admin());
create policy astros_countries_update on public.astros_custom_countries for update to authenticated using(public.astros_is_admin()) with check(public.astros_is_admin());
create policy astros_countries_delete on public.astros_custom_countries for delete to authenticated using(public.astros_is_admin());
commit;
