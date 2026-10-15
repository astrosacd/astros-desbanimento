-- Seleção opcional de DDD: apenas nas novas cotações; não altera pedidos ou saldo.
begin;
alter table public.astros_sms_quotes add column if not exists area_code text
 check (area_code is null or area_code ~ '^[1-9][0-9]$');
commit;
