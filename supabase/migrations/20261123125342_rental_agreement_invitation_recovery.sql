begin;

create function public.resend_rental_agreement_invitation(
  p_organization_id uuid,p_agreement_id uuid,p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_agreement private.rental_agreements%rowtype;
  v_link private.rental_agreement_application_links%rowtype;
  v_app public.rental_applications%rowtype;
  v_claim private.rental_agreement_signer_claims%rowtype;
  v_setup private.homeowner_lease_setups%rowtype;
  v_previous private.notification_jobs%rowtype;
  v_prefix text;
  v_key text;
  v_token text;
  v_job uuid;
begin
  if p_organization_id is null or p_agreement_id is null or p_operation_id is null then
    raise exception using errcode='22023',message='INVALID_AGREEMENT_INVITATION_RESEND';
  end if;
  v_agreement:=private.agreement_visible_to_actor(p_agreement_id,p_organization_id);
  if v_agreement.created_by is distinct from v_actor then
    raise exception using errcode='42501',message='AGREEMENT_FORBIDDEN';
  end if;
  if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then
    raise exception using errcode='42501',message='MFA_REQUIRED';
  end if;
  select * into v_link from private.rental_agreement_application_links l
  where l.agreement_id=v_agreement.id and l.organization_id=p_organization_id;
  if not found then raise exception using errcode='42501',message='AGREEMENT_FORBIDDEN'; end if;

  -- Match signing and claim lock order so a concurrent signature, withdrawal or close cannot
  -- rotate a terminal request or change which application has been approved.
  perform 1 from public.units u where u.id=v_agreement.unit_id and u.organization_id=p_organization_id for update;
  select * into strict v_app from public.rental_applications a
  where a.id=v_link.application_id and a.organization_id=p_organization_id for update;
  select * into strict v_agreement from private.rental_agreements a where a.id=p_agreement_id for update;
  select * into v_claim from private.rental_agreement_signer_claims c
  where c.agreement_id=v_agreement.id and c.organization_id=p_organization_id for update;
  if not found then raise exception using errcode='42501',message='AGREEMENT_FORBIDDEN'; end if;

  v_prefix:='rental-agreement-resend:'||p_agreement_id::text||':';
  v_key:=v_prefix||p_operation_id::text;
  select j.id into v_job from private.notification_jobs j where j.organization_id=p_organization_id
    and j.channel='email' and j.template_code='rental_agreement_signing_requested' and j.idempotency_key=v_key;
  if found then
    return jsonb_build_object('agreementId',p_agreement_id,'notificationJobId',v_job,'replayed',true);
  end if;

  if v_agreement.status<>'open' or v_agreement.expires_at<=clock_timestamp()
    or v_claim.expires_at<=clock_timestamp() or v_app.status<>'lease_preparation' or v_app.verified_at is null
    or lower(trim(v_app.email::text)) is distinct from v_claim.expected_email
    or exists(select 1 from private.rental_agreement_signatures s
      where s.agreement_id=v_agreement.id and s.user_id=v_claim.claimed_by) then
    raise exception using errcode='23514',message='AGREEMENT_INVITATION_NOT_OPEN';
  end if;
  v_setup:=private.require_application_signing_setup(p_organization_id,v_app.id);
  if v_setup.id is distinct from v_link.setup_id
    or private.application_agreement_terms_digest(v_setup.draft) is distinct from v_link.approved_terms_sha256 then
    raise exception using errcode='23514',message='APPLICATION_AGREEMENT_TERMS_LOCKED';
  end if;
  perform private.assert_rental_application_evidence_ready(p_organization_id,v_app.id);

  select * into v_previous from private.notification_jobs j where j.id=v_claim.notification_job_id
    and j.organization_id=p_organization_id and j.channel='email' and j.template_code='rental_agreement_signing_requested'
    and j.payload->>'agreementId'=p_agreement_id::text and j.recipient_address=v_claim.expected_email for update;
  if not found then raise exception using errcode='42501',message='AGREEMENT_FORBIDDEN'; end if;
  if v_previous.status='processing' then
    raise exception using errcode='23514',message='AGREEMENT_INVITATION_IN_FLIGHT';
  end if;
  if v_previous.created_at>clock_timestamp()-interval '5 minutes' then
    raise exception using errcode='23514',message='AGREEMENT_INVITATION_RESEND_COOLDOWN';
  end if;
  if (select count(*) from private.notification_jobs j
    where j.organization_id=p_organization_id and j.channel='email' and j.idempotency_key like v_prefix||'%')>=3 then
    raise exception using errcode='23514',message='AGREEMENT_INVITATION_RESEND_LIMIT';
  end if;

  v_token:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  insert into private.notification_jobs(organization_id,template_code,locale,channel,recipient_address,payload,idempotency_key)
    values(p_organization_id,'rental_agreement_signing_requested',v_previous.locale,'email',v_claim.expected_email,
      jsonb_build_object('agreementId',p_agreement_id,'applicationReference',v_app.public_reference,
        'expiresAt',v_claim.expires_at,'signingInvitationToken',v_token),v_key)
    returning id into v_job;
  update private.notification_jobs set
    status=case when status in ('queued','failed') then 'canceled' else status end,
    payload=payload-'signingInvitationToken' where id=v_previous.id;
  update private.rental_agreement_signer_claims set
    token_hash=encode(sha256(convert_to(v_token,'UTF8')),'hex'),notification_job_id=v_job,last_auth_requested_at=null
    where agreement_id=p_agreement_id and organization_id=p_organization_id;
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values(p_organization_id,v_actor,'user','rental_agreement.invitation_resent','rental_agreement',p_agreement_id,p_operation_id,
      jsonb_build_object('notificationJobId',v_job));
  return jsonb_build_object('agreementId',p_agreement_id,'notificationJobId',v_job,'replayed',false);
end;
$$;
revoke all on function public.resend_rental_agreement_invitation(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.resend_rental_agreement_invitation(uuid,uuid,uuid) to authenticated;

create or replace function public.get_rental_agreement_invitation_delivery(p_organization_id uuid,p_agreement_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_agreement private.rental_agreements%rowtype;
  v_link private.rental_agreement_application_links%rowtype;
  v_setup private.homeowner_lease_setups%rowtype;
  v_state text;
  v_unsigned_renter boolean;
  v_reissue jsonb;
begin
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
  end, not exists(select 1 from private.rental_agreement_signatures s
    where s.agreement_id=c.agreement_id and s.user_id=c.claimed_by) into v_state,v_unsigned_renter
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
      null;
    end;
  end if;

  return jsonb_build_object('agreementId',v_agreement.id,'state',v_state,'reissue',v_reissue,
    'resendEligible',coalesce(v_unsigned_renter,false) and v_agreement.created_by=auth.uid()
      and v_agreement.status='open' and v_agreement.expires_at>statement_timestamp());
end;
$$;

commit;
