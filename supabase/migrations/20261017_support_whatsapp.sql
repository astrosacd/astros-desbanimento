begin;
-- Independent from chat credentials and settings; existing chat remains untouched.
create table if not exists public.astros_support_whatsapp (
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 links jsonb not null default '[]'::jsonb,
 updated_at timestamptz not null default now()
);
alter table public.astros_support_whatsapp enable row level security;
revoke all on public.astros_support_whatsapp from public,anon,authenticated;
grant select on public.astros_support_whatsapp to authenticated;
drop policy if exists astros_support_whatsapp_read on public.astros_support_whatsapp;
create policy astros_support_whatsapp_read on public.astros_support_whatsapp for select to authenticated using (true);
insert into public.astros_support_whatsapp(id,enabled,links) values(true,false,'[{"label":"WhatsApp 1","url":"https://wa.me/message/2BTTLFPLWDDDE1"},{"label":"WhatsApp 2","url":"https://wa.me/message/2WX4V6YSBBUAB1"}]'::jsonb) on conflict(id) do nothing;
create or replace function public.astros_save_support_whatsapp(active boolean,contacts jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; seen text[]:='{}';
begin
 if not public.astros_is_admin() then raise exception 'Acesso administrativo necessário'; end if;
 if active is null or contacts is null or jsonb_typeof(contacts)<>'array' then raise exception 'Contatos inválidos'; end if;
 if jsonb_array_length(contacts) not between 1 and 2 then raise exception 'Informe um ou dois contatos'; end if;
 for item in select value from jsonb_array_elements(contacts) loop
  if jsonb_typeof(item)<>'object' then raise exception 'Contato inválido'; end if;
  if jsonb_typeof(item->'label') is distinct from 'string' or jsonb_typeof(item->'url') is distinct from 'string' or length(btrim(item->>'label')) not between 2 and 60 or length(item->>'url')>200 or (item->>'url') !~ '^https://wa[.]me/(message/[A-Za-z0-9]{6,40}|[1-9][0-9]{7,14})$' then raise exception 'Nome ou link do WhatsApp inválido'; end if;
  if (item->>'url')=any(seen) then raise exception 'Informe contatos diferentes'; end if;
  seen:=array_append(seen,item->>'url');
 end loop;
 insert into public.astros_support_whatsapp(id,enabled,links) values(true,active,(select jsonb_agg(jsonb_build_object('label',btrim(value->>'label'),'url',value->>'url')) from jsonb_array_elements(contacts))) on conflict(id) do update set enabled=excluded.enabled,links=excluded.links,updated_at=now();
end $$;
revoke all on function public.astros_save_support_whatsapp(boolean,jsonb) from public,anon;
grant execute on function public.astros_save_support_whatsapp(boolean,jsonb) to authenticated;
commit;
