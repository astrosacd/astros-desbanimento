-- Restricted, fixed read queries. Does not grant AI arbitrary SQL or mutation capabilities.
begin;
create table if not exists public.astros_assistant_limits(user_id uuid primary key references public.painel_de_desbanimento(id) on delete cascade,window_at timestamptz not null,calls integer not null);
alter table public.astros_assistant_limits enable row level security;
revoke all on public.astros_assistant_limits from public,anon,authenticated;
create or replace function public.astros_assistant_gate() returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if public.astros_is_admin() is not true then raise exception 'Acesso restrito à administração';end if;
 insert into public.astros_assistant_limits(user_id,window_at,calls) values(auth.uid(),clock_timestamp(),1)
 on conflict(user_id) do update set calls=case when astros_assistant_limits.window_at<clock_timestamp()-interval '1 minute' then 1 else astros_assistant_limits.calls+1 end,window_at=case when astros_assistant_limits.window_at<clock_timestamp()-interval '1 minute' then clock_timestamp() else astros_assistant_limits.window_at end returning calls into n;
 return n<=8;
end;$$;
create or replace function public.astros_assistant_snapshot(date_from date,date_until date,client_search text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare start_at timestamptz;end_at timestamptz;result jsonb;term text:=lower(trim(coalesce(client_search,'')));
begin
 if public.astros_is_admin() is not true then raise exception 'Acesso restrito à administração';end if;
 if date_from is null or date_until is null or date_until<date_from or date_until-date_from>30 or length(term)>100 then raise exception 'Escolha um período de até 31 dias';end if;
 start_at=date_from::timestamp at time zone 'America/Fortaleza';end_at=(date_until+1)::timestamp at time zone 'America/Fortaleza';
 with customers as(select p.id,p.nome,p.email,p.tipo_usuario,u.created_at from public.painel_de_desbanimento p join auth.users u on u.id=p.id where term='' or strpos(lower(coalesce(p.email,'')||' '||coalesce(p.nome,'')),term)>0),
 deposits as(select m.created_at,p.email,p.nome,m.amount_cents from public.astros_wallet_movements m join public.astros_payment_orders o on o.mp_payment_id=m.reference and o.user_id=m.user_id and o.live_mode join customers p on p.id=m.user_id where m.kind='credit' and m.created_at>=start_at and m.created_at<end_at),
 desban as(select j.id,j.created_at,p.email,j.number,j.state,j.amount_cents from public.astros_service_jobs j join customers p on p.id=j.user_id where j.created_at>=start_at and j.created_at<end_at),
 sms as(select j.id,j.created_at,p.email,j.service_name,j.country_name,j.state,j.price_cents from public.astros_sms_orders j join customers p on p.id=j.user_id where j.created_at>=start_at and j.created_at<end_at),
 social as(select j.id,j.created_at,p.email,j.title,j.service_id,j.quantity,j.state,j.price_cents from public.astros_social_orders j join customers p on p.id=j.user_id where j.created_at>=start_at and j.created_at<end_at),
 incidents as(select i.created_at,p.email,i.service_id,i.title,i.reason from public.astros_social_incidents i join customers p on p.id=i.user_id where i.created_at>=start_at and i.created_at<end_at)
 select jsonb_build_object('generatedAt',clock_timestamp(),'from',date_from,'until',date_until,'timezone','America/Fortaleza','clientSearch',term,
 'finance',case when term='' then public.astros_financial_dashboard(date_from,date_until) else null end,
 'customers',jsonb_build_object('registeredInPeriod',(select count(*) from customers where created_at>=start_at and created_at<end_at and tipo_usuario='cliente'),'matchedAccounts',(select count(*) from customers),'recent',coalesce((select jsonb_agg(x) from (select nome,email,created_at from customers where created_at>=start_at and created_at<end_at and tipo_usuario='cliente' order by created_at desc limit 10)x),'[]'::jsonb)),
 'deposits',jsonb_build_object('count',(select count(*) from deposits),'creditedCents',(select coalesce(sum(amount_cents),0) from deposits),'recent',coalesce((select jsonb_agg(x) from (select * from deposits order by created_at desc limit 10)x),'[]'::jsonb)),
 'desban',jsonb_build_object('count',(select count(*) from desban),'review',(select count(*) from desban where state='review'),'recent',coalesce((select jsonb_agg(x) from (select * from desban order by created_at desc limit 10)x),'[]'::jsonb)),
 'sms',jsonb_build_object('count',(select count(*) from sms),'byState',coalesce((select jsonb_object_agg(state,n) from(select state,count(*) n from sms group by state)x),'{}'::jsonb),'recent',coalesce((select jsonb_agg(x) from (select * from sms order by created_at desc limit 10)x),'[]'::jsonb)),
 'social',jsonb_build_object('count',(select count(*) from social),'byState',coalesce((select jsonb_object_agg(state,n) from(select state,count(*) n from social group by state)x),'{}'::jsonb),'recent',coalesce((select jsonb_agg(x) from (select * from social order by created_at desc limit 10)x),'[]'::jsonb)),
 'incidents',jsonb_build_object('count',(select count(*) from incidents),'recent',coalesce((select jsonb_agg(x) from(select * from incidents order by created_at desc limit 10)x),'[]'::jsonb)),
 'moduleStatus',jsonb_build_object('sms',(select jsonb_build_object('purchasesEnabled',enabled,'workerAt',worker_at) from public.astros_sms_settings where id=true),'social',(select jsonb_build_object('purchasesEnabled',enabled,'workerAt',worker_at,'catalogAt',catalog_at,'catalogError',catalog_error) from public.astros_social_settings where id=true)),
 'limitations',jsonb_build_array('Financeiro geral disponível somente sem filtro de cliente.','Listas recentes limitadas a 10 registros; contagens abrangem o período e filtro.','Depósitos são créditos confirmados de produção, não faturamento nem ajustes manuais.','Pedidos criados não significam vendas concluídas: confira o estado.','Estado do desbanimento é o processamento interno; status atual do número no Baserow não foi consultado.','Datas de cadastro são de criação da conta Auth vinculada ao painel; importações podem ter sido criadas em lote.','Horários de rotina não comprovam disponibilidade ao vivo dos fornecedores.')) into result;
 return result;
end;$$;
revoke all on function public.astros_assistant_gate() from public,anon;
revoke all on function public.astros_assistant_snapshot(date,date,text) from public,anon;
grant execute on function public.astros_assistant_gate() to authenticated;
grant execute on function public.astros_assistant_snapshot(date,date,text) to authenticated;
notify pgrst,'reload schema';
commit;
