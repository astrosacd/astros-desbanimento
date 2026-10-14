begin;
create table if not exists public.astros_admin_password_resets (
 id uuid primary key, user_id uuid not null references auth.users(id),
 admin_id uuid not null references public.painel_de_desbanimento(id),
 reason text not null check(length(btrim(reason)) between 3 and 300),
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 state text not null default 'processing' check(state in ('processing','awaiting_change','completed','failed','superseded')),
 created_at timestamptz not null default now(), changed_at timestamptz
);
create unique index if not exists astros_password_one_pending on public.astros_admin_password_resets(user_id) where state='processing';
alter table public.astros_admin_password_resets enable row level security;
revoke all on public.astros_admin_password_resets from public,anon,authenticated;
grant select(id,user_id,admin_id,reason,state,created_at,changed_at) on public.astros_admin_password_resets to authenticated;
create policy astros_password_admin_read on public.astros_admin_password_resets for select to authenticated using(public.astros_is_admin());
create or replace function public.astros_begin_admin_password_reset(actor uuid,target uuid,request_id uuid,request_fingerprint text,description text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare entry public.astros_admin_password_resets; target_email text;
begin
 if not exists(select 1 from public.painel_de_desbanimento p join auth.users u on p.id=u.id where p.id=actor and p.tipo_usuario='admin' and u.email_confirmed_at is not null) then raise exception 'Acesso administrativo necessário'; end if;
 if actor=target or request_id is null or request_fingerprint is null or request_fingerprint!~'^[0-9a-f]{64}$' or description is null or length(btrim(description)) not between 3 and 300 then raise exception 'Dados inválidos'; end if;
 select u.email into target_email from auth.users u join public.painel_de_desbanimento p on p.id=u.id where u.id=target and p.tipo_usuario='cliente' and u.email_confirmed_at is not null and lower(u.email)=lower(p.email) for update of p;
 if not found then raise exception 'Selecione um cliente confirmado'; end if;
 select * into entry from public.astros_admin_password_resets where id=request_id;
 if found then
  if entry.user_id<>target or entry.admin_id<>actor or entry.fingerprint<>request_fingerprint or entry.reason<>btrim(description) then raise exception 'Referência divergente'; end if;
  return jsonb_build_object('execute',false,'state',entry.state);
 end if;
 if exists(select 1 from public.astros_admin_password_resets where user_id=target and state='processing') then raise exception 'Existe uma alteração em conferência'; end if;
 insert into public.astros_admin_password_resets(id,user_id,admin_id,reason,fingerprint) values(request_id,target,actor,btrim(description),request_fingerprint);
 return jsonb_build_object('execute',true,'state','processing');
end $$;
create or replace function public.astros_finish_admin_password_reset(actor uuid,request_id uuid,rejected boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare entry public.astros_admin_password_resets; identity auth.users;
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso administrativo necessário'; end if;
 select * into entry from public.astros_admin_password_resets where id=request_id for update;
 if not found or entry.admin_id<>actor then raise exception 'Referência inválida'; end if;
 if entry.state in ('awaiting_change','completed','failed','superseded') then return jsonb_build_object('state',entry.state); end if;
 select * into identity from auth.users where id=entry.user_id;
 if identity.raw_app_meta_data->>'astros_password_reset_id'=entry.id::text then
  update public.astros_admin_password_resets set state='superseded' where user_id=entry.user_id and id<>entry.id and state='awaiting_change';
  update public.astros_admin_password_resets set state=case when identity.raw_app_meta_data->>'astros_password_change_required'='true' then 'awaiting_change' else 'completed' end where id=entry.id returning * into entry;
 elsif rejected then
  update public.astros_admin_password_resets set state='failed' where id=entry.id returning * into entry;
 end if;
 return jsonb_build_object('state',entry.state);
end $$;
revoke all on function public.astros_begin_admin_password_reset(uuid,uuid,uuid,text,text),public.astros_finish_admin_password_reset(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.astros_begin_admin_password_reset(uuid,uuid,uuid,text,text),public.astros_finish_admin_password_reset(uuid,uuid,boolean) to service_role;
-- Auth Admin commits password then metadata in the same transaction. Pending
-- jobs distinguish an administrative replacement from a later customer change, which clears
-- the service-owned flag; updating editable user_metadata cannot clear it.
create or replace function public.astros_clear_temporary_password() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.encrypted_password is distinct from new.encrypted_password
 and old.raw_app_meta_data->>'astros_password_change_required'='true'
 and new.raw_app_meta_data->>'astros_password_reset_id'=old.raw_app_meta_data->>'astros_password_reset_id'
 and not exists(select 1 from public.astros_admin_password_resets where user_id=old.id and state='processing' and id::text is distinct from old.raw_app_meta_data->>'astros_password_reset_id') then
  new.raw_app_meta_data:=jsonb_set(new.raw_app_meta_data,'{astros_password_change_required}','false'::jsonb);
  update public.astros_admin_password_resets set state='completed',changed_at=now() where id::text=old.raw_app_meta_data->>'astros_password_reset_id' and user_id=old.id and state in ('processing','awaiting_change');
 end if;
 return new;
end $$;
revoke all on function public.astros_clear_temporary_password() from public,anon,authenticated;
create trigger astros_password_change_gate before update of encrypted_password on auth.users for each row execute function public.astros_clear_temporary_password();

-- Client API waits for the mandatory password change too.
create or replace function public.astros_api_authenticate(token_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.astros_client_api_access; u auth.users; window_start timestamptz:=date_trunc('minute',now());
begin
 select * into a from public.astros_client_api_access where key_hash=token_hash and enabled for update;
 if not found then return jsonb_build_object('error','unauthorized'); end if;
 select * into u from auth.users where id=a.user_id and email_confirmed_at is not null and (banned_until is null or banned_until<=now());
 if not found or u.raw_app_meta_data->>'astros_password_change_required'='true' or not exists(select 1 from public.painel_de_desbanimento where id=a.user_id and tipo_usuario in ('admin','cliente')) then return jsonb_build_object('error','unauthorized'); end if;
 if a.rate_window=window_start and a.rate_count>=60 then return jsonb_build_object('error','rate_limit'); end if;
 update public.astros_client_api_access set rate_window=window_start,rate_count=case when a.rate_window=window_start then a.rate_count+1 else 1 end where user_id=a.user_id;
 return jsonb_build_object('id',u.id,'email',u.email,'email_confirmed_at',u.email_confirmed_at);
end $$;
commit;
