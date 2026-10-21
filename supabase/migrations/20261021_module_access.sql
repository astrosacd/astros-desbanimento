begin;
-- Additive controls. Existing service settings, balances and accepted jobs are untouched.
create table if not exists public.astros_module_settings (
 module text primary key check(module in ('desbanimento','sms','social','prospecting')),
 enabled boolean not null default true,
 message text not null default '' check(length(message)<=300),
 updated_at timestamptz not null default now()
);
insert into public.astros_module_settings(module) values ('desbanimento'),('sms'),('social'),('prospecting') on conflict do nothing;
create table if not exists public.astros_module_clients (
 user_id uuid not null references public.painel_de_desbanimento(id) on delete cascade,
 module text not null references public.astros_module_settings(module),
 enabled boolean not null default true,
 updated_at timestamptz not null default now(),
 primary key(user_id,module)
);
create table if not exists public.astros_module_audit (
 id uuid primary key default gen_random_uuid(),actor uuid not null,target uuid,
 module text not null,enabled boolean not null,message text not null default '',created_at timestamptz not null default now()
);
alter table public.astros_module_settings enable row level security;
alter table public.astros_module_clients enable row level security;
alter table public.astros_module_audit enable row level security;
revoke all on public.astros_module_settings,public.astros_module_clients,public.astros_module_audit from public,anon,authenticated;
grant all on public.astros_module_settings,public.astros_module_clients,public.astros_module_audit to service_role;

-- Own access only. The administrative projection uses a separate authenticated RPC.
create or replace function public.astros_my_modules() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Entre novamente para continuar.'; end if;
 return (select jsonb_agg(jsonb_build_object('module',s.module,'globalEnabled',s.enabled,'clientEnabled',coalesce(c.enabled,true),'enabled',s.enabled and coalesce(c.enabled,true),'message',case when not s.enabled then coalesce(nullif(s.message,''),'Este módulo está em manutenção. Novas operações estão temporariamente indisponíveis.') when c.enabled=false then 'Este módulo não está liberado para sua conta. Fale com o suporte.' else '' end) order by s.module)
 from public.astros_module_settings s left join public.astros_module_clients c on c.module=s.module and c.user_id=auth.uid());
