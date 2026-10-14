-- Instala a migração de clientes; não importa dados nem altera saldos por si só.
-- Requer perfis, carteira e créditos manuais já instalados.
begin;
create table if not exists public.astros_legacy_client_imports (
 id uuid primary key default gen_random_uuid(),
 batch text not null default 'legacy-panel-20261013' check(batch='legacy-panel-20261013'),
 source_id text not null check(source_id ~ '^[0-9]{1,20}$'),
 email text not null check(email=lower(btrim(email)) and email<>'eudezioj@gmail.com'),
 name text not null, whatsapp text not null,
 amount_cents bigint not null check(amount_cents between 0 and 1000000),
 admin_id uuid not null references public.painel_de_desbanimento(id),
 user_id uuid references auth.users(id),
 state text not null default 'pending' check(state in ('pending','completed','skipped')),
 created_at timestamptz not null default now(), completed_at timestamptz,
 unique(batch,source_id), unique(batch,email)
);
alter table public.astros_legacy_client_imports enable row level security;
revoke all on public.astros_legacy_client_imports from public,anon,authenticated;
grant select on public.astros_legacy_client_imports to authenticated;
create policy astros_legacy_import_admin_read on public.astros_legacy_client_imports for select to authenticated using(public.astros_is_admin());
create or replace function public.astros_prepare_legacy_client(actor uuid,legacy_id text,client_email text,client_name text,client_whatsapp text,credit_cents bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.astros_legacy_client_imports; existing auth.users; matches integer;
begin
 if not exists(select 1 from public.painel_de_desbanimento p join auth.users u on u.id=p.id where p.id=actor and p.tipo_usuario='admin' and u.email_confirmed_at is not null) then raise exception 'Acesso administrativo necessário'; end if;
 if legacy_id is null or legacy_id!~'^[0-9]{1,20}$' or client_email is null or client_email<>lower(btrim(client_email)) or client_email='eudezioj@gmail.com' or length(client_email)>254 or client_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or client_name is null or length(btrim(client_name)) not between 1 and 120 or client_whatsapp is null or client_whatsapp!~'^[0-9]{7,15}$' or credit_cents is null or credit_cents not between 0 and 1000000 then raise exception 'Dados inválidos'; end if;
 insert into public.astros_legacy_client_imports(source_id,email,name,whatsapp,amount_cents,admin_id) values(legacy_id,client_email,btrim(client_name),client_whatsapp,credit_cents,actor) on conflict do nothing;
 select * into job from public.astros_legacy_client_imports where batch='legacy-panel-20261013' and source_id=legacy_id for update;
 if not found or job.email<>client_email or job.name<>btrim(client_name) or job.whatsapp<>client_whatsapp or job.amount_cents<>credit_cents then raise exception 'Registro já reservado com dados diferentes'; end if;
 if job.state<>'pending' then return jsonb_build_object('id',job.id,'state',job.state,'userId',job.user_id); end if;
 select count(*) into matches from auth.users where lower(email)=client_email;
 if matches>1 then raise exception 'Identidade ambígua'; end if;
 select * into existing from auth.users where lower(email)=client_email limit 1;
 if found then
  if existing.raw_app_meta_data->>'astros_legacy_import' is distinct from job.id::text then
   update public.astros_legacy_client_imports set state='skipped',completed_at=now() where id=job.id;
   return jsonb_build_object('id',job.id,'state','skipped');
  end if;
  return jsonb_build_object('id',job.id,'state','pending','userId',existing.id);
 end if;
 return jsonb_build_object('id',job.id,'state','pending','userId',null);
end $$;
create or replace function public.astros_finish_legacy_client(actor uuid,import_id uuid,client_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.astros_legacy_client_imports; identity auth.users; profile public.painel_de_desbanimento; before_cents bigint; after_cents bigint;
begin
 if not exists(select 1 from public.painel_de_desbanimento p join auth.users u on u.id=p.id where p.id=actor and p.tipo_usuario='admin' and u.email_confirmed_at is not null) then raise exception 'Acesso administrativo necessário'; end if;
 -- Profile first, matching the lock order used by wallet operations.
 select * into profile from public.painel_de_desbanimento where id=client_id for update;
 if not found then raise exception 'Perfil não criado pelo cadastro'; end if;
 select * into job from public.astros_legacy_client_imports where id=import_id for update;
 if not found or job.email='eudezioj@gmail.com' or job.state='skipped' then raise exception 'Importação inválida'; end if;
 if job.state='completed' then
  if job.user_id is distinct from client_id then raise exception 'Referência divergente'; end if;
  return jsonb_build_object('state','completed','repeated',true,'amountCents',job.amount_cents);
 end if;
 select * into identity from auth.users where id=client_id;
 if not found or lower(identity.email)<>job.email or identity.raw_app_meta_data->>'astros_legacy_import' is distinct from job.id::text or identity.email_confirmed_at is null or profile.tipo_usuario<>'cliente' or lower(profile.email)<>job.email then raise exception 'Conta não pertence à importação'; end if;
 before_cents:=round(coalesce(profile.recarga,0)*100);after_cents:=before_cents+job.amount_cents;
 if job.amount_cents>0 then
  insert into public.astros_manual_credits(id,user_id,admin_id,amount_cents,reason,balance_before_cents,balance_after_cents) values(job.id,client_id,actor,job.amount_cents,'Saldo migrado do painel antigo',before_cents,after_cents);
  insert into public.astros_wallet_movements(user_id,amount_cents,kind,reference) values(client_id,job.amount_cents,'credit','manual:'||job.id::text);
 end if;
 update public.painel_de_desbanimento set nome=job.name,whatsapp=job.whatsapp,recarga=after_cents/100.0 where id=client_id;
 update public.astros_legacy_client_imports set user_id=client_id,state='completed',completed_at=now() where id=job.id;
 return jsonb_build_object('state','completed','repeated',false,'amountCents',job.amount_cents);
end $$;
revoke all on function public.astros_prepare_legacy_client(uuid,text,text,text,text,bigint) from public,anon,authenticated;
revoke all on function public.astros_finish_legacy_client(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.astros_prepare_legacy_client(uuid,text,text,text,text,bigint) to service_role;
grant execute on function public.astros_finish_legacy_client(uuid,uuid,uuid) to service_role;
commit;
