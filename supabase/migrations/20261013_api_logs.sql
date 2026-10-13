begin;
create table if not exists public.astros_api_logs (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.painel_de_desbanimento(id),
 operation text not null check(operation in ('saldo','validar','consultar','enviar','solicitacoes')),
 request_id uuid,number text check(number is null or number ~ '^\+?[0-9]{1,15}$'),country text,
 state text not null check(state in ('ok','valid','quoted','completed','processing','review','failed','error')),
 error_code text check(error_code is null or error_code in ('insufficient_balance','reference_mismatch','value_changed','invalid_data','number_unavailable','service_unavailable','request_failed')),
 http_status integer not null check(http_status between 100 and 599),duration_ms integer not null check(duration_ms between 0 and 300000),
 created_at timestamptz not null default now()
);
create index if not exists astros_api_logs_owner_date on public.astros_api_logs(user_id,created_at desc,id desc);
create index if not exists astros_api_logs_date on public.astros_api_logs(created_at desc,id desc);
alter table public.astros_api_logs enable row level security;
revoke all on public.astros_api_logs from public,anon,authenticated;
grant select on public.astros_api_logs to authenticated;
grant all on public.astros_api_logs to service_role;
drop policy if exists astros_api_logs_read on public.astros_api_logs;
create policy astros_api_logs_read on public.astros_api_logs for select to authenticated using(user_id=auth.uid() or public.astros_is_admin());
create or replace function public.astros_api_record_log(owner_id uuid,api_operation text,reference_id uuid,phone text,selected_country text,result_state text,result_code text,status_code integer,elapsed_ms integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 -- Only the trusted service role can execute this function.
 if selected_country is not null and selected_country !~ '^([A-Z]{2}|custom:[0-9a-f-]{36})$' then raise exception 'País inválido'; end if;
 insert into public.astros_api_logs(user_id,operation,request_id,number,country,state,error_code,http_status,duration_ms)
 values(owner_id,api_operation,reference_id,phone,selected_country,result_state,result_code,status_code,elapsed_ms);
 delete from public.astros_api_logs where id in(select id from public.astros_api_logs where user_id=owner_id order by created_at desc,id desc offset 5000);
 if not exists(select 1 from pg_extension where extname='pg_cron') then delete from public.astros_api_logs where created_at<now()-interval '30 days'; end if;
end $$;
revoke all on function public.astros_api_record_log(uuid,text,uuid,text,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.astros_api_record_log(uuid,text,uuid,text,text,text,text,integer,integer) to service_role;
create or replace function public.astros_api_cleanup_logs() returns bigint
language plpgsql security definer set search_path='' as $$
declare total bigint;
begin
 delete from public.astros_api_logs where created_at<now()-interval '30 days';get diagnostics total=row_count;
 return total;
end $$;
revoke all on function public.astros_api_cleanup_logs() from public,anon,authenticated;
grant execute on function public.astros_api_cleanup_logs() to service_role;
-- Reuse the project's existing pg_cron. Only this new log table is cleaned.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
 if not exists(select 1 from cron.job where jobname='astros-api-log-retention') then
  perform cron.schedule('astros-api-log-retention','20 6 * * *','select public.astros_api_cleanup_logs();');
 end if;
 end if;
end $$;
commit;
