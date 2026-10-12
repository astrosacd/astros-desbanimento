begin;
alter table public.astros_client_notice add column if not exists image_url text not null default '';
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('astros-notices','astros-notices',true,2097152,array['image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
create policy astros_notice_image_insert on storage.objects for insert to authenticated with check(bucket_id='astros-notices' and public.astros_is_admin() and (storage.foldername(name))[1]=auth.uid()::text);
commit;
