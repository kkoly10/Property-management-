begin;

create function public.get_rental_agreement_invitation_delivery(p_organization_id uuid,p_agreement_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_agreement private.rental_agreements%rowtype;
  v_link private.rental_agreement_application_links%rowtype;
  v_setup private.homeowner_lease_setups%rowtype;
  v_state text;
  v_reissue jsonb;
begin
  -- Participant agreement access does not confer access to operator mail history.
  if p_organization_id is null then raise exception using errcode='42501',message='AGREEMENT_FORBIDDEN'; end if;
  v_agreement:=private.agreement_visible_to_actor(p_agreement_id,p_organization_id);
  select * into v_link from private.rental_agreement_application_links l
    where l.agreement_id=v_agreement.id and l.organization_id=v_agreement.organization_id;
  if not found then return null; end if;

  select case
    when d.status='delivered' then 'delivered'
    when d.status in ('bounced','complained','suppressed') then 'failed'
    when d.status='delayed' then 'delayed'
    when j.status='dead_letter' then 'failed'
    when d.status='accepted' or j.status='sent' then 'accepted'
    when j.status='failed' or (d.status='failed' and j.status in ('queued','processing')) then 'delayed'
    when j.status in ('queued','processing') then 'queued'
  end into v_state
  from private.rental_agreement_signer_claims c
  join private.notification_jobs j on j.id=c.notification_job_id and j.organization_id=c.organization_id
    and j.template_code='rental_agreement_signing_requested' and j.channel='email'
    and j.payload->>'agreementId'=c.agreement_id::text
  left join lateral private.get_notification_delivery_state(j.id) d on true
  where c.agreement_id=v_agreement.id and c.organization_id=v_agreement.organization_id;

  if v_agreement.status='open' and v_agreement.expires_at<=statement_timestamp() then
    begin
      v_setup:=private.require_application_signing_setup(p_organization_id,v_link.application_id);
      if v_setup.id=v_link.setup_id and v_setup.unit_id=v_agreement.unit_id then
        v_reissue:=jsonb_build_object('unitId',v_setup.unit_id,'applicationId',v_link.application_id);
      end if;
    exception when insufficient_privilege then
      -- A scoped operator can inspect delivery without owning the original signing draft.
      null;
    end;
  end if;

  return jsonb_build_object('agreementId',v_agreement.id,'state',v_state,'reissue',v_reissue);
end;
$$;
revoke all on function public.get_rental_agreement_invitation_delivery(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_rental_agreement_invitation_delivery(uuid,uuid) to authenticated;

commit;
