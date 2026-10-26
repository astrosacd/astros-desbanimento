-- Additive customer productivity features. No operational triggers, provider calls or wallet writes.
begin;
create table if not exists public.astros_lead_followups (
 user_id uuid not null references public.painel_de_desbanimento(id) on delete cascade,
 source text not null check(source in ('maps','cnpj')),lead_id uuid not null,
 note text not null default '' check(length(note)<=2000),due_on date,done boolean not null default false,
 version integer not null default 0 check(version>=0),updated_at timestamptz not null default now(),
 primary key(user_id,source,lead_id)
);
create index if not exists astros_followup_due on public.astros_lead_followups(user_id,due_on,lead_id) where not done and due_on is not null;
create table if not exists public.astros_activity_reads (
 user_id uuid not null references public.painel_de_desbanimento(id) on delete cascade,
 event_key text not null check(length(event_key)<=100),read_at timestamptz not null default now(),primary key(user_id,event_key)
);
alter table public.astros_lead_followups enable row level security;
alter table public.astros_activity_reads enable row level security;
revoke all on public.astros_lead_followups,public.astros_activity_reads from public,anon,authenticated;
grant all on public.astros_lead_followups,public.astros_activity_reads to service_role;

create or replace function public.astros_workspace_actor() returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();begin
 if actor is null or not exists(select 1 from auth.users u join public.painel_de_desbanimento p on p.id=u.id where u.id=actor and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()) and coalesce(u.raw_app_meta_data->>'astros_password_change_required','false')<>'true') then raise exception 'Entre novamente para continuar';end if;
 return actor;
end $$;
create or replace function public.astros_followup_owner(actor uuid,source_name text,delivery_id uuid) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if source_name='maps' then
  if exists(select 1 from public.astros_prospect_deliveries where id=delivery_id and user_id=actor) then return;end if;
 elsif source_name='cnpj' then
  if exists(select 1 from public.astros_cnpj_deliveries where id=delivery_id and user_id=actor) then return;end if;
 end if;
 raise exception 'Lead não encontrado na sua conta';
