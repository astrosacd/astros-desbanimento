begin;
alter table public.astros_service_jobs
 add column if not exists protocol_version integer not null default 1,
 add column if not exists remote_phase text not null default 'legacy',
 add column if not exists remote_intent jsonb,
 add column if not exists lease_key uuid,
 add column if not exists lease_until timestamptz,
 add column if not exists next_check_at timestamptz,
 add column if not exists check_attempts integer not null default 0;
create table if not exists public.astros_service_worker_status(id boolean primary key default true check(id),last_seen timestamptz);
alter table public.astros_service_worker_status enable row level security;
revoke all on public.astros_service_worker_status from anon,authenticated;
grant all on public.astros_service_worker_status to service_role;
create or replace function public.astros_service_worker_ping() returns void
language sql security definer set search_path='' as $$
 insert into public.astros_service_worker_status(id,last_seen) values(true,now()) on conflict(id) do update set last_seen=excluded.last_seen;
$$;
revoke all on function public.astros_service_worker_ping() from public,anon,authenticated;
grant execute on function public.astros_service_worker_ping() to service_role;
create index if not exists astros_services_due on public.astros_service_jobs(next_check_at) where protocol_version=2 and state in ('processing','review');
create or replace function public.astros_start_service_v2(request_id uuid,client_id uuid,phone text,service_kind text,expected_cents bigint,target text,intent jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare reservation jsonb; lease uuid:=gen_random_uuid();
begin
 if jsonb_typeof(intent)<>'object' or coalesce(intent->>'email','')='' or intent->>'number' is distinct from phone or intent->>'targetStatus' is distinct from target or coalesce(intent->>'markerField','') !~ '^field_[0-9]+$' then raise exception 'Rastreamento inválido'; end if;
 reservation:=public.astros_start_service(request_id,client_id,phone,service_kind,expected_cents,target);
 if coalesce((reservation->>'execute')::boolean,false) then
  update public.astros_service_jobs set protocol_version=2,remote_phase='prepared',remote_intent=intent,lease_key=lease,lease_until=now()+interval '3 minutes',next_check_at=now()+interval '3 minutes' where id=request_id;
  reservation:=reservation||jsonb_build_object('leaseKey',lease);
 end if;
 return reservation;
end;
$$;
create or replace function public.astros_dispatch_service(request_id uuid,lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.astros_service_jobs set remote_phase='dispatching',updated_at=now() where id=request_id and protocol_version=2 and state='processing' and remote_phase='prepared' and lease_key=lease and lease_until>now();
 return found;
end;
$$;
create or replace function public.astros_claim_service(job_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.astros_service_jobs;
begin
 select * into job from public.astros_service_jobs
 where protocol_version=2 and state in ('processing','review') and (job_id is null or id=job_id)
 and (lease_until is null or lease_until<now())
 and (job_id is not null or next_check_at<=now())
 order by next_check_at nulls last,created_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.astros_service_jobs set lease_key=gen_random_uuid(),lease_until=now()+interval '3 minutes',check_attempts=check_attempts+1,updated_at=now() where id=job.id returning * into job;
 return to_jsonb(job);
end;
$$;
create or replace function public.astros_finish_service_v2(request_id uuid,lease uuid,final_state text,response jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.astros_service_jobs; v_result jsonb;
begin
 select * into job from public.astros_service_jobs where id=request_id for update;
 if not found or job.protocol_version<>2 then raise exception 'Solicitação inválida'; end if;
 if job.state in ('completed','failed') then return job.result; end if;
 if job.lease_key is distinct from lease then raise exception 'Conferência já assumida por outro processo'; end if;
 if final_state='failed' and job.remote_phase not in ('prepared','rejected') then raise exception 'Falha remota não comprovada: estorno bloqueado'; end if;
 if final_state='processing' then
  v_result:=response||jsonb_build_object('success',true,'state','processing');
  update public.astros_service_jobs set state='processing',remote_phase=case when remote_phase='dispatching' then 'uncertain' else remote_phase end,result=v_result,lease_key=null,lease_until=null,next_check_at=now()+make_interval(secs=>least(300,greatest(60,check_attempts*30))),updated_at=now() where id=request_id;
 else
  v_result:=public.astros_finish_service(request_id,final_state,response);
  update public.astros_service_jobs set remote_phase=case when final_state='completed' then 'confirmed' else remote_phase end,lease_key=null,lease_until=null,next_check_at=null where id=request_id;
 end if;
 return v_result;
end;
$$;
create or replace function public.astros_refuse_service(request_id uuid,lease uuid,response jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.astros_service_jobs;
begin
 select * into job from public.astros_service_jobs where id=request_id for update;
 if not found or job.protocol_version<>2 or job.lease_key is distinct from lease or job.remote_phase<>'dispatching' then raise exception 'Recusa não aplicável'; end if;
 update public.astros_service_jobs set remote_phase='rejected' where id=request_id;
 return public.astros_finish_service_v2(request_id,lease,'failed',response);
end;
$$;
revoke all on function public.astros_start_service_v2(uuid,uuid,text,text,bigint,text,jsonb) from public,anon,authenticated;
revoke all on function public.astros_dispatch_service(uuid,uuid) from public,anon,authenticated;
revoke all on function public.astros_claim_service(uuid) from public,anon,authenticated;
revoke all on function public.astros_finish_service_v2(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.astros_refuse_service(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.astros_start_service_v2(uuid,uuid,text,text,bigint,text,jsonb) to service_role;
grant execute on function public.astros_dispatch_service(uuid,uuid) to service_role;
grant execute on function public.astros_claim_service(uuid) to service_role;
grant execute on function public.astros_finish_service_v2(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.astros_refuse_service(uuid,uuid,jsonb) to service_role;
commit;