end; $$;
create or replace function public.astros_admin_modules(target_user uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.astros_is_admin() then raise exception 'Acesso administrativo não autorizado.'; end if;
 if target_user is not null and not exists(select 1 from public.painel_de_desbanimento where id=target_user) then raise exception 'Conta não encontrada.'; end if;
 return (select jsonb_agg(jsonb_build_object('module',s.module,'globalEnabled',s.enabled,'clientEnabled',coalesce(c.enabled,true),'enabled',s.enabled and coalesce(c.enabled,true),'message',s.message) order by s.module)
 from public.astros_module_settings s left join public.astros_module_clients c on c.module=s.module and c.user_id=target_user);
end; $$;
create or replace function public.astros_save_module(module_key text,active boolean,target_user uuid default null,notice text default '') returns void
language plpgsql security definer set search_path='' as $$
declare previous boolean; old_message text; clean_notice text:=btrim(coalesce(notice,''));
begin
 if not public.astros_is_admin() then raise exception 'Acesso administrativo não autorizado.'; end if;
 if module_key is null or module_key not in ('desbanimento','sms','social','prospecting') or active is null or length(clean_notice)>300 then raise exception 'Configuração de módulo inválida.'; end if;
 if target_user is null then
  select enabled,message into previous,old_message from public.astros_module_settings where module=module_key for update;
  if previous=active and old_message=clean_notice then return; end if;
  update public.astros_module_settings set enabled=active,message=clean_notice,updated_at=now() where module=module_key;
 else
  -- Match the insertion guard lock order, including the default-allow missing row.
  perform 1 from public.astros_module_settings where module=module_key for share;
  perform pg_advisory_xact_lock(hashtextextended('astros-module:'||module_key||':'||target_user::text,0));
  if not exists(select 1 from public.painel_de_desbanimento where id=target_user and tipo_usuario='cliente') then raise exception 'Selecione uma conta de cliente.'; end if;
  select enabled into previous from public.astros_module_clients where user_id=target_user and module=module_key;
  if coalesce(previous,true)=active then return; end if;
  insert into public.astros_module_clients(user_id,module,enabled) values(target_user,module_key,active)
  on conflict(user_id,module) do update set enabled=excluded.enabled,updated_at=now();
 end if;
 insert into public.astros_module_audit(actor,target,module,enabled,message) values(auth.uid(),target_user,module_key,active,case when target_user is null then clean_notice else '' end);
end; $$;

-- Fixed service-only preflight, never authority from a browser-supplied owner.
create or replace function public.astros_module_access(actor uuid,module_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.astros_module_settings; allowed boolean;
begin
 if actor is null or not exists(select 1 from public.painel_de_desbanimento where id=actor) then raise exception 'Conta não encontrada.'; end if;
 select * into s from public.astros_module_settings where module=module_key;
 if not found then raise exception 'Configuração de módulo indisponível.'; end if;
 select enabled into allowed from public.astros_module_clients where user_id=actor and module=module_key;
 return jsonb_build_object('enabled',s.enabled and coalesce(allowed,true),'message',case when not s.enabled then coalesce(nullif(s.message,''),'Este módulo está em manutenção. Novas operações estão temporariamente indisponíveis.') when allowed=false then 'Este módulo não está liberado para sua conta. Fale com o suporte.' else '' end);
end; $$;
create or replace function public.astros_guard_new_module_operation() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.astros_module_settings; allowed boolean; m text:=tg_argv[0];
begin
 select * into s from public.astros_module_settings where module=m for share;
 if not found then raise exception 'Configuração de módulo indisponível.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('astros-module:'||m||':'||new.user_id::text,0));
 select enabled into allowed from public.astros_module_clients where user_id=new.user_id and module=m;
 if not s.enabled then raise exception 'Este módulo está em manutenção. Novas operações estão temporariamente indisponíveis.'; end if;
 if allowed=false then raise exception 'Este módulo não está liberado para sua conta. Fale com o suporte.'; end if;
 return new;
end; $$;
drop trigger if exists astros_module_guard on public.astros_sms_quotes;
create trigger astros_module_guard before insert on public.astros_sms_quotes for each row execute function public.astros_guard_new_module_operation('sms');
drop trigger if exists astros_module_guard on public.astros_social_quotes;
create trigger astros_module_guard before insert on public.astros_social_quotes for each row execute function public.astros_guard_new_module_operation('social');
-- No UPDATE trigger: accepted requests, queues, settlement and reconciliation continue.
drop trigger if exists astros_module_guard on public.astros_service_jobs;
create trigger astros_module_guard before insert on public.astros_service_jobs for each row execute function public.astros_guard_new_module_operation('desbanimento');
drop trigger if exists astros_module_guard on public.astros_sms_orders;
create trigger astros_module_guard before insert on public.astros_sms_orders for each row execute function public.astros_guard_new_module_operation('sms');
drop trigger if exists astros_module_guard on public.astros_social_orders;
create trigger astros_module_guard before insert on public.astros_social_orders for each row execute function public.astros_guard_new_module_operation('social');
drop trigger if exists astros_module_guard on public.astros_prospect_requests;
create trigger astros_module_guard before insert on public.astros_prospect_requests for each row execute function public.astros_guard_new_module_operation('prospecting');
drop trigger if exists astros_module_guard on public.astros_cnpj_requests;
create trigger astros_module_guard before insert on public.astros_cnpj_requests for each row execute function public.astros_guard_new_module_operation('prospecting');
revoke all on function public.astros_my_modules(),public.astros_admin_modules(uuid),public.astros_save_module(text,boolean,uuid,text),public.astros_module_access(uuid,text),public.astros_guard_new_module_operation() from public,anon,authenticated;
grant execute on function public.astros_my_modules(),public.astros_admin_modules(uuid),public.astros_save_module(text,boolean,uuid,text) to authenticated;
grant execute on function public.astros_module_access(uuid,text) to service_role;
commit;
