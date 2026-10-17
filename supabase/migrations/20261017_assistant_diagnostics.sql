-- ASTRA: fixed, read-only administrative diagnostics. No log retention or data changes.
begin;
create or replace function public.astros_assistant_diagnostics(
 date_from date, date_until date, client_search text default '', module_filter text default 'all', reference_filter text default ''
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a timestamptz;b timestamptz;term text:=lower(trim(coalesce(client_search,'')));ref text:=lower(trim(coalesce(reference_filter,'')));result jsonb;
begin
 if public.astros_is_admin() is not true then raise exception 'Acesso restrito à administração';end if;
 if date_from is null or date_until is null or date_until<date_from or date_until-date_from>30 or length(term)>100 or length(ref)>100 or module_filter is null or module_filter not in ('all','api','sms','social','desban','payment') then raise exception 'Filtros de diagnóstico inválidos';end if;
 a=date_from::timestamp at time zone 'America/Fortaleza';b=(date_until+1)::timestamp at time zone 'America/Fortaleza';
 with accounts as (
  select p.id,p.email from public.painel_de_desbanimento p where term='' or strpos(lower(coalesce(p.email,'')||' '||coalesce(p.nome,'')),term)>0
 ), events as (
  select 'api'::text module,l.created_at as occurred_at,p.email,coalesce(l.request_id::text,l.id::text) reference_id,null::text service_ref,coalesce(l.error_code,l.state)::text category,l.state,l.http_status,null::bigint amount_cents,null::bigint refund_cents
  from public.astros_api_logs l join accounts p on p.id=l.user_id where l.error_code is not null or l.http_status>=400 or l.state in ('failed','error','review')
  union all
  select 'sms',coalesce(d.created_at,o.updated_at),p.email,o.id::text,o.service_id::text,coalesce(d.category,'REVIEW_PENDING'),o.state,d.http_status,o.price_cents,null::bigint
  from public.astros_sms_orders o join accounts p on p.id=o.user_id left join public.astros_sms_purchase_diagnostics d on d.order_id=o.id where d.order_id is not null or o.state='review'
  union all
  select 'social',i.created_at,p.email,i.request_id::text,i.service_id::text,'SUPPLIER_BALANCE_INSUFFICIENT','not_dispatched',null::integer,null::bigint,null::bigint
  from public.astros_social_incidents i join accounts p on p.id=i.user_id
  union all
  select 'social',o.updated_at,p.email,o.id::text,o.service_id::text,coalesce(o.diagnostic,'REVIEW_PENDING'),o.state,null::integer,o.price_cents,o.refund_cents
  from public.astros_social_orders o join accounts p on p.id=o.user_id where o.diagnostic is not null or o.state='review'
  union all
  select 'desban',j.updated_at,p.email,j.id::text,null::text,case when j.state='review' then 'RECONCILIATION_REVIEW' else 'SUBMISSION_FAILED' end,j.state,null::integer,j.amount_cents,null::bigint
  from public.astros_service_jobs j join accounts p on p.id=j.user_id where j.state in ('review','failed')
  union all
  select 'payment',o.updated_at,p.email,o.id::text,null::text,'PAYMENT_NOT_APPROVED',case when o.status ~ '^[a-z_]{1,40}$' then o.status else 'unknown' end,null::integer,o.amount_cents,null::bigint
  from public.astros_payment_orders o join accounts p on p.id=o.user_id where o.live_mode and o.status in ('rejected','cancelled','canceled','failed','error','expired')
 ), reference_records as (
  select 'sms'::text module,o.created_at,o.updated_at,p.email,o.id::text reference_id,o.service_id::text service_ref,left(o.service_name,160) title,o.state,o.price_cents amount_cents,null::bigint refund_cents
  from public.astros_sms_orders o join accounts p on p.id=o.user_id where ref<>'' and (lower(o.id::text)=ref or o.service_id::text=regexp_replace(ref,'^#\s*',''))
  union all
  select 'social',o.created_at,o.updated_at,p.email,o.id::text,o.service_id::text,left(o.title,160),o.state,o.price_cents,o.refund_cents
  from public.astros_social_orders o join accounts p on p.id=o.user_id where ref<>'' and (lower(o.id::text)=ref or o.service_id::text=regexp_replace(ref,'^#\s*',''))
  union all
  select 'desban',o.created_at,o.updated_at,p.email,o.id::text,null::text,'Solicitação de desbanimento',o.state,o.amount_cents,null::bigint
  from public.astros_service_jobs o join accounts p on p.id=o.user_id where ref<>'' and lower(o.id::text)=ref
  union all
  select 'payment',o.created_at,o.updated_at,p.email,o.id::text,null::text,'Recarga',case when o.status ~ '^[a-z_]{1,40}$' then o.status else 'unknown' end,o.amount_cents,null::bigint
  from public.astros_payment_orders o join accounts p on p.id=o.user_id where o.live_mode and ref<>'' and lower(o.id::text)=ref
 ), matched as (select * from reference_records where module_filter='all' or module=module_filter), filtered as (
  select * from events where (module_filter='all' or module=module_filter)
  and ((ref='' and occurred_at>=a and occurred_at<b) or (ref<>'' and (lower(reference_id)=ref or lower(service_ref)=regexp_replace(ref,'^#\s*',''))))
 )
 select jsonb_build_object('version',1,'generatedAt',clock_timestamp(),'scope',case when ref='' then 'period' else 'reference_all_dates' end,
 'total',(select count(*) from filtered),
 'byModule',coalesce((select jsonb_object_agg(module,n) from(select module,count(*) n from filtered group by module)x),'{}'::jsonb),
 'matchedRecords',(select count(*) from matched),
 'records',coalesce((select jsonb_agg(x) from(select * from matched order by updated_at desc,reference_id limit 10)x),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(x) from(select module,occurred_at,email,reference_id,service_ref,category,state,http_status,amount_cents,refund_cents from filtered order by occurred_at desc,reference_id limit 12)x),'[]'::jsonb),
 'health',jsonb_build_array(
  jsonb_build_object('module','desban','enabled',null,'workerAt',(select last_seen from public.astros_service_worker_status where id=true),'workerFresh',coalesce((select last_seen>clock_timestamp()-interval '3 minutes' from public.astros_service_worker_status where id=true),false)),
  (select jsonb_build_object('module','sms','enabled',enabled,'workerAt',worker_at,'workerFresh',coalesce(worker_at>clock_timestamp()-interval '3 minutes',false)) from public.astros_sms_settings where id=true),
  (select jsonb_build_object('module','social','enabled',enabled,'workerAt',worker_at,'workerFresh',coalesce(worker_at>clock_timestamp()-interval '3 minutes',false),'catalogAt',catalog_at,'catalogFailed',coalesce(catalog_error,false)) from public.astros_social_settings where id=true),
  (select jsonb_build_object('module','payment','enabled',enabled,'liveMode',live_mode,'workerAt',null,'workerFresh',null) from public.astros_payment_settings where id=true)
 ),
 'coverage',jsonb_build_object('operationalRecords',true,'providerRawPayloads',false,'platformRuntimeLogs',false,'browserConsole',false,'sourceCode',false),
 'limitations',jsonb_build_array('Até 12 ocorrências recentes; totais abrangem todos os registros do filtro.','Referência exata pesquisa ocorrências de todas as datas, mantendo os filtros de cliente e módulo.','Ausência de ocorrências registradas não comprova ausência de bugs.','Recusa de pagamento ou do fornecedor não significa necessariamente um defeito da aplicação.','Rotina recente não garante disponibilidade ao vivo.','Não inclui senhas, tokens, códigos SMS, payloads ou mensagens brutas dos fornecedores.','Logs internos do Supabase/Lovable, console do navegador e código-fonte não são consultados por esta função.')) into result;
 return result;
end;$$;
revoke all on function public.astros_assistant_diagnostics(date,date,text,text,text) from public,anon;
grant execute on function public.astros_assistant_diagnostics(date,date,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
