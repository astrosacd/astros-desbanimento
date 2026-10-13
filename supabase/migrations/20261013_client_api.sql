begin;
create table if not exists public.astros_client_api_access (
 user_id uuid primary key references public.painel_de_desbanimento(id), enabled boolean not null default false,
 key_hash text check(key_hash is null or key_hash ~ '^[0-9a-f]{64}$'), key_created_at timestamptz,
 changed_by uuid references public.painel_de_desbanimento(id), changed_at timestamptz not null default now(),
 rate_window timestamptz, rate_count integer not null default 0
);
alter table public.astros_client_api_access enable row level security;
revoke all on public.astros_client_api_access from public,anon,authenticated;
grant all on public.astros_client_api_access to service_role;
create unique index if not exists astros_client_api_key_unique on public.astros_client_api_access(key_hash) where key_hash is not null;
create or replace function public.astros_api_status(target_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid:=coalesce(target_id,auth.uid()); a public.astros_client_api_access;
begin
 if auth.uid() is null or (target<>auth.uid() and not public.astros_is_admin()) then raise exception 'Acesso não autorizado'; end if;
 select * into a from public.astros_client_api_access where user_id=target;
 return jsonb_build_object('enabled',coalesce(a.enabled,false),'hasKey',a.key_hash is not null,'keyCreatedAt',a.key_created_at);
end $$;
create or replace function public.astros_api_permission(target_id uuid,allow_access boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.astros_is_admin() then raise exception 'Acesso administrativo necessário'; end if;
 if allow_access is null or not exists(select 1 from public.painel_de_desbanimento where id=target_id and tipo_usuario in ('admin','cliente')) then raise exception 'Conta não encontrada'; end if;
 insert into public.astros_client_api_access(user_id,enabled,changed_by) values(target_id,allow_access,auth.uid())
 on conflict(user_id) do update set enabled=excluded.enabled,key_hash=case when excluded.enabled then astros_client_api_access.key_hash else null end,key_created_at=case when excluded.enabled then astros_client_api_access.key_created_at else null end,changed_by=auth.uid(),changed_at=now();
 return public.astros_api_status(target_id);
end $$;
create or replace function public.astros_api_set_key(new_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Confirme seu e-mail'; end if;
 if new_hash is not null and new_hash !~ '^[0-9a-f]{64}$' then raise exception 'Chave inválida'; end if;
 update public.astros_client_api_access set key_hash=new_hash,key_created_at=case when new_hash is null then null else now() end where user_id=auth.uid() and enabled;
 if not found then raise exception 'API não liberada'; end if;
 return public.astros_api_status();
end $$;
create or replace function public.astros_api_authenticate(token_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.astros_client_api_access; u auth.users; window_start timestamptz:=date_trunc('minute',now());
begin
 select * into a from public.astros_client_api_access where key_hash=token_hash and enabled for update;
 if not found then return jsonb_build_object('error','unauthorized'); end if;
 select * into u from auth.users where id=a.user_id and email_confirmed_at is not null and (banned_until is null or banned_until<=now());
 if not found or not exists(select 1 from public.painel_de_desbanimento where id=a.user_id and tipo_usuario in ('admin','cliente')) then return jsonb_build_object('error','unauthorized'); end if;
 if a.rate_window=window_start and a.rate_count>=60 then return jsonb_build_object('error','rate_limit'); end if;
 update public.astros_client_api_access set rate_window=window_start,rate_count=case when a.rate_window=window_start then a.rate_count+1 else 1 end where user_id=a.user_id;
 return jsonb_build_object('id',u.id,'email',u.email,'email_confirmed_at',u.email_confirmed_at);
end $$;
revoke all on function public.astros_api_status(uuid),public.astros_api_permission(uuid,boolean),public.astros_api_set_key(text) from public,anon;
grant execute on function public.astros_api_status(uuid),public.astros_api_permission(uuid,boolean),public.astros_api_set_key(text) to authenticated;
revoke all on function public.astros_api_authenticate(text) from public,anon,authenticated;
grant execute on function public.astros_api_authenticate(text) to service_role;
commit;
