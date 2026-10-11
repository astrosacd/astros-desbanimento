-- Se já executou o SQL da área administrativa, execute somente este ajuste.
begin;
alter table public.painel_de_desbanimento alter column cpfcnpj drop not null;
create or replace function public.astros_create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.painel_de_desbanimento (id, tipo_usuario, nome, email, cpfcnpj, whatsapp, data_do_cadastro, recarga)
 values (new.id, 'cliente', coalesce(new.raw_user_meta_data->>'nome', ''), new.email,
 null, coalesce(new.raw_user_meta_data->>'whatsapp', ''), now(), 0);
 return new;
end;
$$;
revoke all on function public.astros_create_profile() from public;
commit;
