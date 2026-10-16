-- Adds fixed read-only admin queries. Does not replace existing assistant functions.
begin;
create or replace function public.astros_assistant_extended(date_from date,date_until date,client_search text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a timestamptz;b timestamptz;term text:=lower(trim(coalesce(client_search,'')));result jsonb;
begin
 if public.astros_is_admin() is not true then raise exception 'Acesso restrito à administração';end if;
 if date_from is null or date_until is null or date_until<date_from or date_until-date_from>30 or length(term)>100 then raise exception 'Escolha um período de até 31 dias';end if;
 a=date_from::timestamp at time zone 'America/Fortaleza';b=(date_until+1)::timestamp at time zone 'America/Fortaleza';
 with accounts as(select p.id,p.nome,p.email,p.tipo_usuario,round(coalesce(p.recarga,0)*100)::bigint balance_cents,u.last_sign_in_at,u.created_at from public.painel_de_desbanimento p join auth.users u on u.id=p.id where term='' or strpos(lower(coalesce(p.email,'')||' '||coalesce(p.nome,'')),term)>0),
 movements as(select m.created_at,p.email,m.amount_cents,m.kind,m.reference from public.astros_wallet_movements m join accounts p on p.id=m.user_id where m.created_at>=a and m.created_at<b),
 attempts as(select o.created_at,p.email,o.id,o.method,o.status,o.amount_cents from public.astros_payment_orders o join accounts p on p.id=o.user_id where o.live_mode and o.created_at>=a and o.created_at<b)
 select jsonb_build_object('version',2,'generatedAt',clock_timestamp(),'clientSearch',term,
 'accounts',jsonb_build_object('count',(select count(*) from accounts),'balanceCents',(select coalesce(sum(balance_cents),0) from accounts),'recent',coalesce((select jsonb_agg(x) from(select nome,email,tipo_usuario,balance_cents,last_sign_in_at,created_at from accounts order by created_at desc limit 10)x),'[]'::jsonb),'scope','Contas e saldos atuais, não limitados pelo período; lista de até dez contas.'),
 'ledger',jsonb_build_object('count',(select count(*) from movements),'byKind',coalesce((select jsonb_object_agg(kind,v) from(select kind,jsonb_build_object('count',count(*),'amountCents',sum(amount_cents)) v from movements group by kind)x),'{}'::jsonb),'recent',coalesce((select jsonb_agg(x) from(select * from movements order by created_at desc limit 10)x),'[]'::jsonb)),
 'paymentAttempts',jsonb_build_object('count',(select count(*) from attempts),'byStatus',coalesce((select jsonb_object_agg(status,n) from(select status,count(*) n from attempts group by status)x),'{}'::jsonb),'recent',coalesce((select jsonb_agg(x) from(select * from attempts order by created_at desc limit 10)x),'[]'::jsonb)),
 'currentPending',jsonb_build_object('scope','Pendências atuais de todas as datas, respeitando o filtro de cliente.','desban',(select count(*) from public.astros_service_jobs j join accounts p on p.id=j.user_id where j.state in ('processing','review')),'sms',(select count(*) from public.astros_sms_orders j join accounts p on p.id=j.user_id where j.state in ('dispatching','pending','review')),'social',(select count(*) from public.astros_social_orders j join accounts p on p.id=j.user_id where j.state in ('dispatching','pending','processing','review'))),
 'socialCatalog',jsonb_build_object('total',(select count(*) from public.astros_social_services),'releasedAvailable',(select count(*) from public.astros_social_services where enabled and available),'hidden',(select count(*) from public.astros_social_services where not enabled),'byNetwork',coalesce((select jsonb_object_agg(network,n) from(select coalesce(nullif(network,''),'não classificado') network,count(*) n from public.astros_social_services where enabled and available group by network)x),'{}'::jsonb)),
 'pricing',jsonb_build_object('sms',(select jsonb_build_object('fxBrlPerUsd',usd_brl_units/10000.0,'markupPercent',margin_bps/100.0,'fixedFeeCents',fee_cents) from public.astros_sms_settings where id=true),'social',(select jsonb_build_object('fxBrlPerUsd',fx_units/10000.0,'markupPercent',margin_bps/100.0,'fixedFeeCents',fee_cents) from public.astros_social_settings where id=true),'desbanFeeCents',(select service_price_cents from public.astros_payment_settings where id=true))
 ) into result;return result;
end;$$;
revoke all on function public.astros_assistant_extended(date,date,text) from public,anon;
grant execute on function public.astros_assistant_extended(date,date,text) to authenticated;
notify pgrst,'reload schema';commit;
