-- Additive, inert until the owner explicitly confirms a single deletion.
begin;
create table if not exists public.astros_deletion_owners (
 user_id uuid primary key references auth.users(id)
);
-- Preserve saved owners; no permissions are inferred from editable metadata.
insert into public.astros_deletion_owners(user_id)
 select u.id from auth.users u join public.painel_de_desbanimento p on p.id=u.id
 where lower(u.email)='eudezioj@gmail.com' and p.tipo_usuario='admin'
 and u.email_confirmed_at is not null on conflict do nothing;
create table if not exists public.astros_deletion_previews (
 id uuid primary key default gen_random_uuid(), actor uuid not null, target_id uuid not null,
 revision text not null, created_at timestamptz not null default clock_timestamp()
);
create index if not exists astros_deletion_preview_age on public.astros_deletion_previews(created_at);
-- Receipt deliberately has no target UUID/email/name, free-text reason or row payload.
create table if not exists public.astros_deletion_receipts (
 id uuid primary key, actor uuid not null, subject_hash text not null,
 removed jsonb not null, created_at timestamptz not null default clock_timestamp()
);
alter table public.astros_deletion_owners enable row level security;
alter table public.astros_deletion_previews enable row level security;
alter table public.astros_deletion_receipts enable row level security;
revoke all on public.astros_deletion_owners,public.astros_deletion_previews,public.astros_deletion_receipts from public,anon,authenticated;
grant all on public.astros_deletion_owners,public.astros_deletion_previews,public.astros_deletion_receipts to service_role;

create or replace function public.astros_deletion_actor() returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or not exists (
  select 1 from public.astros_deletion_owners o
  join public.painel_de_desbanimento p on p.id=o.user_id
  join auth.users u on u.id=p.id
  where o.user_id=actor and p.tipo_usuario='admin' and u.email_confirmed_at is not null
   and (u.banned_until is null or u.banned_until<=clock_timestamp())
   and coalesce(u.raw_app_meta_data->>'astros_password_change_required','false')<>'true'
 ) then raise exception 'Exclusão disponível somente para o proprietário autorizado.'; end if;
 return actor;
end $$;
create or replace function public.astros_deletion_access() returns boolean
language plpgsql security definer set search_path='' as $$
begin perform public.astros_deletion_actor(); return true;
exception when raise_exception then return false;
end $$;
-- Ordered allowlist; unknown tables/references fail closed, never auto-delete by discovery.
create or replace function public.astros_deletion_rules()
returns table(priority integer, table_name text, predicate text)
language sql immutable set search_path='' as $$
 values
(0,'astros_sms_review_actions','order_id in (select id from public.astros_sms_orders where user_id=$1)'),
(1,'astros_sms_purchase_diagnostics','order_id in (select id from public.astros_sms_orders where user_id=$1)'),
(2,'astros_sms_five_cancels','order_id in (select id from public.astros_sms_orders where user_id=$1)'),
(3,'astros_social_actions','order_id in (select id from public.astros_social_orders where user_id=$1)'),
(4,'astros_social_notes','order_id in (select id from public.astros_social_orders where user_id=$1)'),
(5,'astros_cnpj_calls','request_id in (select id from public.astros_cnpj_requests where user_id=$1)'),
(6,'astros_prospect_dispatches','request_id in (select id from public.astros_prospect_requests where user_id=$1)'),
(7,'astros_activity_reads','user_id=$1'),
(8,'astros_lead_followups','user_id=$1'),
(9,'astros_instagram_requests','user_id=$1'),
(10,'astros_reviews_requests','user_id=$1'),
(11,'astros_prospect_deliveries','user_id=$1'),
(12,'astros_cnpj_deliveries','user_id=$1'),
(13,'astros_prospect_requests','user_id=$1'),
(14,'astros_cnpj_requests','user_id=$1'),
(15,'astros_sms_orders','user_id=$1'),
(16,'astros_sms_quotes','user_id=$1'),
(17,'astros_sms_limits','user_id=$1'),
(18,'astros_social_incidents','user_id=$1'),
(19,'astros_social_orders','user_id=$1'),
(20,'astros_social_quotes','user_id=$1'),
(21,'astros_social_limits','user_id=$1'),
(22,'astros_service_jobs','user_id=$1'),
(23,'astros_api_logs','user_id=$1'),
(24,'astros_client_api_access','user_id=$1'),
(25,'astros_admin_password_resets','user_id=$1'),
(26,'astros_assistant_limits','user_id=$1'),
(27,'astros_module_clients','user_id=$1'),
(28,'astros_affiliate_events','user_id=$1'),
(29,'astros_affiliate_commissions','user_id=$1'),
(30,'astros_affiliate_referrals','user_id=$1'),
(31,'astros_affiliate_accounts','user_id=$1'),
(32,'astros_payment_orders','user_id=$1'),
(33,'astros_wallet_movements','user_id=$1'),
(34,'astros_manual_credits','user_id=$1'),
(35,'astros_legacy_client_imports','user_id=$1'),
(36,'astros_module_audit','target=$1'),
(37,'astros_affiliate_admin_audit','target_id=$1'),
(38,'backup_desbanimento','lower(btrim(email::text))=$2'),
(39,'painel_de_desbanimento','id=$1')
$$;

