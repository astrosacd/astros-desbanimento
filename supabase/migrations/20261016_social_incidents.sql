begin;
create table if not exists public.astros_social_incidents(
 request_id uuid primary key,
 quote_id uuid not null,
 user_id uuid not null references public.painel_de_desbanimento(id) on delete cascade,
 service_id bigint not null,
 title text not null,
 quantity integer not null,
 reason text not null check(reason='supplier_balance_insufficient'),
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists astros_social_incidents_created on public.astros_social_incidents(created_at desc,request_id);
alter table public.astros_social_incidents enable row level security;
revoke all on public.astros_social_incidents from public,anon,authenticated;
grant all on public.astros_social_incidents to service_role;
create or replace function public.astros_social_record_incident(actor uuid,request uuid,quote uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into public.astros_social_incidents(request_id,quote_id,user_id,service_id,title,quantity,reason)
 select request,q.id,q.user_id,q.service_id,q.title,q.quantity,'supplier_balance_insufficient'
 from public.astros_social_quotes q where q.id=quote and q.user_id=actor
 and not exists(select 1 from public.astros_social_orders o where o.id=request)
 on conflict(request_id) do nothing;
 get diagnostics n=row_count;return n=1;
end;$$;
create or replace function public.astros_social_incident_list(actor uuid,filters jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare pg integer:=coalesce((filters->>'page')::integer,0);term text:=trim(coalesce(filters->>'search',''));result jsonb;
begin
 if not exists(select 1 from public.painel_de_desbanimento where id=actor and tipo_usuario='admin') then raise exception 'Acesso restrito';end if;
 if pg<0 or pg>10000 or length(term)>80 then raise exception 'Filtro inválido';end if;
 with filtered as(
 select i.*,p.nome as name,p.email from public.astros_social_incidents i join public.painel_de_desbanimento p on p.id=i.user_id
 where term='' or strpos(lower(coalesce(p.nome,'')||' '||coalesce(p.email,'')||' '||i.title),lower(term))>0 or i.service_id::text=regexp_replace(term,'^#\s*','') or i.request_id::text=term
 ),batch as(select * from filtered order by created_at desc,request_id limit 20 offset pg*20)
 select jsonb_build_object('incidents',coalesce((select jsonb_agg(to_jsonb(batch) order by created_at desc,request_id) from batch),'[]'::jsonb),'total',(select count(*) from filtered),'hasMore',(select count(*) from filtered)>pg*20+20) into result;return result;
end;$$;
revoke all on function public.astros_social_record_incident(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.astros_social_incident_list(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.astros_social_record_incident(uuid,uuid,uuid) to service_role;
grant execute on function public.astros_social_incident_list(uuid,jsonb) to service_role;
commit;
