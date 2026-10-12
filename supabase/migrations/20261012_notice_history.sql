-- Histórico de comunicados. Preserva o comunicado existente.
begin;
create table if not exists public.astros_notices (
 id uuid primary key default gen_random_uuid(), title text not null, body text not null,
 button_label text not null default '',button_url text not null default '',image_url text not null default '',
 status text not null default 'draft' check(status in ('draft','published','archived')),
 version uuid not null default gen_random_uuid(),published_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(length(title) between 1 and 120 and length(body) between 1 and 3000),check(length(button_label)<=80 and length(button_url)<=2048 and length(image_url)<=2048),
 check(button_url='' or button_url ~ '^https://[^[:space:]]+$'),check(status<>'published' or published_at is not null)
);
alter table public.astros_notices enable row level security;
revoke all on public.astros_notices from anon,authenticated;
grant select,insert,update on public.astros_notices to authenticated;
create policy astros_notices_read on public.astros_notices for select to authenticated using(status='published' or public.astros_is_admin());
create policy astros_notices_insert on public.astros_notices for insert to authenticated with check(public.astros_is_admin());
create policy astros_notices_update on public.astros_notices for update to authenticated using(public.astros_is_admin()) with check(public.astros_is_admin());
insert into public.astros_notices(id,title,body,button_label,button_url,image_url,status,version,published_at,created_at,updated_at)
select version,title,body,button_label,button_url,image_url,case when enabled then 'published' else 'draft' end,version,case when enabled then updated_at else null end,updated_at,updated_at
from public.astros_client_notice where length(title)>0 and length(body)>0 on conflict(id) do nothing;
create index if not exists astros_notices_timeline on public.astros_notices(status,published_at desc,created_at desc);
commit;
