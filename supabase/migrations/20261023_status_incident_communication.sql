-- Public incident communication only; no operational module, wallet or supplier changes.
begin;
alter table public.astros_status_components
 add column if not exists notice_phase text not null default 'investigating' check(notice_phase in ('investigating','identified','monitoring','resolved')),
 add column if not exists impact text not null default '' check(length(impact)<=300),
 add column if not exists next_update timestamptz,
 add column if not exists starts_at timestamptz;
create or replace function public.astros_status_save(component_key text, manual_status text default null, public_message text default '', expires timestamptz default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.astros_is_admin() then raise exception 'Acesso negado'; end if;
 if manual_status is not null and manual_status not in ('operational','degraded','unavailable','maintenance') then raise exception 'Status inválido'; end if;
 if length(public_message)>500 or (manual_status is not null and expires is not null and expires<=now()) then raise exception 'Mensagem ou prazo inválido'; end if;
 if manual_status in ('degraded','unavailable','maintenance') and length(trim(public_message))<5 then raise exception 'Escreva um aviso público'; end if;
 perform 1 from public.astros_status_components where key=component_key for update;
 if not found then raise exception 'Componente inválido'; end if;
 update public.astros_status_components set manual=manual_status,message=case when manual_status is null then '' else trim(public_message) end,expires_at=case when manual_status is null then null else expires end,updated_by=auth.uid(),updated_at=now(),notice_phase='investigating',impact='',next_update=null,starts_at=null where key=component_key;
 insert into public.astros_status_audit(actor,component,status,message,expires_at) values(auth.uid(),component_key,manual_status,public_message,expires);
 insert into public.astros_status_events(component,status,message,source) values(component_key,coalesce(manual_status,'automatic'),case when manual_status is null then 'Monitoramento automático retomado.' else trim(public_message) end,'manual');
end $$;

create table if not exists public.astros_status_notice_audit(
 id bigint generated always as identity primary key,actor uuid not null,component text not null,
 details jsonb not null,created_at timestamptz not null default now()
);
alter table public.astros_status_notice_audit enable row level security;
revoke all on public.astros_status_notice_audit from public,anon,authenticated;
grant all on public.astros_status_notice_audit to service_role;
create or replace function public.astros_status_save_v2(
 component_key text, manual_status text, public_message text, expires timestamptz, details jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare phase text; impact_text text; next_at timestamptz; start_at timestamptz; previous public.astros_status_components;
begin
 if not public.astros_is_admin() then raise exception 'Acesso negado'; end if;
 if details is null or jsonb_typeof(details)<>'object' or exists(select 1 from jsonb_object_keys(details) k where k not in ('phase','impact','nextUpdate','startsAt')) then raise exception 'Detalhes inválidos'; end if;
 phase:=details->>'phase'; impact_text:=coalesce(details->>'impact','');
 if phase is null or phase not in ('investigating','identified','monitoring','resolved') or length(impact_text)>300 then raise exception 'Detalhes inválidos'; end if;
 next_at:=(details->>'nextUpdate')::timestamptz; start_at:=(details->>'startsAt')::timestamptz;
 if manual_status is not null then
  if phase='resolved' and manual_status<>'operational' then raise exception 'Selecione Operacional para encerrar'; end if;
  if next_at is not null and (next_at<=now() or phase='resolved') then raise exception 'Próxima atualização inválida'; end if;
  if start_at is not null and (manual_status<>'maintenance' or start_at<=now() or expires is null or expires<=start_at or (next_at is not null and next_at<start_at)) then raise exception 'Janela de manutenção inválida'; end if;
 end if;
 select * into previous from public.astros_status_components where key=component_key for update;
 perform public.astros_status_save(component_key,manual_status,public_message,expires);
 if manual_status is not null then
  update public.astros_status_components set notice_phase=phase,impact=trim(impact_text),next_update=next_at,
   starts_at=coalesce(start_at,case when previous.manual is not null and previous.starts_at<=now() and (previous.expires_at is null or previous.expires_at>now()) then previous.starts_at end,now())
  where key=component_key;
  update public.astros_status_events set
   status=case when start_at>now() then 'operational' else manual_status end,
   message=left(case when start_at>now() then 'Manutenção programada: ' else '' end||public_message,500)
  where id=(select max(id) from public.astros_status_events where component=component_key);
  -- The existing audit remains bounded. Retain structured metadata privately, too.
  insert into public.astros_status_notice_audit(actor,component,details)
  values(auth.uid(),component_key,jsonb_build_object('phase',phase,'impact',trim(impact_text),'nextUpdate',next_at,'startsAt',start_at));
 end if;
end $$;

create or replace function public.astros_status_notice_text(c public.astros_status_components)
returns text language sql stable set search_path='' as $$
 select concat_ws(E'\n',
  'Andamento: '||case c.notice_phase when 'identified' then 'Causa identificada' when 'monitoring' then 'Acompanhando recuperação' when 'resolved' then 'Resolvido' else 'Investigando' end,
  nullif(c.message,''),
  case when c.impact<>'' then 'Impacto para o cliente: '||c.impact end,
  case when c.starts_at is not null then 'Início: '||to_char(c.starts_at at time zone 'America/Fortaleza','DD/MM/YYYY HH24:MI')||' (Brasília)' end,
  case when c.manual='maintenance' and c.expires_at is not null then 'Término previsto: '||to_char(c.expires_at at time zone 'America/Fortaleza','DD/MM/YYYY HH24:MI')||' (Brasília)' end,
  case when c.next_update is not null and c.notice_phase<>'resolved' then
   case when c.next_update<=now() then 'Atualização aguardada desde: ' else 'Próxima atualização: ' end||to_char(c.next_update at time zone 'America/Fortaleza','DD/MM/YYYY HH24:MI')||' (Brasília)' end
 );
$$;
create or replace function public.astros_status_public() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('generatedAt',now(),'components',coalesce((select jsonb_agg(jsonb_build_object(
 'key',c.key,'label',c.label,
 'status',case when m.enabled=false then 'maintenance'
 when c.manual is not null and (c.starts_at is null or c.starts_at<=now()) and (c.expires_at is null or c.expires_at>now()) then c.manual
 when c.checked_at is null or c.checked_at<now()-interval '10 minutes' then 'unknown' else c.automatic end,
 'message',case when m.enabled=false then 'Serviço em manutenção. Pedidos já iniciados continuam em acompanhamento.'
 when c.manual is not null and (c.starts_at is null or c.starts_at<=now()) and (c.expires_at is null or c.expires_at>now()) then public.astros_status_notice_text(c) else '' end,
 'source',case when m.enabled=false then 'module' when c.manual is not null and (c.starts_at is null or c.starts_at<=now()) and (c.expires_at is null or c.expires_at>now()) then 'manual' else 'automatic' end,
 'startsAt',case when c.manual is not null and (c.expires_at is null or c.expires_at>now()) then c.starts_at end,
 'scheduled',case when c.manual='maintenance' and c.starts_at>now() and c.expires_at>c.starts_at then
 jsonb_build_object('startsAt',c.starts_at,'endsAt',c.expires_at,'message','Manutenção programada'||E'\n'||public.astros_status_notice_text(c)) else null end,
 'checkedAt',c.checked_at) order by c.key) from public.astros_status_components c left join public.astros_module_settings m on m.module=c.module),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(t.item order by t.created_at desc) from (select jsonb_build_object('id',e.id,'component',c.label,'status',e.status,'message',e.message,'source',e.source,'createdAt',e.created_at) item,e.created_at from public.astros_status_events e join public.astros_status_components c on c.key=e.component where e.created_at>now()-interval '30 days' order by e.created_at desc,e.id desc limit 40)t),'[]'::jsonb));
$$;
create or replace function public.astros_status_monitor_health() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('service','astros-status-monitor','checkedAt',now(),
 'checksFresh',(select count(*)=7 and coalesce(bool_and(coalesce(checked_at>now()-interval '10 minutes' and checked_at<=now()+interval '1 minute',false)),false) from public.astros_status_components),
 'syncFresh',coalesce((select enabled and last_success>now()-interval '10 minutes' and last_success<=now()+interval '1 minute' from public.astros_status_bridge_private where id),false));
$$;
revoke all on function public.astros_status_save_v2(text,text,text,timestamptz,jsonb),public.astros_status_notice_text(public.astros_status_components),public.astros_status_monitor_health() from public,anon,authenticated;
grant execute on function public.astros_status_save_v2(text,text,text,timestamptz,jsonb) to authenticated;
grant execute on function public.astros_status_monitor_health() to service_role;
commit;
