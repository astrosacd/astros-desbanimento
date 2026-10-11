-- Dedicated mail limits. No changes to shared Auth/SMTP settings.
begin;
create table if not exists public.astros_email_limits (
 bucket text primary key,
 window_start timestamptz not null,
 attempts integer not null
);
alter table public.astros_email_limits enable row level security;
revoke all on public.astros_email_limits from public, anon, authenticated;
create or replace function public.astros_mail_allow(recipient_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare counter integer; instant timestamptz := now();
begin
 if recipient_hash !~ '^[0-9a-f]{64}$' then return false; end if;
 -- Serialize all sends: deployment instances share the same limit.
 perform pg_advisory_xact_lock(7711049);
 delete from public.astros_email_limits where window_start < instant - interval '2 hours';
 insert into public.astros_email_limits values ('global', instant, 1)
 on conflict (bucket) do update set
 attempts = case when astros_email_limits.window_start < instant - interval '1 hour' then 1 else astros_email_limits.attempts + 1 end,
 window_start = case when astros_email_limits.window_start < instant - interval '1 hour' then instant else astros_email_limits.window_start end
 returning attempts into counter;
 if counter > 60 then return false; end if;
 insert into public.astros_email_limits values (recipient_hash, instant, 1)
 on conflict (bucket) do update set
 attempts = case when astros_email_limits.window_start < instant - interval '1 hour' then 1 else astros_email_limits.attempts + 1 end,
 window_start = case when astros_email_limits.window_start < instant - interval '1 hour' then instant else astros_email_limits.window_start end
 returning attempts into counter;
 return counter <= 3;
end;
$$;
revoke all on function public.astros_mail_allow(text) from public, anon, authenticated;
grant execute on function public.astros_mail_allow(text) to service_role;
commit;
