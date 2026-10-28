-- Isolated disposable CI database only. Never run on Supabase production.
create role anon;
create role authenticated;
create schema auth;
create table auth.users(id uuid primary key,email_confirmed_at timestamptz,banned_until timestamptz,raw_app_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create function public.astros_is_admin() returns boolean language sql stable as $$ select auth.uid()='11111111-1111-4111-8111-111111111111'::uuid $$;
insert into auth.users values('11111111-1111-4111-8111-111111111111',now(),null,'{}'),('22222222-2222-4222-8222-222222222222',now(),null,'{}'),('33333333-3333-4333-8333-333333333333',null,null,'{}'),('44444444-4444-4444-8444-444444444444',now(),now()+interval '1 day','{}');