end $$;
create or replace function public.astros_followup_read(source_name text,delivery_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.astros_workspace_actor();r public.astros_lead_followups;begin
 perform public.astros_followup_owner(actor,source_name,delivery_id);
 select * into r from public.astros_lead_followups where user_id=actor and source=source_name and lead_id=delivery_id;
 return jsonb_build_object('note',coalesce(r.note,''),'dueOn',r.due_on,'done',coalesce(r.done,false),'version',coalesce(r.version,0));
end $$;
create or replace function public.astros_followup_save(source_name text,delivery_id uuid,note_text text,due_date date,completed boolean,expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.astros_workspace_actor();r public.astros_lead_followups;begin
 perform public.astros_followup_owner(actor,source_name,delivery_id);
 if note_text is null or length(note_text)>2000 or completed is null or expected_version is null or expected_version<0 or (due_date is not null and (due_date<'2020-01-01'::date or due_date>'2100-12-31'::date)) then raise exception 'Confira a anotação e a data';end if;
 insert into public.astros_lead_followups(user_id,source,lead_id) values(actor,source_name,delivery_id) on conflict do nothing;
 select * into r from public.astros_lead_followups where user_id=actor and source=source_name and lead_id=delivery_id for update;
 -- An identical retry after an uncertain response is harmless.
 if (r.note,r.due_on,r.done) is not distinct from (note_text,due_date,completed) then return public.astros_followup_read(source_name,delivery_id);end if;
 if r.version<>expected_version then raise exception 'Esta anotação foi alterada em outra aba. Recarregue antes de salvar';end if;
 update public.astros_lead_followups set note=note_text,due_on=due_date,done=completed,version=version+1,updated_at=now() where user_id=actor and source=source_name and lead_id=delivery_id;
 return public.astros_followup_read(source_name,delivery_id);
end $$;
create or replace function public.astros_followup_agenda(period_name text default 'today') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.astros_workspace_actor();today date:=(now() at time zone 'America/Fortaleza')::date;rows jsonb;total bigint;begin
 if period_name not in ('today','overdue','week') or period_name is null then raise exception 'Confira o período';end if;
 with owned as (
 select d.id,'maps'::text source,d.snapshot->>'name' name from public.astros_prospect_deliveries d where d.user_id=actor
 union all select d.id,'cnpj'::text,d.snapshot->>'name' from public.astros_cnpj_deliveries d where d.user_id=actor
 ), matching as (
 select n.*,left(coalesce(o.name,'Empresa'),160) name from public.astros_lead_followups n join owned o on o.id=n.lead_id and o.source=n.source
 where n.user_id=actor and not n.done and n.due_on is not null and case period_name when 'overdue' then n.due_on<today when 'week' then n.due_on between today and today+6 else n.due_on=today end
 ), limited as (select * from matching order by due_on,lead_id,source limit 100)
 select (select count(*) from matching),coalesce(jsonb_agg(jsonb_build_object('id',lead_id,'source',source,'name',name,'note',note,'dueOn',due_on,'done',done,'version',version) order by due_on,lead_id,source),'[]'::jsonb) into total,rows from limited;
 return jsonb_build_object('today',today,'total',total,'rows',rows);
end $$;
create or replace function public.astros_movement_label(reference_text text,movement_kind text) returns text language sql immutable set search_path='' as $$
 select case when reference_text like 'affiliate-refund:%' then 'Estorno de comissão de afiliação' when reference_text like 'affiliate:%' then 'Comissão de afiliação' when reference_text like 'prospect:%' or reference_text like 'cnpj:%' then 'Prospecção de empresas' when reference_text like 'social-refund:%' then 'Devolução de redes sociais' when reference_text like 'social:%' then 'Pedido de redes sociais' when reference_text like 'sms-refund:%' then 'Devolução de ativação SMS' when reference_text like 'sms:%' then 'Compra de ativação SMS' when reference_text like 'manual-reversal:%' then 'Estorno de crédito manual' when reference_text like 'manual:%' then 'Crédito manual' when movement_kind='credit' then 'Crédito na carteira' when movement_kind='debit' then 'Utilização de saldo' else 'Ajuste ou estorno de saldo' end;
$$;
create or replace function public.astros_wallet_statement(from_day date,until_day date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.astros_workspace_actor();rows jsonb;begin
 if from_day is null or until_day is null or until_day<from_day or until_day-from_day>365 then raise exception 'Escolha um período de até 366 dias';end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at,r.id),'[]'::jsonb) into rows from (
 select id,created_at,amount_cents,kind,public.astros_movement_label(reference,kind) description from public.astros_wallet_movements
 where user_id=actor and created_at>=from_day::timestamp at time zone 'America/Fortaleza' and created_at<(until_day+1)::timestamp at time zone 'America/Fortaleza' order by created_at,id limit 5001
 )r;
 if jsonb_array_length(rows)>5000 then raise exception 'O período tem mais de 5.000 movimentações. Selecione um período menor';end if;
 return jsonb_build_object('rows',rows,'from',from_day,'until',until_day,'timezone','America/Fortaleza');
end $$;
-- Current recorded outcomes, not supplier polling or an audit of every intermediate transition.
create or replace function public.astros_activity_list() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.astros_workspace_actor();rows jsonb;begin
 with wallet as (
 select 'wallet:'||id event_key,public.astros_movement_label(reference,kind) title,'carteira' area,'/carteira' target,created_at happened_at
 from public.astros_wallet_movements where user_id=actor and kind<>'debit' and created_at>=now()-interval '30 days' order by created_at desc,id limit 50
 ), sms as (
 select 'sms:'||id||':'||state event_key,case state when 'received' then 'SMS recebido' when 'refunded' then 'Ativação SMS reembolsada' else 'Ativação SMS em conferência' end title,'sms' area,'/ativacoes-sms' target,updated_at happened_at
 from public.astros_sms_orders where user_id=actor and state in ('received','refunded','review') and updated_at>=now()-interval '30 days' order by updated_at desc,id limit 50
 ), social as (
 select 'social:'||id||':'||state event_key,case state when 'completed' then 'Pedido de redes sociais concluído' when 'partial' then 'Pedido de redes sociais parcialmente entregue' when 'refunded' then 'Pedido de redes sociais reembolsado' else 'Pedido de redes sociais em conferência' end title,'social' area,'/redes-sociais' target,updated_at happened_at
 from public.astros_social_orders where user_id=actor and state in ('completed','partial','refunded','review') and updated_at>=now()-interval '30 days' order by updated_at desc,id limit 50
 ), submissions as (
 select 'submission:'||id||':'||state event_key,case state when 'completed' then 'Solicitação de número enviada' when 'failed' then 'Envio de número não concluído' else 'Envio de número em conferência' end title,'desbanimento' area,'/solicitacoes' target,updated_at happened_at
 from public.astros_service_jobs where user_id=actor and state in ('completed','failed','review') and updated_at>=now()-interval '30 days' order by updated_at desc,id limit 50
 ), maps as (
 select 'maps:'||id||':'||state event_key,case state when 'completed' then 'Busca Google Maps concluída' else 'Busca Google Maps não concluída' end title,'prospecting' area,'/prospeccao' target,coalesce(completed_at,created_at) happened_at
 from public.astros_prospect_requests where user_id=actor and state in ('completed','failed') and coalesce(completed_at,created_at)>=now()-interval '30 days' order by coalesce(completed_at,created_at) desc,id limit 50
 ), cnpj as (
 select 'cnpj:'||id||':'||state event_key,case state when 'completed' then 'Consulta CNPJ concluída' else 'Consulta CNPJ não concluída' end title,'prospecting' area,'/prospeccao' target,coalesce(completed_at,created_at) happened_at
 from public.astros_cnpj_requests where user_id=actor and state in ('completed','failed') and coalesce(completed_at,created_at)>=now()-interval '30 days' order by coalesce(completed_at,created_at) desc,id limit 50
 ), recent as (
 select * from (select * from wallet union all select * from sms union all select * from social union all select * from submissions union all select * from maps union all select * from cnpj)e order by happened_at desc,event_key limit 50
 )
 select coalesce(jsonb_agg(jsonb_build_object('key',e.event_key,'title',e.title,'area',e.area,'target',e.target,'date',e.happened_at,'read',r.event_key is not null) order by e.happened_at desc,e.event_key),'[]'::jsonb) into rows from recent e left join public.astros_activity_reads r on r.user_id=actor and r.event_key=e.event_key;
 return jsonb_build_object('rows',rows,'windowDays',30,'limit',50);
end $$;
create or replace function public.astros_activity_mark(event_keys text[]) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.astros_workspace_actor();items jsonb;begin
 if event_keys is null or cardinality(event_keys)>50 then raise exception 'Confira as notificações';end if;
 items:=public.astros_activity_list()->'rows';
 insert into public.astros_activity_reads(user_id,event_key) select actor,item->>'key' from jsonb_array_elements(items)item where item->>'key'=any(event_keys) on conflict do nothing;
 -- Only read markers expire; operational and financial histories are never deleted.
 delete from public.astros_activity_reads where user_id=actor and read_at<now()-interval '60 days';
end $$;

revoke all on function public.astros_workspace_actor(),public.astros_followup_owner(uuid,text,uuid),public.astros_movement_label(text,text) from public,anon,authenticated;
revoke all on function public.astros_followup_read(text,uuid),public.astros_followup_save(text,uuid,text,date,boolean,integer),public.astros_followup_agenda(text),public.astros_wallet_statement(date,date),public.astros_activity_list(),public.astros_activity_mark(text[]) from public,anon,authenticated;
grant execute on function public.astros_followup_read(text,uuid),public.astros_followup_save(text,uuid,text,date,boolean,integer),public.astros_followup_agenda(text),public.astros_wallet_statement(date,date),public.astros_activity_list(),public.astros_activity_mark(text[]) to authenticated;
commit;
