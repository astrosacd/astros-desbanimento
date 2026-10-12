begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.astros_support_settings(id boolean primary key default true check(id),enabled boolean not null default false,base_url text not null default '',website_token text not null default '',title text not null default 'Atendimento Astros',description text not null default 'Converse com nossa equipe sobre sua conta e suas solicitações.',updated_at timestamptz not null default now());
create table if not exists public.astros_support_private(id boolean primary key default true check(id),hmac_token text not null);
insert into public.astros_support_settings(id) values(true) on conflict do nothing;
alter table public.astros_support_settings enable row level security;
alter table public.astros_support_private enable row level security;
revoke all on public.astros_support_settings,public.astros_support_private from anon,authenticated;
grant select on public.astros_support_settings to authenticated;
create policy astros_support_read on public.astros_support_settings for select to authenticated using(true);
create or replace function public.astros_save_support(active boolean,origin text,widget_token text,heading text,description_text text,secret text default '') returns void language plpgsql security definer set search_path='' as $$
declare old_origin text; old_token text; saved_secret text;
begin
 if not public.astros_is_admin() then raise exception 'Acesso administrativo necessário'; end if;
 if origin !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' or widget_token !~ '^[A-Za-z0-9_-]{1,200}$' or length(heading) not between 2 and 80 or length(description_text) not between 2 and 300 then raise exception 'Configuração inválida'; end if;
 select base_url,website_token into old_origin,old_token from public.astros_support_settings where id=true for update;
 select hmac_token into saved_secret from public.astros_support_private where id=true;
 if length(secret)>0 then
  if length(secret) not between 16 and 512 then raise exception 'Chave de identidade inválida'; end if;
  insert into public.astros_support_private values(true,secret) on conflict(id) do update set hmac_token=excluded.hmac_token;
  saved_secret:=secret;
 elsif (old_origin<>origin or old_token<>widget_token) and saved_secret is not null then
  raise exception 'Informe a chave de identidade da nova caixa de entrada';
 end if;
 if active and coalesce(saved_secret,'')='' then raise exception 'Configure a chave de validação de identidade antes de ativar'; end if;
 update public.astros_support_settings set enabled=active,base_url=origin,website_token=widget_token,title=heading,description=description_text,updated_at=now() where id=true;
end $$;
create or replace function public.astros_support_identity(contact_phone text) returns jsonb language plpgsql security definer set search_path='' as $$
declare user_id uuid:=auth.uid(); profile public.painel_de_desbanimento; settings public.astros_support_settings; secret text; signature text; crypto_schema text; confirmed_email text;
begin
 if user_id is null or contact_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Conta ou contato inválido'; end if;
 select email into confirmed_email from auth.users where id=user_id and email_confirmed_at is not null;
 if confirmed_email is null then raise exception 'Confirme o e-mail da conta'; end if;
 select * into profile from public.painel_de_desbanimento where id=user_id;
 if not found then raise exception 'Perfil não encontrado'; end if;
 select * into settings from public.astros_support_settings where id=true;
 select hmac_token into secret from public.astros_support_private where id=true;
 if not coalesce(settings.enabled,false) or secret is null then raise exception 'Atendimento indisponível neste momento'; end if;
 select n.nspname into crypto_schema from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
 execute format('select encode(%I.hmac($1,$2,''sha256''),''hex'')',crypto_schema) into signature using user_id::text,secret;
 return jsonb_build_object('id',user_id,'name',profile.nome,'email',confirmed_email,'phone',contact_phone,'hash',signature,'baseUrl',settings.base_url,'websiteToken',settings.website_token,'title',settings.title,'description',settings.description);
end $$;
revoke all on function public.astros_save_support(boolean,text,text,text,text,text),public.astros_support_identity(text) from public,anon;
grant execute on function public.astros_save_support(boolean,text,text,text,text,text),public.astros_support_identity(text) to authenticated;
commit;
