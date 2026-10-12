begin;
create table public.astros_service_jobs (
 id uuid primary key, user_id uuid not null references public.painel_de_desbanimento(id), number text not null,
 kind text not null check(kind in ('new','renew','resend')), amount_cents bigint not null check(amount_cents>=0),
 target_status text not null check(target_status in ('EM ANÁLISE PELA META','REEDESBANIMENTO')),
 state text not null default 'processing' check(state in ('processing','completed','failed','review')),
 result jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.astros_service_jobs enable row level security;
revoke all on public.astros_service_jobs from anon,authenticated;
grant select on public.astros_service_jobs to authenticated;
grant all on public.astros_service_jobs to service_role;
create policy astros_service_jobs_read on public.astros_service_jobs for select to authenticated using(user_id=auth.uid() or public.astros_is_admin());
create unique index astros_number_in_progress on public.astros_service_jobs(number) where state in ('processing','review');
create or replace function public.astros_start_service(request_id uuid, client_id uuid, phone text, service_kind text, expected_cents bigint, target text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old_job public.astros_service_jobs; price bigint; balance numeric;
begin
 if phone !~ '^[0-9]{10,11}$' or service_kind not in ('new','renew','resend') then raise exception 'Solicitação inválida'; end if;
 perform pg_advisory_xact_lock(hashtextextended(phone,0));
 select * into old_job from public.astros_service_jobs where id=request_id;
 if found then
  if old_job.user_id<>client_id or old_job.number<>phone then raise exception 'Referência divergente'; end if;
  return coalesce(old_job.result,jsonb_build_object('success',false,'state',old_job.state,'message','A solicitação já está em andamento ou aguardando conferência.'))||jsonb_build_object('execute',false);
 end if;
 if exists(select 1 from public.astros_service_jobs where number=phone and state in ('processing','review')) then raise exception 'Este número já possui um envio em andamento ou aguardando conferência'; end if;
 if service_kind='resend' then
  price=0;
  if target<>'REEDESBANIMENTO' then raise exception 'Status divergente'; end if;
 else
  select service_price_cents into price from public.astros_payment_settings where id=true for share;
  if price is null or price<=0 then raise exception 'Taxa não configurada'; end if;
  if target<>'EM ANÁLISE PELA META' then raise exception 'Status divergente'; end if;
 end if;
 if price<>expected_cents then raise exception 'A taxa mudou. Confira o valor antes de confirmar.'; end if;
 select recarga into balance from public.painel_de_desbanimento where id=client_id for update;
 if not found then raise exception 'Conta não encontrada'; end if;
 if coalesce(balance,0)*100<price then raise exception 'Saldo insuficiente'; end if;
 insert into public.astros_service_jobs(id,user_id,number,kind,amount_cents,target_status) values(request_id,client_id,phone,service_kind,price,target);
 if price>0 then perform public.astros_debit_wallet(client_id,price,'service:'||request_id::text); end if;
 return jsonb_build_object('execute',true,'requestId',request_id,'costCents',price,'targetStatus',target,'number',phone);
end;
$$;
revoke all on function public.astros_start_service(uuid,uuid,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.astros_start_service(uuid,uuid,text,text,bigint,text) to service_role;
create or replace function public.astros_finish_service(request_id uuid, final_state text, response jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.astros_service_jobs; inserted uuid;
begin
 select * into job from public.astros_service_jobs where id=request_id for update;
 if not found or final_state not in ('completed','failed','review') then raise exception 'Solicitação inválida'; end if;
 if job.state='completed' or job.state='failed' then return job.result; end if;
 if final_state='failed' and job.amount_cents>0 then
  insert into public.astros_wallet_movements(user_id,amount_cents,kind,reference) values(job.user_id,job.amount_cents,'reversal','service:'||request_id::text)
  on conflict(kind,reference) do nothing returning id into inserted;
  if inserted is not null then update public.painel_de_desbanimento set recarga=coalesce(recarga,0)+job.amount_cents/100.0 where id=job.user_id; end if;
 end if;
 update public.astros_service_jobs set state=final_state,result=response,updated_at=now() where id=request_id;
 return response;
end;
$$;
revoke all on function public.astros_finish_service(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.astros_finish_service(uuid,text,jsonb) to service_role;
commit;
