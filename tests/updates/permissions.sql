-- Isolated disposable CI database only.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.astros_update_save('{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","version":0,"title":"Texto seguro","summary":"Um resumo","body":"Corpo completo","category":"new","status":"draft"}');
do $$begin if (select count(*) from public.astros_updates)<>1 then raise exception 'Admin cannot read draft';end if;end$$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$begin
 if (select count(*) from public.astros_updates)<>0 then raise exception 'Draft leak';end if;
 begin
  perform public.astros_update_save('{"id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","version":0,"title":"Cliente tentando","summary":"Um resumo","body":"Corpo completo","category":"new","status":"published"}');
  raise exception 'Client write accepted';
 exception when raise_exception then if sqlerrm='Client write accepted' then raise;end if;end;
 begin
  insert into public.astros_updates(id,title,summary,body,category) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','Direto','Resumo','Corpo','new');
  raise exception 'Direct write accepted';
 exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.astros_update_save('{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","version":1,"title":"Texto seguro","summary":"Um resumo","body":"Corpo completo","category":"new","status":"published"}');
do $$begin
 if not exists(select 1 from public.astros_updates where version=2 and published_at is not null) then raise exception 'Publish failed';end if;
 begin
  perform public.astros_update_save('{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","version":1,"title":"Edição antiga","summary":"Um resumo","body":"Corpo completo","category":"new","status":"published"}');
  raise exception 'Stale write accepted';
 exception when raise_exception then if sqlerrm='Stale write accepted' then raise;end if;end;
end$$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$begin if (select count(*) from public.astros_updates)<>1 then raise exception 'Published missing';end if;end$$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$begin if (select count(*) from public.astros_updates)<>0 then raise exception 'Unconfirmed read accepted';end if;end$$;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
do $$begin if (select count(*) from public.astros_updates)<>0 then raise exception 'Banned read accepted';end if;end$$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.astros_update_save('{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","version":2,"title":"Texto seguro","summary":"Um resumo","body":"Corpo completo","category":"new","status":"archived"}');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$begin if (select count(*) from public.astros_updates)<>0 then raise exception 'Archive leak';end if;end$$;
rollback;
