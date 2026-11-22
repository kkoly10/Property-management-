-- Apply only after every scheduled and manual dispatch worker uses the fenced RPCs
-- and workers from the previous deployment have completed or their claims have expired.
begin;

revoke execute on function public.complete_notification_job(uuid,text,text) from service_role;
revoke execute on function public.fail_notification_job(uuid,text,boolean) from service_role;
revoke execute on function public.complete_document_scan(uuid,text,text,text,text) from service_role;
revoke execute on function public.fail_document_scan(uuid,text,boolean) from service_role;

commit;
