begin;
alter table public.astros_support_private add column if not exists api_token text,add column if not exists account_id bigint;
create or replace function public.astros_support_api_status() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.astros_is_admin() then raise exception 'Acesso administrativo necessário'; end if;
 select jsonb_build_object('accountId',account_id,'configured',coalesce(length(api_token)>0,false)) into result from public.astros_support_private where id=true;
 return coalesce(result,'{"accountId":null,"configured":false}'::jsonb);
end $$;
create or replace function public.astros_save_support_v2(active boolean,origin text,widget_token text,heading text,description_text text,secret text,account bigint,api_secret text default '') returns void language plpgsql security definer set search_path='' as $$
declare saved public.astros_support_private; old_origin text;
begin
 if not public.astros_is_admin() then raise exception 'Acesso administrativo necessário'; end if;
 if account is null or account<=0 or account>9007199254740991 or length(api_secret)>512 then raise exception 'Configuração de API inválida'; end if;
 select base_url into old_origin from public.astros_support_settings where id=true for update;
 select * into saved from public.astros_support_private where id=true;
 if coalesce(api_secret,'')='' and saved.api_token is not null and (saved.account_id is distinct from account or old_origin is distinct from origin) then raise exception 'Informe o token ao trocar a conta ou servidor'; end if;
 if active and coalesce(nullif(api_secret,''),saved.api_token,'')='' then raise exception 'Configure o token de API antes de ativar'; end if;
 perform public.astros_save_support(active,origin,widget_token,heading,description_text,secret);
 update public.astros_support_private set account_id=account,api_token=coalesce(nullif(api_secret,''),api_token) where id=true;
end $$;
create or replace function public.astros_support_bridge_config() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('enabled',s.enabled,'baseUrl',s.base_url,'websiteToken',s.website_token,'title',s.title,'description',s.description,'hmacToken',p.hmac_token,'apiToken',p.api_token,'accountId',p.account_id) from public.astros_support_settings s join public.astros_support_private p using(id) where s.id=true;
$$;
revoke all on function public.astros_support_api_status(),public.astros_save_support_v2(boolean,text,text,text,text,text,bigint,text) from public,anon;
grant execute on function public.astros_support_api_status(),public.astros_save_support_v2(boolean,text,text,text,text,text,bigint,text) to authenticated;
revoke all on function public.astros_support_bridge_config() from public,anon,authenticated;
grant execute on function public.astros_support_bridge_config() to service_role;
commit;
