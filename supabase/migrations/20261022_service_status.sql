-- Additive public technical status. Does not gate any operational transaction.
begin;
create table if not exists public.astros_status_private (
 id boolean primary key default true check(id), worker_secret text not null default encode(extensions.gen_random_bytes(32),'hex'),
 lease uuid, lease_until timestamptz, last_started timestamptz
);
insert into public.astros_status_private(id) values(true) on conflict do nothing;
create table if not exists public.astros_status_components (
 key text primary key, label text not null, module text,
 automatic text not null default 'unknown' check(automatic in ('operational','degraded','unavailable','unknown')),
 checked_at timestamptz, failures integer not null default 0, successes integer not null default 0,
 diagnostic text, manual text check(manual in ('operational','degraded','unavailable','maintenance')),
 message text not null default '' check(length(message)<=500), expires_at timestamptz, updated_by uuid, updated_at timestamptz
);
insert into public.astros_status_components(key,label,module) values
 ('panel','Painel e acesso',null),('auth','Autenticação',null),('desbanimento','Desbanimento','desbanimento'),
 ('sms','Ativações SMS','sms'),('social','Redes sociais','social'),('prospect_maps','Prospecção · Google Maps','prospecting'),('prospect_cnpj','Prospecção · CNPJ','prospecting') on conflict do nothing;
create table if not exists public.astros_status_events (
 id bigint generated always as identity primary key, component text not null references public.astros_status_components(key),
 status text not null check(status in ('operational','degraded','unavailable','maintenance','unknown','automatic')),
 message text not null check(length(message)<=500), source text not null check(source in ('automatic','manual')),
 created_at timestamptz not null default now()
);
create table if not exists public.astros_status_audit (
 id bigint generated always as identity primary key, actor uuid not null, component text not null,
 status text, message text, expires_at timestamptz, created_at timestamptz not null default now()
);
alter table public.astros_status_private enable row level security;
alter table public.astros_status_components enable row level security;
alter table public.astros_status_events enable row level security;
alter table public.astros_status_audit enable row level security;
revoke all on public.astros_status_private,public.astros_status_components,public.astros_status_events,public.astros_status_audit from public,anon,authenticated;
grant all on public.astros_status_private,public.astros_status_components,public.astros_status_events,public.astros_status_audit to service_role;

create or replace function public.astros_status_public() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('generatedAt',now(),'components',coalesce((select jsonb_agg(jsonb_build_object(
 'key',c.key,'label',c.label,'status',case when m.enabled=false then 'maintenance'
 when c.manual is not null and (c.expires_at is null or c.expires_at>now()) then c.manual
 when c.checked_at is null or c.checked_at<now()-interval '10 minutes' then 'unknown' else c.automatic end,
 'message',case when m.enabled=false then 'Serviço em manutenção. Pedidos já iniciados continuam em acompanhamento.'
 when c.manual is not null and (c.expires_at is null or c.expires_at>now()) then c.message else '' end,
 'source',case when m.enabled=false then 'module' when c.manual is not null and (c.expires_at is null or c.expires_at>now()) then 'manual' else 'automatic' end,
 'checkedAt',c.checked_at) order by c.key) from public.astros_status_components c left join public.astros_module_settings m on m.module=c.module),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(t.item order by t.created_at desc) from (select jsonb_build_object('id',e.id,'component',c.label,'status',e.status,'message',e.message,'source',e.source,'createdAt',e.created_at) item,e.created_at from public.astros_status_events e join public.astros_status_components c on c.key=e.component where e.created_at>now()-interval '30 days' order by e.created_at desc,e.id desc limit 40)t),'[]'::jsonb));
$$;
create or replace function public.astros_status_admin() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.astros_is_admin() then raise exception 'Acesso negado'; end if;
 return jsonb_build_object('public',public.astros_status_public(),'settings',(select jsonb_agg(to_jsonb(c) order by c.key) from public.astros_status_components c));
