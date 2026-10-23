-- Install inactive. Activate only after Edge, both frontends are ready.
begin;
create table if not exists public.astros_signup_settings (
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 site_key text not null default '',
 ip_salt text not null default encode(extensions.gen_random_bytes(32),'hex'),
 check(not enabled or (length(site_key) between 10 and 100))
);
insert into public.astros_signup_settings(id) values(true) on conflict do nothing;
create table if not exists public.astros_signup_attempts (
 ip_hash text not null,
 attempted_at timestamptz not null default clock_timestamp()
);
create index if not exists astros_signup_attempts_ip_time on public.astros_signup_attempts(ip_hash,attempted_at);
create index if not exists astros_signup_attempts_time on public.astros_signup_attempts(attempted_at);
create table if not exists public.astros_signup_permits (
 token_hash text primary key,
 email_hash text not null,
 expires_at timestamptz not null,
 consumed_at timestamptz
);
alter table public.astros_signup_settings enable row level security;
alter table public.astros_signup_attempts enable row level security;
alter table public.astros_signup_permits enable row level security;
revoke all on public.astros_signup_settings,public.astros_signup_attempts,public.astros_signup_permits from public,anon,authenticated;

create or replace function public.astros_signup_public_config() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',enabled,'siteKey',case when enabled then site_key else '' end)
 from public.astros_signup_settings where id;
$$;
revoke all on function public.astros_signup_public_config() from public;
grant execute on function public.astros_signup_public_config() to anon,authenticated,service_role;

-- Gateway-derived IP only; raw addresses are never persisted. Group IPv6 by /64.
create or replace function public.astros_signup_allow_ip(p_ip inet) returns boolean
language plpgsql security definer set search_path='' as $$
declare s public.astros_signup_settings; h text; recent integer; hourly integer; n timestamptz:=clock_timestamp();
begin
 select * into strict s from public.astros_signup_settings where id;
 if not s.enabled then return false; end if;
 if p_ip is null then return false; end if;
 h:=encode(extensions.hmac(case when family(p_ip)=6 then network(set_masklen(p_ip,64))::text else host(p_ip) end,s.ip_salt,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(h,7711050));
 delete from public.astros_signup_attempts where attempted_at<n-interval '1 hour';
 delete from public.astros_signup_permits where expires_at<n-interval '1 hour';
 select count(*) filter(where attempted_at>n-interval '15 minutes'),count(*) into recent,hourly
 from public.astros_signup_attempts where ip_hash=h and attempted_at>n-interval '1 hour';
 if recent>=5 or hourly>=20 then return false; end if;
 insert into public.astros_signup_attempts(ip_hash,attempted_at) values(h,n);
 return true;
end;
$$;
revoke all on function public.astros_signup_allow_ip(inet) from public,anon,authenticated;
grant execute on function public.astros_signup_allow_ip(inet) to service_role;

create or replace function public.astros_signup_issue_permit(p_token_hash text,p_email text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if (select enabled from public.astros_signup_settings where id) is distinct from true then return false; end if;
 if p_token_hash !~ '^[0-9a-f]{64}$' or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then return false; end if;
 insert into public.astros_signup_permits(token_hash,email_hash,expires_at)
 values(p_token_hash,encode(extensions.digest(lower(trim(p_email)),'sha256'),'hex'),clock_timestamp()+interval '5 minutes');
 return true;
end;
$$;
revoke all on function public.astros_signup_issue_permit(text,text) from public,anon,authenticated;
grant execute on function public.astros_signup_issue_permit(text,text) to service_role;

-- Public proof check reveals only validity of an unguessable token, never private rows.
-- Non-consuming: the Auth insert below is the final atomic authority.
create or replace function public.astros_signup_validate_permit(p_permit text,p_email text) returns boolean
language sql stable security definer set search_path='' as $$
 select p_permit ~ '^[0-9a-f]{64}$' and exists (
  select 1 from public.astros_signup_permits
  where token_hash=encode(extensions.digest(p_permit,'sha256'),'hex')
   and email_hash=encode(extensions.digest(lower(trim(p_email)),'sha256'),'hex')
   and expires_at>now() and consumed_at is null
 );
$$;
revoke all on function public.astros_signup_validate_permit(text,text) from public;
grant execute on function public.astros_signup_validate_permit(text,text) to anon,authenticated,service_role;

-- BEFORE INSERT covers public Auth signup AND admin.createUser used by the private mailer.
-- Existing-account login, recovery and profile updates do not insert Auth users.
create or replace function public.astros_guard_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
declare ticket text:=new.raw_user_meta_data->>'astros_signup_permit';
 signup_email text:=lower(trim(new.email)); matched text;
 import_id text:=new.raw_app_meta_data->>'astros_legacy_import';
begin
 if (select enabled from public.astros_signup_settings where id) is false then return new; end if;
 -- Preserve only a real pending import authorized by the existing admin import workflow.
 if import_id is not null and exists (
  select 1 from public.astros_legacy_client_imports j
  join public.painel_de_desbanimento p on p.id=j.admin_id
  where j.id::text=import_id and j.email=signup_email and j.state='pending' and p.tipo_usuario='admin'
 ) then return new; end if;
 if ticket ~ '^[0-9a-f]{64}$' then
  update public.astros_signup_permits set consumed_at=clock_timestamp()
  where token_hash=encode(extensions.digest(ticket,'sha256'),'hex')
   and email_hash=encode(extensions.digest(signup_email,'sha256'),'hex')
   and expires_at>clock_timestamp() and consumed_at is null
  returning token_hash into matched;
  if matched is not null then
   new.raw_user_meta_data:=new.raw_user_meta_data-'astros_signup_permit';
   return new;
  end if;
 end if;
 raise exception 'Confirme a verificação de segurança na página de cadastro e tente novamente.' using errcode='P0001';
end;
$$;
revoke all on function public.astros_guard_new_user() from public,anon,authenticated,service_role;
drop trigger if exists astros_signup_protection on auth.users;
create trigger astros_signup_protection before insert on auth.users
 for each row execute function public.astros_guard_new_user();
commit;
