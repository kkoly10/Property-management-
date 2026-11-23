-- Apply after all operator traffic uses send_rental_application_agreement.
-- Existing envelopes and the independent/external signing path keep access.
begin;

revoke execute on function public.issue_rental_application_agreement(uuid,uuid,uuid,integer,uuid,uuid,integer,boolean)
  from authenticated;

commit;
