-- Apply after the compatible payments screen and CSV route are verified.
begin;
revoke execute on function public.get_operator_payment_export(date,date,uuid,uuid) from public,anon,authenticated,service_role;
commit;