create or replace function public.astros_deletion_snapshot(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.painel_de_desbanimento; actor uuid:=public.astros_deletion_actor();
 r record; c record; n bigint; fingerprint text; records jsonb:='[]'; blockers jsonb:='[]';
 fingerprints text:=''; covered text; matched text; balance bigint; joined text;
begin
 select * into p from public.painel_de_desbanimento where id=target;
 if not found or target=actor or p.tipo_usuario is distinct from 'cliente'
 or not exists(select 1 from auth.users u where u.id=target and lower(u.email)=lower(p.email))
 then raise exception 'Escolha uma conta de cliente válida; administradores e a própria conta são protegidos.'; end if;
 balance:=round(coalesce(p.recarga,0)*100);
 if balance<0 then blockers:=blockers||jsonb_build_array('A conta possui ajuste financeiro negativo pendente.'); end if;
 -- Terminal allowlists include only locally reconciled states. Age is never settlement proof.
 for r in select * from (values
 ('astros_service_jobs','state not in (''completed'',''failed'')','Há envio de número em processamento ou conferência.'),
 ('astros_sms_orders','state not in (''received'',''refunded'')','Há ativação SMS pendente ou em conferência (SMSPool ou 5SIM).'),
 ('astros_social_orders','state not in (''completed'',''partial'',''refunded'')','Há pedido de redes sociais em andamento ou conferência.'),
 ('astros_prospect_requests','state not in (''completed'',''failed'')','Há busca Maps na fila ou em processamento.'),
 ('astros_cnpj_requests','state not in (''completed'',''failed'')','Há consulta ou enriquecimento CNPJ em processamento.'),
 ('astros_instagram_requests','state not in (''completed'',''failed'')','Há consulta Instagram em processamento.'),
 ('astros_reviews_requests','state not in (''completed'',''failed'')','Há consulta de avaliações em processamento.'),
 ('astros_payment_orders','status not in (''approved'',''rejected'',''cancelled'',''refunded'',''charged_back'')','Há pagamento ou reembolso pendente de confirmação.'),
 ('astros_admin_password_resets','state=''processing''','Há alteração de senha em processamento.'),
 ('astros_legacy_client_imports','state=''pending''','Há importação de conta em processamento.')
 ) checks(table_name,predicate,message) loop
  if to_regclass(format('public.%I',r.table_name)) is not null then
   execute format('select count(*) from public.%I where user_id=$1 and (%s)',r.table_name,r.predicate) into n using target;
   if n>0 then blockers:=blockers||jsonb_build_array(r.message); end if;
  end if;
 end loop;
 if to_regclass('public.astros_sms_review_actions') is not null then
  select count(*) into n from public.astros_sms_review_actions a join public.astros_sms_orders o on o.id=a.order_id
  where o.user_id=target and a.state in ('processing','uncertain');
  if n>0 then blockers:=blockers||jsonb_build_array('Há ação de conferência SMS ainda não concluída.'); end if;
 end if;
 if to_regclass('public.astros_social_actions') is not null then
  select count(*) into n from public.astros_social_actions a join public.astros_social_orders o on o.id=a.order_id
  where o.user_id=target and a.state in ('pending','accepted','uncertain');
  if n>0 then blockers:=blockers||jsonb_build_array('Há cancelamento ou reposição social aguardando conclusão.'); end if;
 end if;
 if to_regclass('public.astros_affiliate_commissions') is not null then
  select count(*) into n from public.astros_affiliate_commissions
  where (user_id=target or referrer_id=target) and (pending or revision<>processed_revision or granted_cents>reversed_cents);
  if n>0 then blockers:=blockers||jsonb_build_array('Há comissões vinculadas, pendentes ou ainda não estornadas.'); end if;
 end if;
 -- Do not free shared provider capacity by erasing dispatches still counted in active quotas.
 for r in select * from public.astros_deletion_rules() where table_name in ('astros_prospect_dispatches','astros_cnpj_calls','astros_instagram_requests','astros_reviews_requests') loop
  if to_regclass(format('public.%I',r.table_name)) is null then continue; end if;
  execute format('select count(*) from public.%I where (%s) and (created_at>=date_trunc(''day'',clock_timestamp() at time zone ''America/Fortaleza'') at time zone ''America/Fortaleza'' or created_at>clock_timestamp()-interval ''1 hour'')',r.table_name,r.predicate) into n using target;
  if n>0 then blockers:=blockers||jsonb_build_array('Há consultas ainda contabilizadas nas cotas atuais. Aguarde encerrar o dia e a janela de uma hora para excluir.'); exit; end if;
 end loop;
 if to_regclass('public.astros_prospect_capacity') is not null then
  for r in select * from public.astros_deletion_rules() where table_name in ('astros_prospect_dispatches','astros_instagram_requests','astros_reviews_requests') loop
   if to_regclass(format('public.%I',r.table_name)) is null then continue; end if;
   execute format('select count(*) from public.%I where (%s) and created_at>=(select reserved_after from public.astros_prospect_capacity where id=true)',r.table_name,r.predicate) into n using target;
   if n>0 then blockers:=blockers||jsonb_build_array('Aguarde a atualização da capacidade do fornecedor antes de remover estas consultas.'); exit; end if;
  end loop;
 end if;
 -- Cross-account referral/history is never removed as if it belonged to the target.
 if to_regclass('public.astros_affiliate_referrals') is not null then
  select count(*) into n from public.astros_affiliate_referrals where referrer_id=target and user_id<>target;
  if n>0 then blockers:=blockers||jsonb_build_array('Esta conta possui clientes indicados. Os vínculos precisam de tratamento separado.'); end if;
 end if;
 for r in select * from public.astros_deletion_rules() order by priority loop
  if to_regclass(format('public.%I',r.table_name)) is null then continue; end if;
  execute format('select count(*),coalesce(md5(string_agg(md5(to_jsonb(t)::text),'''' order by md5(to_jsonb(t)::text))),'''') from public.%I t where %s',r.table_name,r.predicate)
   into n,fingerprint using target,lower(btrim(p.email));
  fingerprints:=fingerprints||r.table_name||':'||n||':'||fingerprint||';';
  if n>0 then records:=records||jsonb_build_array(jsonb_build_object('table',r.table_name,'count',n)); end if;
 end loop;
 -- Detect exact UUID and email field references outside the owned predicates, including custom backups.
 for c in select a.attname col,t.relname tab,a.atttypid::regtype::text typ
  from pg_catalog.pg_attribute a join pg_catalog.pg_class t on t.oid=a.attrelid
  join pg_catalog.pg_namespace s on s.oid=t.relnamespace
  where s.nspname='public' and t.relkind in ('r','p') and a.attnum>0 and not a.attisdropped
   and t.relname not in ('astros_deletion_owners','astros_deletion_previews','astros_deletion_receipts')
   and (a.atttypid='uuid'::regtype or (a.attname ilike '%email%' and a.atttypid in ('text'::regtype,'varchar'::regtype)))
 loop
  select predicate into covered from public.astros_deletion_rules() where table_name=c.tab;
  matched:=case when c.typ='uuid' then format('%I=$1',c.col) else format('lower(btrim(%I::text))=$2',c.col) end;
  execute format('select count(*) from public.%I where (%s) and not coalesce((%s),false)',c.tab,matched,coalesce(covered,'false')) into n using target,lower(btrim(p.email));
  if n>0 then blockers:=blockers||jsonb_build_array('Vínculo adicional exige revisão: '||c.tab||'.'||c.col||' ('||n||').'); end if;
 end loop;
 -- Also protect dependent rows without a direct user_id, including unexpected ON DELETE CASCADE FKs.
 for c in select f.oid,f.conrelid,f.confrelid,f.conkey,f.confkey,ch.relname child,pa.relname parent,
  rule.predicate parent_predicate from pg_catalog.pg_constraint f
  join pg_catalog.pg_class ch on ch.oid=f.conrelid join pg_catalog.pg_namespace ns on ns.oid=ch.relnamespace
  join pg_catalog.pg_class pa on pa.oid=f.confrelid join pg_catalog.pg_namespace pn on pn.oid=pa.relnamespace
  join public.astros_deletion_rules() rule on rule.table_name=pa.relname
  where f.contype='f' and ns.nspname='public' and pn.nspname='public'
 loop
  select string_agg(format('child.%I=parent.%I',ca.attname,pa.attname),' and ' order by k.ord)
   into joined from unnest(c.conkey,c.confkey) with ordinality k(child_key,parent_key,ord)
   join pg_catalog.pg_attribute ca on ca.attrelid=c.conrelid and ca.attnum=k.child_key
   join pg_catalog.pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=k.parent_key;
  select predicate into covered from public.astros_deletion_rules() where table_name=c.child;
  execute format('select count(*) from public.%I child where exists(select 1 from public.%I parent where (%s) and (%s)) and not coalesce((%s),false)',c.child,c.parent,joined,c.parent_predicate,coalesce(covered,'false'))
   into n using target,lower(btrim(p.email));
  if n>0 then blockers:=blockers||jsonb_build_array('Registros dependentes exigem revisão: '||c.child||' ('||n||').'); end if;
 end loop;
 return jsonb_build_object('clientId',target,'email',p.email,'name',coalesce(p.nome,'Cliente'),'balanceCents',balance,
  'records',records,'blockers',blockers,'revision',md5(fingerprints||blockers::text));
end $$;

create or replace function public.astros_deletion_preview(target uuid) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' set statement_timeout='15s' as $$
<<deletion>>
declare actor uuid:=public.astros_deletion_actor(); snapshot jsonb; ticket uuid;
begin
 -- Same lock order as execution. Does not block access or alter the customer.
 perform 1 from public.painel_de_desbanimento where id=target for update;
 snapshot:=public.astros_deletion_snapshot(target);
 delete from public.astros_deletion_previews t where t.actor=deletion.actor and (t.target_id=target or t.created_at<clock_timestamp()-interval '10 minutes');
 insert into public.astros_deletion_previews(actor,target_id,revision) values(actor,target,snapshot->>'revision') returning id into ticket;
 return (snapshot-'revision')||jsonb_build_object('previewId',ticket,'expiresAt',clock_timestamp()+interval '10 minutes');
end $$;

create or replace function public.astros_deletion_execute(target uuid, ticket uuid, confirmation_email text, acknowledge_balance boolean, acknowledge_external boolean) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' set statement_timeout='15s' as $$
<<deletion>>
declare actor uuid:=public.astros_deletion_actor(); snapshot jsonb; preview public.astros_deletion_previews;
 receipt public.astros_deletion_receipts; c record; r record; n bigint; removed jsonb:='[]'; claims jsonb;
 subject text:=md5(target::text||':'||lower(btrim(confirmation_email)));
begin
 if target is null or ticket is null or confirmation_email is null or acknowledge_external is distinct from true then raise exception 'Confira o e-mail e confirme o tratamento dos serviços externos.'; end if;
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}');
 if not exists(select 1 from jsonb_array_elements(coalesce(claims->'amr','[]')) a
  where a->>'method'='password' and (a->>'timestamp')::numeric between extract(epoch from clock_timestamp())-120 and extract(epoch from clock_timestamp())+30)
 then raise exception 'Confirme novamente sua senha de proprietário.'; end if;
 -- Serialize identical attempts before checking the receipt; a timeout can be retried safely.
 perform pg_advisory_xact_lock(hashtextextended('account-deletion:'||ticket::text,0));
 select * into receipt from public.astros_deletion_receipts where id=ticket;
 if found then
  if receipt.actor<>actor or receipt.subject_hash<>subject then raise exception 'Referência de exclusão divergente.'; end if;
  return jsonb_build_object('success',true,'repeated',true,'removed',receipt.removed);
 end if;
 perform 1 from public.painel_de_desbanimento where id=target for update;
 perform 1 from auth.users where id=target for update;
 select * into preview from public.astros_deletion_previews where id=ticket and target_id=target and astros_deletion_previews.actor=deletion.actor for update;
 if not found or preview.created_at<clock_timestamp()-interval '10 minutes' then raise exception 'A prévia expirou. Faça uma nova conferência.'; end if;
 snapshot:=public.astros_deletion_snapshot(target);
 if snapshot->>'email' is distinct from confirmation_email then raise exception 'Digite exatamente o e-mail da conta selecionada.'; end if;
 if jsonb_array_length(snapshot->'blockers')>0 then raise exception 'Existem pendências. Faça uma nova conferência.'; end if;
 if preview.revision is distinct from snapshot->>'revision' then raise exception 'Os dados da conta mudaram. Faça uma nova conferência.'; end if;
 if (snapshot->>'balanceCents')::bigint>0 and acknowledge_balance is distinct from true then raise exception 'Confirme o destino do saldo antes de excluir.'; end if;
 for r in select * from public.astros_deletion_rules() order by priority loop
  if to_regclass(format('public.%I',r.table_name)) is null then continue; end if;
  execute format('delete from public.%I where %s',r.table_name,r.predicate) using target,lower(btrim(confirmation_email));
  get diagnostics n=row_count;
  if n>0 then removed:=removed||jsonb_build_array(jsonb_build_object('table',r.table_name,'count',n)); end if;
 end loop;
 delete from public.astros_deletion_previews where target_id=target;
 -- Known Auth-owned rows, including legacy text user IDs, never another account's sessions.
 for r in select unnest(array['refresh_tokens','flow_state','one_time_tokens','identities','sessions','mfa_factors']) table_name loop
  if exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=to_regclass(format('auth.%I',r.table_name)) and a.attname='user_id' and a.attnum>0 and not a.attisdropped) then
   execute format('delete from auth.%I where user_id::text=$1',r.table_name) using target::text;
   get diagnostics n=row_count;
   if n>0 then removed:=removed||jsonb_build_array(jsonb_build_object('table','auth.'||r.table_name,'count',n)); end if;
  end if;
 end loop;
 -- Auth cascades identities/sessions/refresh tokens. Any unexpected FK aborts the entire transaction.
 delete from auth.users where id=target and lower(email)=lower(confirmation_email);
 get diagnostics n=row_count;
 removed:=removed||jsonb_build_array(jsonb_build_object('table','auth.users','count',n));
 if n<>1 then raise exception 'Não foi possível confirmar a remoção do login.'; end if;
 if exists(select 1 from public.painel_de_desbanimento where id=target) or exists(select 1 from auth.users where id=target) then raise exception 'A remoção não foi concluída.'; end if;
 -- Final exact-identity check, including custom public backups; a residue rolls back everything.
 for c in select a.attname col,t.relname tab,a.atttypid::regtype::text typ
  from pg_catalog.pg_attribute a join pg_catalog.pg_class t on t.oid=a.attrelid
  join pg_catalog.pg_namespace s on s.oid=t.relnamespace
  where s.nspname='public' and t.relkind in ('r','p') and a.attnum>0 and not a.attisdropped
   and t.relname not in ('astros_deletion_owners','astros_deletion_previews','astros_deletion_receipts')
   and (a.atttypid='uuid'::regtype or (a.attname ilike '%email%' and a.atttypid in ('text'::regtype,'varchar'::regtype)))
 loop
  execute format('select count(*) from public.%I where %s',c.tab,
   case when c.typ='uuid' then format('%I=$1',c.col) else format('lower(btrim(%I::text))=$2',c.col) end)
   into n using target,lower(btrim(confirmation_email));
  if n>0 then raise exception 'Restaram vínculos. A exclusão foi desfeita; faça uma nova conferência.'; end if;
 end loop;
 for c in select t.relname tab,a.attname col from pg_catalog.pg_attribute a
  join pg_catalog.pg_class t on t.oid=a.attrelid join pg_catalog.pg_namespace s on s.oid=t.relnamespace
  where s.nspname='auth' and t.relkind in ('r','p') and a.attnum>0 and not a.attisdropped
   and a.attname='user_id' and a.atttypid in ('uuid'::regtype,'text'::regtype,'varchar'::regtype)
 loop
  execute format('select count(*) from auth.%I where %I::text=$1',c.tab,c.col) into n using target::text;
  if n>0 then raise exception 'Restaram vínculos. A exclusão foi desfeita; faça uma nova conferência.'; end if;
 end loop;
 insert into public.astros_deletion_receipts(id,actor,subject_hash,removed) values(ticket,actor,subject,removed);
 return jsonb_build_object('success',true,'repeated',false,'removed',removed);
end $$;
revoke all on function public.astros_deletion_actor(),public.astros_deletion_rules(),public.astros_deletion_snapshot(uuid),public.astros_deletion_access(),public.astros_deletion_preview(uuid),public.astros_deletion_execute(uuid,uuid,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.astros_deletion_access(),public.astros_deletion_preview(uuid),public.astros_deletion_execute(uuid,uuid,text,boolean,boolean) to authenticated;
commit;
