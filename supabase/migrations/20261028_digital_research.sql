-- Additive installation. Does not replace Maps/CNPJ, wallet functions, cron or module controls.
begin;
create table if not exists public.astros_digital_settings(
 id boolean primary key default true check(id),enabled boolean not null default false,pilot boolean not null default true,
 version integer not null default 1,daily_requests integer not null default 3 check(daily_requests between 1 and 50),
 daily_usd_cents integer not null default 100 check(daily_usd_cents between 1 and 5000),concurrency integer not null default 1 check(concurrency between 1 and 5),
 tools jsonb not null default '{"instagram_search":{"enabled":false,"unitCents":0,"maxQuantity":20,"maxUsdCents":20},"instagram_profile":{"enabled":false,"unitCents":0,"maxQuantity":10,"maxUsdCents":20},"instagram_followers":{"enabled":false,"unitCents":0,"maxQuantity":50,"maxUsdCents":30}}',updated_at timestamptz not null default now());
create table if not exists public.astros_digital_private(id boolean primary key default true check(id),api_key text not null default '');
create table if not exists public.astros_digital_access(user_id uuid primary key references public.painel_de_desbanimento(id),enabled boolean not null default false);
create table if not exists public.astros_digital_requests(
 id uuid primary key,user_id uuid not null references public.painel_de_desbanimento(id),tool text not null check(tool in ('instagram_search','instagram_profile','instagram_followers')),
 query text not null check(length(query) between 1 and 500),quantity integer not null check(quantity between 1 and 100),
 unit_cents integer not null check(unit_cents between 1 and 10000),reserved_cents integer not null check(reserved_cents between 1 and 1000000),
 max_usd_cents integer not null check(max_usd_cents between 1 and 500),state text not null check(state in ('dispatching','running','completed','review','rejected')),
 run_id text unique,dataset_id text,rows jsonb not null default '[]',delivered integer not null default 0,charged_cents integer not null default 0,
 check_after timestamptz not null default now(),lease_key uuid,lease_until timestamptz,
 created_at timestamptz not null default now(),completed_at timestamptz);