end $$;
create or replace function public.astros_status_save(component_key text, manual_status text default null, public_message text default '', expires timestamptz default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.astros_is_admin() then raise exception 'Acesso negado'; end if;
 if manual_status is not null and manual_status not in ('operational','degraded','unavailable','maintenance') then raise exception 'Status inválido'; end if;
 if length(public_message)>500 or (manual_status is not null and expires is not null and expires<=now()) then raise exception 'Mensagem ou prazo inválido'; end if;
 if manual_status in ('degraded','unavailable','maintenance') and length(trim(public_message))<5 then raise exception 'Escreva um aviso público'; end if;
 perform 1 from public.astros_status_components where key=component_key for update;
 if not found then raise exception 'Componente inválido'; end if;
 update public.astros_status_components set manual=manual_status,message=case when manual_status is null then '' else trim(public_message) end,expires_at=case when manual_status is null then null else expires end,updated_by=auth.uid(),updated_at=now() where key=component_key;
 insert into public.astros_status_audit(actor,component,status,message,expires_at) values(auth.uid(),component_key,manual_status,public_message,expires);
 insert into public.astros_status_events(component,status,message,source) values(component_key,coalesce(manual_status,'automatic'),case when manual_status is null then 'Monitoramento automático retomado.' else trim(public_message) end,'manual');
end $$;
-- Single leased batch; worker authentication happens before claim in the Edge Function.
create or replace function public.astros_status_claim() returns uuid language plpgsql security definer set search_path='' as $$
declare token uuid:=gen_random_uuid();begin
 update public.astros_status_private set lease=token,lease_until=now()+interval '90 seconds',last_started=now()
 where id and (lease_until is null or lease_until<now()) and (last_started is null or last_started<now()-interval '1 minute');
 if not found then return null; end if; return token;
end $$;
create or replace function public.astros_status_finish(lease_token uuid,samples jsonb) returns void language plpgsql security definer set search_path='' as $$
declare s jsonb; c public.astros_status_components; next_status text; v_failures integer; v_successes integer;begin
 perform 1 from public.astros_status_private where id and lease=lease_token and lease_until>now() for update;
 if not found then raise exception 'Verificação expirada'; end if;
 if jsonb_typeof(samples)<>'array' or jsonb_array_length(samples)<>7 or (select count(distinct value->>'key') from jsonb_array_elements(samples))<>7 then raise exception 'Amostras inválidas'; end if;
 for s in select value from jsonb_array_elements(samples) loop
 select * into c from public.astros_status_components where key=s->>'key' for update;
 if not found or not coalesce(s->>'result' in ('ok','failed','unknown'),false) or not coalesce(s->>'diagnostic'=any(array['ok','unreachable','configuration_missing','worker_stale','paused','capacity_unavailable','invalid_response']),false) then raise exception 'Amostra inválida'; end if;
 v_failures:=case when s->>'result'='failed' then c.failures+1 else 0 end;
 v_successes:=case when s->>'result'='ok' then c.successes+1 else 0 end;
 next_status:=case when s->>'result'='unknown' then 'unknown' when v_failures>=3 then 'unavailable' when v_failures>0 then 'degraded' when c.automatic in ('unavailable','degraded') and v_successes<2 then 'degraded' else 'operational' end;
 update public.astros_status_components set automatic=next_status,checked_at=now(),diagnostic=s->>'diagnostic',failures=least(v_failures,100),successes=least(v_successes,100) where key=c.key;
 if next_status<>c.automatic then insert into public.astros_status_events(component,status,message,source) values(c.key,next_status,case next_status when 'operational' then 'Verificação técnica normalizada.' when 'degraded' then 'Instabilidade detectada na verificação técnica.' when 'unavailable' then 'Falhas consecutivas na verificação técnica.' else 'Sem confirmação técnica disponível.' end,'automatic'); end if;
 end loop;
 update public.astros_status_private set lease=null,lease_until=null where id;
 delete from public.astros_status_events where created_at<now()-interval '30 days';
end $$;
revoke all on function public.astros_status_public(),public.astros_status_claim(),public.astros_status_finish(uuid,jsonb),public.astros_status_admin(),public.astros_status_save(text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.astros_status_public(),public.astros_status_claim(),public.astros_status_finish(uuid,jsonb) to service_role;
grant execute on function public.astros_status_admin(),public.astros_status_save(text,text,text,timestamptz) to authenticated;
commit;
