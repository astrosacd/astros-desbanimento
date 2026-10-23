-- Optional bridge to the owner's Better Stack page. No keys in SQL/browser.
begin;
create table if not exists public.astros_status_bridge_private (
 id boolean primary key default true check(id), page_id text not null default '268731' check(page_id='268731'),
 enabled boolean not null default true, lease uuid, lease_until timestamptz,last_started timestamptz,
 last_checked timestamptz,last_success timestamptz,diagnostic text not null default 'waiting'
);
insert into public.astros_status_bridge_private(id) values(true) on conflict do nothing;
create table if not exists public.astros_status_bridge_items (
 component text primary key references public.astros_status_components(key), resource_id text,
 report_id text,report_type text check(report_type in ('manual','maintenance')),title text,
 pending boolean not null default false, fingerprint text, diagnostic text not null default 'waiting',last_synced timestamptz
);
insert into public.astros_status_bridge_items(component) select key from public.astros_status_components on conflict do nothing;
alter table public.astros_status_bridge_private enable row level security;
alter table public.astros_status_bridge_items enable row level security;
revoke all on public.astros_status_bridge_private,public.astros_status_bridge_items from public,anon,authenticated;
grant all on public.astros_status_bridge_private,public.astros_status_bridge_items to service_role;

create or replace function public.astros_status_bridge_claim() returns jsonb language plpgsql security definer set search_path='' as $$
declare token uuid:=gen_random_uuid();begin
 update public.astros_status_bridge_private set lease=token,lease_until=clock_timestamp()+interval '4 minutes',last_started=clock_timestamp()
 where id and enabled and (lease_until is null or lease_until<clock_timestamp()) and (last_started is null or last_started<clock_timestamp()-interval '1 minute');
 if not found then return null;end if;
 return jsonb_build_object('lease',token,'pageId','268731','snapshot',public.astros_status_public(),
 'items',(select jsonb_agg(to_jsonb(i)) from public.astros_status_bridge_items i),
 'expiries',(select jsonb_object_agg(key,expires_at) from public.astros_status_components));
end $$;
create or replace function public.astros_status_bridge_checkpoint(lease_token uuid,component_key text,patch jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.astros_status_bridge_private where id and lease=lease_token and lease_until>clock_timestamp() for update;
 if not found then raise exception 'Sincronização expirada';end if;
 if jsonb_typeof(patch)<>'object' or exists(select 1 from jsonb_object_keys(patch) k where k not in ('resource_id','report_id','report_type','title','pending','fingerprint','diagnostic','synced')) then raise exception 'Dados inválidos';end if;
 if (patch ? 'resource_id' and (patch->>'resource_id' is null or patch->>'resource_id' !~ '^[0-9]{1,20}$')) or (patch->>'report_id' is not null and patch->>'report_id' !~ '^[0-9]{1,20}$') or length(patch->>'title')>200 or length(patch->>'fingerprint')>64 or
 (patch ? 'diagnostic' and not coalesce(patch->>'diagnostic'=any(array['ok','api_unavailable','api_rejected','configuration_missing','mapping_mismatch','awaiting_confirmation','invalid_response','waiting']),false)) then raise exception 'Dados inválidos';end if;
 update public.astros_status_bridge_items set
 resource_id=case when patch ? 'resource_id' then patch->>'resource_id' else resource_id end,
 report_id=case when patch ? 'report_id' then patch->>'report_id' else report_id end,
 report_type=case when patch ? 'report_type' then patch->>'report_type' else report_type end,
 title=case when patch ? 'title' then patch->>'title' else title end,
 pending=case when patch ? 'pending' then (patch->>'pending')::boolean else pending end,
 fingerprint=case when patch ? 'fingerprint' then patch->>'fingerprint' else fingerprint end,
 diagnostic=case when patch ? 'diagnostic' then patch->>'diagnostic' else diagnostic end,
 last_synced=case when patch->>'synced'='true' then clock_timestamp() else last_synced end
 where component=component_key;
 if not found then raise exception 'Serviço inválido';end if;
end $$;
create or replace function public.astros_status_bridge_finish(lease_token uuid,result text) returns void language plpgsql security definer set search_path='' as $$
begin
 if result not in ('ok','api_unavailable','api_rejected','configuration_missing','mapping_mismatch','awaiting_confirmation','invalid_response') or result is null then raise exception 'Resultado inválido';end if;
 update public.astros_status_bridge_private set lease=null,lease_until=null,last_checked=clock_timestamp(),diagnostic=result,
 last_success=case when result='ok' then clock_timestamp() else last_success end
 where id and lease=lease_token and lease_until>clock_timestamp();
 if not found then raise exception 'Sincronização expirada';end if;
end $$;
create or replace function public.astros_status_admin() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.astros_is_admin() then raise exception 'Acesso negado';end if;
 return jsonb_build_object('public',public.astros_status_public(),
 'settings',(select jsonb_agg(to_jsonb(c) order by c.key) from public.astros_status_components c),
 'bridge',(select jsonb_build_object('enabled',b.enabled,'lastChecked',b.last_checked,'lastSuccess',b.last_success,'diagnostic',b.diagnostic,'items',
 (select jsonb_agg(jsonb_build_object('key',i.component,'diagnostic',i.diagnostic,'lastSynced',i.last_synced) order by i.component) from public.astros_status_bridge_items i)) from public.astros_status_bridge_private b where id));
end $$;
revoke all on function public.astros_status_bridge_claim(),public.astros_status_bridge_checkpoint(uuid,text,jsonb),public.astros_status_bridge_finish(uuid,text),public.astros_status_admin() from public,anon,authenticated;
grant execute on function public.astros_status_bridge_claim(),public.astros_status_bridge_checkpoint(uuid,text,jsonb),public.astros_status_bridge_finish(uuid,text) to service_role;
grant execute on function public.astros_status_admin() to authenticated;
-- Keep the existing cron and dedicated secret; only allow this monitor enough time.
create or replace function public.astros_status_tick() returns void language plpgsql security definer set search_path='' as $$
declare k text;begin
 select worker_secret into k from public.astros_status_private where id;
 if k is null then raise exception 'Monitoramento não instalado';end if;
 perform net.http_post(url:='https://tevljvidqbvrcgzqypwf.supabase.co/functions/v1/astros-status',headers:=jsonb_build_object('Content-Type','application/json','X-Astros-Status-Worker',k),body:='{"action":"worker"}'::jsonb,timeout_milliseconds:=120000);
end $$;
revoke all on function public.astros_status_tick() from public,anon,authenticated;
grant execute on function public.astros_status_tick() to service_role;
commit;