create index if not exists astros_digital_owner on public.astros_digital_requests(user_id,created_at desc,id);
create index if not exists astros_digital_pending on public.astros_digital_requests(state,created_at) where state in ('dispatching','running','review');
create table if not exists public.astros_digital_saved(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.painel_de_desbanimento(id),request_id uuid not null references public.astros_digital_requests(id),username text not null,collection text not null check(length(collection) between 1 and 80),profile jsonb not null,created_at timestamptz not null default now(),unique(user_id,username,collection));
create index if not exists astros_digital_saved_owner on public.astros_digital_saved(user_id,created_at desc,id);
create table if not exists public.astros_digital_audit(id bigint generated always as identity primary key,actor uuid not null,operation text not null,created_at timestamptz not null default now());
insert into public.astros_digital_settings(id) values(true) on conflict do nothing;
insert into public.astros_digital_private(id) values(true) on conflict do nothing;
do $$declare t text;begin foreach t in array array['astros_digital_settings','astros_digital_private','astros_digital_access','astros_digital_requests','astros_digital_saved','astros_digital_audit'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop;end $$;
create or replace function public.astros_digital_identity(actor uuid,administrator boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 if actor is null or not exists(select 1 from public.painel_de_desbanimento p join auth.users u on u.id=p.id where p.id=actor and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()) and coalesce((u.raw_app_meta_data->>'astros_password_change_required')::boolean,false)=false and (not administrator or p.tipo_usuario='admin')) then raise exception 'Conta indisponível';end if;
end $$;
create or replace function public.astros_digital_view(r public.astros_digital_requests,details boolean default false) returns jsonb language sql immutable set search_path='' as $$
 select (to_jsonb(r)-array['run_id','dataset_id','lease_key','lease_until','check_after','max_usd_cents','unit_cents','user_id','rows'])||case when details then jsonb_build_object('rows',r.rows) else '{}'::jsonb end;
$$;
create or replace function public.astros_digital_call(actor uuid,operation text,input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.astros_digital_settings;r public.astros_digital_requests;t jsonb;rows_out jsonb;rid uuid;
 admin boolean;v_tool text;q text;n integer;price integer;balance numeric;total integer;refund integer;page_n integer;key text;v jsonb;candidate jsonb;
 today timestamptz:=date_trunc('day',now() at time zone 'America/Fortaleza') at time zone 'America/Fortaleza';
begin
 perform public.astros_digital_identity(actor);
 select coalesce(tipo_usuario='admin',false) into admin from public.painel_de_desbanimento where id=actor;
 if operation like 'admin-%' and not admin then raise exception 'Acesso administrativo necessário';end if;
 if input is null or jsonb_typeof(input)<>'object' or octet_length(input::text)>1000000 then raise exception 'Pesquisa inválida.';end if;
 if operation in ('config','admin-config') then
  select * into s from public.astros_digital_settings where id;
  return jsonb_build_object('installed',true,'enabled',s.enabled and (admin or not s.pilot) and coalesce((select enabled from public.astros_digital_access where user_id=actor),true),'pilot',s.pilot,'version',s.version,'tools',s.tools)||case when admin and operation='admin-config' then jsonb_build_object('dailyRequests',s.daily_requests,'dailyUsdCents',s.daily_usd_cents,'concurrency',s.concurrency,'hasKey',exists(select 1 from public.astros_digital_private where id and api_key<>'')) else '{}'::jsonb end;
 end if;
 if operation='admin-save' then
  select * into s from public.astros_digital_settings where id for update;
  if (input->>'version')::integer<>s.version then raise exception 'Configuração alterada. Recarregue antes de salvar.';end if;
  t:=input->'tools';key:=coalesce(input->>'apiKey','');
  if jsonb_typeof(t)<>'object' or not t ?& array['instagram_search','instagram_profile','instagram_followers'] or (select count(*) from jsonb_object_keys(t))<>3 or length(key)>200 or (key<>'' and key!~'^[A-Za-z0-9_-]{20,200}$') or (input->>'enabled')::boolean is null or (input->>'pilot')::boolean is null or coalesce((input->>'dailyRequests')::integer,0) not between 1 and 50 or coalesce((input->>'dailyUsdCents')::integer,0) not between 1 and 5000 or coalesce((input->>'concurrency')::integer,0) not between 1 and 5 then raise exception 'Configuração inválida.';end if;
  for v_tool,v in select * from jsonb_each(t) loop
   if jsonb_typeof(v)<>'object' or not v ?& array['enabled','unitCents','maxQuantity','maxUsdCents'] or (v->>'enabled')::boolean is null or coalesce((v->>'unitCents')::integer,-1) not between 0 and 10000 or coalesce((v->>'maxQuantity')::integer,0) not between 1 and (case when v_tool='instagram_profile' then 10 when v_tool='instagram_search' then 50 else 100 end) or coalesce((v->>'maxUsdCents')::integer,0) not between 1 and 500 or ((v->>'enabled')::boolean and (v->>'unitCents')::integer=0) then raise exception 'Configure preço e limites de cada ferramenta.';end if;
  end loop;
  if key<>'' and exists(select 1 from public.astros_digital_requests where state in ('dispatching','running','review')) then raise exception 'Confira as pesquisas pendentes antes de trocar a chave.';end if;
  if key<>'' then update public.astros_digital_private set api_key=key where id;end if;
  if (input->>'enabled')::boolean and to_regprocedure('public.astros_digital_finance_ready()') is null then raise exception 'Instale o complemento financeiro antes de ativar.';end if;
  if (input->>'enabled')::boolean and not exists(select 1 from public.astros_digital_private where id and api_key<>'') then raise exception 'Configure a chave Apify antes de ativar.';end if;
  update public.astros_digital_settings set enabled=(input->>'enabled')::boolean,pilot=(input->>'pilot')::boolean,tools=t,daily_requests=(input->>'dailyRequests')::integer,daily_usd_cents=(input->>'dailyUsdCents')::integer,concurrency=(input->>'concurrency')::integer,version=version+1,updated_at=now() where id;
  insert into public.astros_digital_audit(actor,operation) values(actor,operation);
  return jsonb_build_object('saved',true);
 end if;
 if operation='admin-access' then
  perform public.astros_digital_identity((input->>'userId')::uuid);
  if (input->>'enabled')::boolean is null then raise exception 'Configuração inválida.';end if;
  insert into public.astros_digital_access(user_id,enabled) values((input->>'userId')::uuid,(input->>'enabled')::boolean) on conflict(user_id) do update set enabled=excluded.enabled;
  insert into public.astros_digital_audit(actor,operation) values(actor,operation);return jsonb_build_object('saved',true);
 end if;
 if operation in ('history','admin-history','collections') then
  page_n:=coalesce((input->>'page')::integer,0);if page_n not between 0 and 10000 then raise exception 'Página inválida.';end if;
  if operation='collections' then select coalesce(jsonb_agg(to_jsonb(x)-array['user_id','request_id','username']),'[]') into rows_out from (select * from public.astros_digital_saved where user_id=actor order by created_at desc,id limit 21 offset page_n*20)x;
  else select coalesce(jsonb_agg(public.astros_digital_view(x,false)),'[]') into rows_out from (select * from public.astros_digital_requests where user_id=actor or operation='admin-history' order by created_at desc,id limit 21 offset page_n*20)x;end if;
  return jsonb_build_object('rows',rows_out);
 end if;
 if operation='admin-usage' then
  return jsonb_build_object('reservedUsdCents',(select coalesce(sum(max_usd_cents),0) from public.astros_digital_requests where created_at>=today),'pending',(select count(*) from public.astros_digital_requests where state in ('dispatching','running','review')),'review',(select count(*) from public.astros_digital_requests where state='review' or state='dispatching' and created_at<now()-interval '2 minutes'),'reservedCents',(select coalesce(sum(reserved_cents),0) from public.astros_digital_requests where state in ('dispatching','running','review')),'chargedCents',(select coalesce(sum(charged_cents),0) from public.astros_digital_requests),'delivered',(select coalesce(sum(delivered),0) from public.astros_digital_requests),'requests',(select count(*) from public.astros_digital_requests));
 end if;
 if operation='start' then
  rid:=(input->>'requestId')::uuid;v_tool:=input->>'tool';q:=input->>'query';n:=(input->>'quantity')::integer;price:=(input->>'unitCents')::integer;
  if rid is null or v_tool not in ('instagram_search','instagram_profile','instagram_followers') or q is null or length(q) not between 1 and 500 or n is null or price is null then raise exception 'Pesquisa inválida.';end if;
  -- Global serialization reserves capacity/budget before the single allowed external dispatch.
  select * into s from public.astros_digital_settings where id for update;
  select * into r from public.astros_digital_requests where id=rid for update;
  if found then
   if r.user_id<>actor or r.tool<>v_tool or r.query<>q or r.quantity<>n or r.unit_cents<>price then raise exception 'Referência de pesquisa divergente.';end if;
   return jsonb_build_object('execute',false,'request',public.astros_digital_view(r,true));
  end if;
  t:=s.tools->v_tool;
  if not s.enabled or s.pilot and not admin or not coalesce((t->>'enabled')::boolean,false) or exists(select 1 from public.astros_digital_access where user_id=actor and not enabled) then raise exception 'Novas pesquisas estão indisponíveis para esta conta.';end if;
  if (input->>'version')::integer is distinct from s.version or price is distinct from (t->>'unitCents')::integer or price<1 then raise exception 'Confira o preço novamente.';end if;
  if n not between 1 and least((t->>'maxQuantity')::integer,100) then raise exception 'Quantidade inválida.';end if;
  if exists(select 1 from public.astros_digital_requests where user_id=actor and state in ('dispatching','running','review')) then raise exception 'Confira a pesquisa anterior antes de iniciar outra.';end if;
  if (select count(*) from public.astros_digital_requests where user_id=actor and created_at>=today)>=s.daily_requests then raise exception 'Limite diário de pesquisas atingido.';end if;
  if (select count(*) from public.astros_digital_requests where state in ('dispatching','running','review'))>=s.concurrency then raise exception 'Capacidade ocupada. Tente mais tarde.';end if;
  if (select coalesce(sum(max_usd_cents),0) from public.astros_digital_requests where created_at>=today)+(t->>'maxUsdCents')::integer>s.daily_usd_cents then raise exception 'Limite diário do fornecedor atingido.';end if;
  select recarga into balance from public.painel_de_desbanimento where id=actor for update;
  total:=price*n;if coalesce(balance,0)*100<total then raise exception 'Saldo insuficiente. Faça uma recarga.';end if;
  update public.painel_de_desbanimento set recarga=recarga-total/100.0 where id=actor;
  insert into public.astros_wallet_movements(user_id,amount_cents,kind,reference) values(actor,-total,'debit','digital:'||rid);
  insert into public.astros_digital_requests(id,user_id,tool,query,quantity,unit_cents,reserved_cents,max_usd_cents,state) values(rid,actor,v_tool,q,n,price,total,(t->>'maxUsdCents')::integer,'dispatching') returning * into r;
  return jsonb_build_object('execute',true,'maxUsdCents',r.max_usd_cents,'request',public.astros_digital_view(r,true));
 end if;
 rid:=coalesce(input->>'id',input->>'requestId')::uuid;
 select * into r from public.astros_digital_requests where id=rid for update;
 if operation='unsave' then
  delete from public.astros_digital_saved where id=rid and user_id=actor;return jsonb_build_object('saved',true);
 end if;
 if not found or (r.user_id<>actor and not admin) then raise exception 'Pesquisa não encontrada na sua conta.';end if;
 if operation in ('status','admin-status') then return public.astros_digital_view(r,true);end if;
 if operation='save' then
  if r.user_id<>actor or r.state<>'completed' then raise exception 'Resultado indisponível.';end if;
  select x into candidate from jsonb_array_elements(r.rows)x where x->>'username'=input->>'username';
  if candidate is null or length(coalesce(input->>'collection','')) not between 1 and 80 then raise exception 'Coleção inválida.';end if;
  perform 1 from public.painel_de_desbanimento where id=actor for update;
  if not exists(select 1 from public.astros_digital_saved where user_id=actor and username=input->>'username' and collection=input->>'collection') and (select count(*) from public.astros_digital_saved where user_id=actor)>=1000 then raise exception 'Limite de 1.000 itens salvos atingido.';end if;
  insert into public.astros_digital_saved(user_id,request_id,username,collection,profile) values(actor,r.id,input->>'username',input->>'collection',candidate) on conflict(user_id,username,collection) do update set profile=excluded.profile,request_id=excluded.request_id;
  return jsonb_build_object('saved',true);
 end if;
 -- Subsequent transitions are reachable only from the authenticated service-only Edge dispatcher.
 if operation='record-run' then
  if r.state<>'dispatching' then return public.astros_digital_view(r,true);end if;
  if coalesce(input->>'runId','')!~'^[A-Za-z0-9]{10,40}$' or coalesce(input->>'datasetId','')!~'^[A-Za-z0-9]{10,40}$' then raise exception 'Referência do fornecedor inválida.';end if;
  update public.astros_digital_requests set run_id=input->>'runId',dataset_id=input->>'datasetId',state='running',check_after=now()+interval '10 seconds' where id=r.id returning * into r;
  return public.astros_digital_view(r,true);
 end if;
 if operation='check-claim' then
  if r.state not in ('running','review') or r.run_id is null or r.check_after>now() or r.lease_until>now() then return '{}'::jsonb;end if;
  update public.astros_digital_requests set lease_key=gen_random_uuid(),lease_until=now()+interval '90 seconds',check_after=now()+interval '15 seconds' where id=r.id returning * into r;
  return jsonb_build_object('lease',r.lease_key,'runId',r.run_id,'datasetId',r.dataset_id,'quantity',r.quantity,'tool',r.tool);
 end if;
 if operation='check-release' then
  if r.lease_key=(input->>'lease')::uuid then update public.astros_digital_requests set lease_key=null,lease_until=null where id=r.id;end if;return '{}'::jsonb;
 end if;
 if operation='review' then
  if r.state in ('dispatching','running') then update public.astros_digital_requests set state='review' where id=r.id;end if;return '{}'::jsonb;
 end if;
 if operation in ('finish','reject') then
  if r.state in ('completed','rejected') then return public.astros_digital_view(r,true);end if;
  if operation='finish' and (r.run_id is null or r.lease_key is distinct from (input->>'lease')::uuid) then raise exception 'Conferência inválida.';end if;
  if operation='reject' and r.state<>'dispatching' then raise exception 'Conferência inválida.';end if;
  rows_out:=case when operation='reject' then '[]'::jsonb else input->'rows' end;
  if rows_out is null or jsonb_typeof(rows_out)<>'array' or jsonb_array_length(rows_out)>r.quantity or octet_length(rows_out::text)>500000 then raise exception 'Resultados não confirmados.';end if;
  n:=jsonb_array_length(rows_out);total:=n*r.unit_cents;refund:=r.reserved_cents-total;
  perform 1 from public.painel_de_desbanimento where id=r.user_id for update;
  if refund>0 then
   update public.painel_de_desbanimento set recarga=recarga+refund/100.0 where id=r.user_id;
   insert into public.astros_wallet_movements(user_id,amount_cents,kind,reference) values(r.user_id,refund,'reversal','digital-refund:'||r.id);
  end if;
  update public.astros_digital_requests set rows=rows_out,delivered=n,charged_cents=total,state=case when operation='reject' then 'rejected' else 'completed' end,lease_key=null,lease_until=null,completed_at=now() where id=r.id returning * into r;
  return public.astros_digital_view(r,true);
 end if;
 raise exception 'Operação indisponível.';
end $$;
revoke all on function public.astros_digital_identity(uuid,boolean),public.astros_digital_view(public.astros_digital_requests,boolean),public.astros_digital_call(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.astros_digital_call(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
