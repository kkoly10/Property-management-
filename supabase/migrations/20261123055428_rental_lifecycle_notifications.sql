begin;

create function private.rental_notification_operator(p_org uuid,p_property uuid,p_listing uuid,p_recipient uuid default null)
returns table(user_id uuid,locale text)
language sql stable set search_path = ''
as $$
  select m.user_id,case when p.locale in ('en-US','en-CA','es-MX','fr-CA') then p.locale else 'en-US' end
  from public.rental_listings l
  join public.organizations o on o.id=l.organization_id
  join public.organization_memberships m on m.organization_id=o.id
  join public.role_definitions rd on rd.code=m.role_code
  join public.profiles p on p.user_id=m.user_id and p.status='active'
  join auth.users u on u.id=m.user_id
  where l.id=p_listing and l.organization_id=p_org and l.property_id=p_property
    and o.customer_path='self_managing' and o.status in ('trial','active')
    and ((p_recipient is null and m.role_code='org_owner') or m.user_id=p_recipient)
    and m.status='active' and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
    and u.email_confirmed_at is not null and nullif(btrim(u.email),'') is not null
    and exists(select 1 from public.role_permissions rp where rp.role_code=m.role_code
      and (rp.permission_code in ('*','lease.manage') or (p_recipient is null and rp.permission_code='property.manage')))
    and (
      exists(select 1 from public.membership_property_scopes s where s.organization_id=m.organization_id
        and s.membership_id=m.id and s.property_id=p_property)
      or (rd.organization_wide_allowed and not exists(
        select 1 from public.membership_property_scopes s where s.membership_id=m.id
      ))
    )
  order by (m.user_id=l.created_by) desc nulls last,m.starts_at,m.created_at,m.id
  limit 1
$$;
revoke all on function private.rental_notification_operator(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.queue_rental_lifecycle_notifications()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_tour public.rental_tour_requests%rowtype;
  v_application public.rental_applications%rowtype;
  v_agreement private.rental_agreements%rowtype;
  v_owner_template text;
  v_renter_template text;
  v_renter_locale text;
  v_payload jsonb;
  v_signed_by uuid;
  v_signed_capacity text;
  v_reviewer uuid;
begin
  if new.aggregate_type='rental_tour' then
    select * into v_tour from public.rental_tour_requests t
    where t.id=new.aggregate_id and t.organization_id=new.organization_id;
    if not found then return new; end if;
    v_payload := jsonb_build_object('unitId',v_tour.unit_id,'tourReference',v_tour.public_reference);
    if new.event_type='rental_tour.verified' then
      insert into private.notification_jobs(organization_id,template_code,locale,channel,recipient_user_id,payload,idempotency_key)
      select v_tour.organization_id,'message_rental_tour_received',o.locale,'email',o.user_id,v_payload,
        'rental-tour-verified:'||v_tour.id::text||':'||o.user_id::text
      from private.rental_notification_operator(v_tour.organization_id,v_tour.property_id,v_tour.listing_id) o
      on conflict(channel,idempotency_key) do nothing;
    elsif new.event_type in ('rental_tour.cancelled','rental_tour.rescheduled') then
      select j.locale into v_renter_locale from private.rental_tour_verifications v
      join private.notification_jobs j on j.id=v.notification_job_id and j.organization_id=v.organization_id
      where v.tour_request_id=v_tour.id and v.organization_id=v_tour.organization_id;
      update private.notification_jobs j set status='canceled',last_error='TOUR_UPDATED'
      where j.organization_id=v_tour.organization_id and j.status='queued'
        and j.template_code in ('rental_tour_confirmed','rental_tour_rescheduled','message_rental_tour_received')
        and j.payload->>'tourReference'=v_tour.public_reference;
      select v_payload||jsonb_build_object('publicId',l.public_id) into v_payload
      from public.rental_listings l where l.organization_id=v_tour.organization_id and l.id=v_tour.listing_id;
      if new.event_type='rental_tour.rescheduled' then
        v_payload := v_payload||jsonb_build_object(
          'confirmedStartAt',v_tour.confirmed_start_at,'timeZone',v_tour.property_time_zone,
          'meetingLocation',v_tour.confirmed_meeting_location
        );
      end if;
      insert into private.notification_jobs(organization_id,template_code,locale,channel,recipient_address,payload,idempotency_key)
      values(v_tour.organization_id,
        case when new.event_type='rental_tour.cancelled' then 'rental_tour_cancelled' else 'rental_tour_rescheduled' end,
        coalesce(v_renter_locale,'en-US'),'email',v_tour.email::text,v_payload,'rental-event:'||new.id::text)
      on conflict(channel,idempotency_key) do nothing;
    end if;
    return new;
  end if;

  if new.aggregate_type='rental_application' then
    select * into v_application from public.rental_applications a
    where a.id=new.aggregate_id and a.organization_id=new.organization_id;
    if not found or v_application.verified_at is null then return new; end if;
    v_payload:=jsonb_build_object('unitId',v_application.unit_id,'applicationReference',v_application.public_reference);
    case new.event_type
      when 'rental_application.verified' then
        if exists(select 1 from private.rental_application_evidence_packets p
          where p.organization_id=v_application.organization_id and p.application_id=v_application.id) then
          return new;
        end if;
        v_owner_template:='message_rental_application_received';
        v_renter_template:='rental_application_received';
      when 'rental_application.evidence_submitted' then
        if exists(select 1 from private.notification_jobs j where j.organization_id=v_application.organization_id
          and j.template_code='message_rental_application_received'
          and j.payload->>'applicationReference'=v_application.public_reference) then
          v_owner_template:='message_rental_application_updated';
        else
          v_owner_template:='message_rental_application_received';
        end if;
        select e.reviewer_user_id into v_reviewer from private.rental_application_evidence_packets e
        join private.rental_application_evidence_policies p on p.id=e.policy_id and p.enabled and p.approved_at<=now()
        where e.organization_id=v_application.organization_id and e.application_id=v_application.id;
        if not found then v_owner_template:=null; end if;
        v_renter_template:='rental_application_received';
      when 'rental_application.evidence_changes_requested' then
        v_renter_template:='rental_application_changes_requested';
      when 'rental_application.lease_prepared' then
        v_renter_template:='rental_application_lease_preparing';
      when 'rental_application.closed' then v_renter_template:='rental_application_closed';
      when 'rental_application.withdrawn' then
        v_renter_template:='rental_application_withdrawn';
        v_owner_template:='message_rental_application_withdrawn';
      else return new;
    end case;
    if new.event_type in ('rental_application.closed','rental_application.withdrawn') then
      update private.notification_jobs j set status='canceled',last_error='APPLICATION_ENDED'
      where j.organization_id=v_application.organization_id and j.status='queued'
        and j.template_code in ('message_rental_application_received','message_rental_application_updated',
          'rental_application_received','rental_application_changes_requested','rental_application_lease_preparing')
        and j.payload->>'applicationReference'=v_application.public_reference;
    end if;
    if v_owner_template is not null then
      insert into private.notification_jobs(organization_id,template_code,locale,channel,recipient_user_id,payload,idempotency_key)
      select v_application.organization_id,v_owner_template,o.locale,'email',o.user_id,v_payload,
        'rental-event:'||new.id::text||':operator:'||o.user_id::text
      from private.rental_notification_operator(v_application.organization_id,v_application.property_id,v_application.listing_id,v_reviewer) o
      on conflict(channel,idempotency_key) do nothing;
    end if;
    if v_renter_template is not null then
      select j.locale into v_renter_locale from private.rental_application_verifications v
      join private.notification_jobs j on j.id=v.notification_job_id and j.organization_id=v.organization_id
      where v.application_id=v_application.id and v.organization_id=v_application.organization_id;
      insert into private.notification_jobs(organization_id,template_code,locale,channel,recipient_address,payload,idempotency_key)
      values(v_application.organization_id,v_renter_template,coalesce(v_renter_locale,'en-US'),'email',v_application.email::text,
        v_payload,'rental-event:'||new.id::text||':renter')
      on conflict(channel,idempotency_key) do nothing;
    end if;
    return new;
  end if;

  select * into v_agreement from private.rental_agreements a
  where a.id=new.aggregate_id and a.organization_id=new.organization_id;
  if not found then return new; end if;
  v_payload:=jsonb_build_object('agreementId',v_agreement.id);

  if new.event_type='rental_agreement.signed' and new.payload->>'status'='open' then
    select s.user_id,s.capacity into v_signed_by,v_signed_capacity
    from private.rental_agreement_signers s
    where s.agreement_id=v_agreement.id and s.participant_id::text=new.payload->>'participantId';
    if v_signed_capacity is distinct from 'lessee' then return new; end if;
    insert into private.notification_jobs(organization_id,template_code,locale,channel,recipient_user_id,payload,idempotency_key)
    select v_agreement.organization_id,'rental_agreement_renter_signed',
      case when p.locale in ('en-US','en-CA','es-MX','fr-CA') then p.locale else 'en-US' end,'email',u.id,v_payload,
      'rental-agreement-signed:'||v_agreement.id::text||':'||u.id::text
    from auth.users u left join public.profiles p on p.user_id=u.id
    where u.id=v_signed_by and u.email_confirmed_at is not null and nullif(btrim(u.email),'') is not null
    on conflict(channel,idempotency_key) do nothing;

    if not exists(select 1 from private.rental_agreement_signers s
      where s.agreement_id=v_agreement.id and s.capacity='lessee' and not exists(
        select 1 from private.rental_agreement_signatures sig where sig.agreement_id=s.agreement_id and sig.user_id=s.user_id
      )) and not exists(select 1 from private.rental_agreement_signer_claims c
        where c.agreement_id=v_agreement.id and c.organization_id=v_agreement.organization_id and c.claimed_by is null
          and not exists(select 1 from private.rental_agreement_signers s join auth.users u on u.id=s.user_id
            where s.agreement_id=c.agreement_id and s.capacity='lessee'
              and lower(u.email)=lower(c.expected_email::text))) then
      insert into private.notification_jobs(organization_id,template_code,locale,channel,recipient_user_id,payload,idempotency_key)
      select v_agreement.organization_id,'rental_agreement_signature_required',
        case when p.locale in ('en-US','en-CA','es-MX','fr-CA') then p.locale else 'en-US' end,'email',u.id,v_payload,
        'rental-agreement-countersign:'||v_agreement.id::text||':'||u.id::text
      from private.rental_agreement_signers s join auth.users u on u.id=s.user_id
      left join public.profiles p on p.user_id=u.id
      where s.agreement_id=v_agreement.id and s.capacity='landlord' and u.email_confirmed_at is not null
        and nullif(btrim(u.email),'') is not null and not exists(select 1 from private.rental_agreement_signatures sig
          where sig.agreement_id=s.agreement_id and sig.user_id=s.user_id)
      on conflict(channel,idempotency_key) do nothing;
    end if;
  elsif new.event_type in ('rental_agreement.executed','rental_agreement.declined','rental_agreement.void','rental_agreement.expired') then
    update private.notification_jobs j set status='canceled',last_error='AGREEMENT_ENDED'
    where j.organization_id=v_agreement.organization_id and j.status='queued'
      and j.template_code in ('rental_agreement_signature_required','rental_agreement_signing_requested')
      and j.payload->>'agreementId'=v_agreement.id::text;
    insert into private.notification_jobs(organization_id,template_code,locale,channel,recipient_user_id,payload,idempotency_key)
    select v_agreement.organization_id,
      case when new.event_type='rental_agreement.executed' then
        case when s.capacity='landlord' then 'rental_agreement_operator_executed' else 'rental_agreement_renter_executed' end
      else
        case when s.capacity='landlord' then 'rental_agreement_operator_closed' else 'rental_agreement_renter_closed' end
      end,
      case when p.locale in ('en-US','en-CA','es-MX','fr-CA') then p.locale else 'en-US' end,'email',u.id,v_payload,
      'rental-event:'||new.id::text||':signer:'||s.user_id::text
    from private.rental_agreement_signers s join auth.users u on u.id=s.user_id
    left join public.profiles p on p.user_id=u.id
    where s.agreement_id=v_agreement.id and u.email_confirmed_at is not null and nullif(btrim(u.email),'') is not null
    on conflict(channel,idempotency_key) do nothing;
    if new.event_type<>'rental_agreement.executed' then
      insert into private.notification_jobs(organization_id,template_code,locale,channel,recipient_address,payload,idempotency_key)
      select v_agreement.organization_id,'rental_agreement_renter_closed','en-US','email',c.expected_email::text,'{}',
        'rental-event:'||new.id::text||':pending-applicant'
      from private.rental_agreement_signer_claims c
      where c.agreement_id=v_agreement.id and c.organization_id=v_agreement.organization_id and c.claimed_by is null
        and not exists(select 1 from private.rental_agreement_signers s join auth.users u on u.id=s.user_id
          where s.agreement_id=v_agreement.id and lower(u.email)=lower(c.expected_email::text))
      on conflict(channel,idempotency_key) do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.queue_rental_lifecycle_notifications() from public,anon,authenticated,service_role;

create trigger queue_rental_lifecycle_notifications after insert on private.outbox_events
for each row when (new.event_type in (
  'rental_tour.verified','rental_tour.cancelled','rental_tour.rescheduled',
  'rental_application.verified','rental_application.evidence_submitted','rental_application.evidence_changes_requested',
  'rental_application.lease_prepared','rental_application.closed','rental_application.withdrawn',
  'rental_agreement.signed','rental_agreement.executed','rental_agreement.declined','rental_agreement.void','rental_agreement.expired'
))
execute function private.queue_rental_lifecycle_notifications();

create function private.claim_notification_job_batch(
  p_channel text,
  p_limit integer,
  p_worker_run_id text,
  p_exact_job uuid,
  p_include_rental_lifecycle boolean
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_suppressed integer := 0;
  v_jobs jsonb;
  -- The legacy worker dead-letters codes it cannot render. Leave these queued during a
  -- rolling deployment or rollback so a worker with the corresponding templates can claim them.
  v_rental_release_templates constant text[] := array[
    'message_rental_tour_received','message_rental_application_received','message_rental_application_updated',
    'message_rental_application_withdrawn','rental_application_received','rental_application_changes_requested',
    'rental_application_lease_preparing','rental_application_closed','rental_application_withdrawn',
    'rental_agreement_signing_requested','rental_agreement_signature_required','rental_agreement_renter_signed',
    'rental_agreement_renter_executed','rental_agreement_operator_executed','rental_agreement_renter_closed',
    'rental_agreement_operator_closed','rental_tour_cancelled','rental_tour_rescheduled',
    'rental_inquiry_reply','rental_tour_reply','rental_conversation_access',
    'message_rental_inquiry_reply','message_rental_tour_reply'
  ];
begin
  if p_channel is null or p_channel not in ('in_app','email','sms','whatsapp','push') then
    raise exception using errcode='23514',message='INVALID_NOTIFICATION_CHANNEL';
  end if;
  if p_limit is null or p_limit not between 1 and 200 then
    raise exception using errcode='23514',message='INVALID_NOTIFICATION_BATCH_SIZE';
  end if;
  if p_worker_run_id is null or length(trim(p_worker_run_id)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_WORKER_RUN_ID';
  end if;

  -- Preference suppression. in_app is not a preference-gated channel (the preference table's own check
  -- constraint excludes it), and a null category is transactional mail that must always send.
  if p_channel <> 'in_app' then
    with suppressible as (
      select j.id
      from private.notification_jobs j
      where j.channel = p_channel
        and (p_exact_job is null or j.id=p_exact_job)
        and (p_include_rental_lifecycle or j.template_code <> all(v_rental_release_templates))
        and j.status = 'queued'
        and j.available_at <= now()
        and j.recipient_user_id is not null
        and private.notification_template_category(j.template_code) is not null
        and exists (
          select 1 from public.notification_preferences np
          where np.user_id = j.recipient_user_id
            and np.channel = j.channel
            and np.category = private.notification_template_category(j.template_code)
            and np.enabled = false
        )
      for update skip locked
    )
    update private.notification_jobs j
    set status = 'canceled', last_error = 'RECIPIENT_OPTED_OUT'
    from suppressible s
    where j.id = s.id;
    get diagnostics v_suppressed = row_count;
  end if;

  with due as (
    select j.id
    from private.notification_jobs j
    where j.channel = p_channel
      and (p_exact_job is null or j.id=p_exact_job)
      and (p_include_rental_lifecycle or j.template_code <> all(v_rental_release_templates))
      and j.status = 'queued'
      and j.available_at <= now()
    order by j.available_at, j.created_at
    limit p_limit
    for update skip locked
  ),
  claimed as (
    update private.notification_jobs j
    set status = 'processing',
        attempts = j.attempts + 1,
        claimed_at = now(),
        worker_run_id = p_worker_run_id
    from due d
    where j.id = d.id
    returning j.id, j.organization_id, j.template_code, j.locale, j.channel,
              j.recipient_user_id, j.recipient_address, j.payload, j.attempts, j.max_attempts
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'notificationJobId', c.id,
    'organizationId', c.organization_id,
    'templateCode', c.template_code,
    'category', private.notification_template_category(c.template_code),
    'locale', c.locale,
    'channel', c.channel,
    'recipientUserId', c.recipient_user_id,
    'recipientAddress', coalesce(c.recipient_address, u.email),
    'payload', c.payload,
    'attempt', c.attempts,
    'maxAttempts', c.max_attempts
  ) order by c.id), '[]'::jsonb)
  into v_jobs
  from claimed c
  left join auth.users u on u.id = c.recipient_user_id;

  return jsonb_build_object(
    'workerRunId', p_worker_run_id,
    'channel', p_channel,
    'claimed', jsonb_array_length(v_jobs),
    'suppressed', v_suppressed,
    'jobs', v_jobs
  );
end;
$$;
revoke all on function private.claim_notification_job_batch(text,integer,text,uuid,boolean) from public,anon,authenticated,service_role;

create or replace function public.claim_notification_jobs(p_channel text,p_limit integer,p_worker_run_id text)
returns jsonb language sql security definer set search_path=''
as $$
  select private.claim_notification_job_batch(p_channel,p_limit,p_worker_run_id,null,false);
$$;
revoke all on function public.claim_notification_jobs(text,integer,text) from public,anon,authenticated;
grant execute on function public.claim_notification_jobs(text,integer,text) to service_role;

create function public.claim_notification_jobs_v2(p_channel text,p_limit integer,p_worker_run_id text)
returns jsonb language sql security definer set search_path=''
as $$
  select private.claim_notification_job_batch(p_channel,p_limit,p_worker_run_id,null,true);
$$;
revoke all on function public.claim_notification_jobs_v2(text,integer,text) from public,anon,authenticated;
grant execute on function public.claim_notification_jobs_v2(text,integer,text) to service_role;

create function public.claim_rental_fast_notification_job(p_job_id uuid,p_worker_run_id text)
returns jsonb language sql security definer set search_path=''
as $$
  select private.claim_notification_job_batch('email',1,p_worker_run_id,p_job_id,true)
  where p_job_id is not null and exists(select 1 from private.notification_jobs j where j.id=p_job_id
    and j.channel='email' and j.template_code in (
      'rental_inquiry_verification','rental_tour_verification','rental_application_verification',
      'rental_agreement_signing_requested','rental_inquiry_reply','rental_tour_reply','rental_conversation_access'
    ));
$$;
revoke all on function public.claim_rental_fast_notification_job(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_rental_fast_notification_job(uuid,text) to service_role;

create function public.locate_rental_fast_mail(
  p_kind text,p_target_id uuid,p_email text default null,p_operation_key text default null
)
returns uuid language plpgsql stable security definer set search_path=''
as $$
declare
  v_job uuid;
  v_route text;
  v_scope text;
  v_key text;
begin
  if p_kind='agreement' then
    select c.notification_job_id into v_job from private.rental_agreement_signer_claims c
    join private.rental_agreements a on a.id=c.agreement_id and a.organization_id=c.organization_id
    where c.agreement_id=p_target_id and a.status='open' and a.expires_at>now() and c.expires_at>now();
    return v_job;
  end if;
  case p_kind
    when 'inquiry' then v_route:='SubmitPublicRentalInquiry';
    when 'tour' then v_route:='SubmitPublicRentalTour';
    when 'application' then v_route:='SubmitPublicRentalApplication';
    else return null;
  end case;
  if p_target_id is null or p_email is null or length(p_email)>320
    or p_operation_key is null or length(p_operation_key) not between 8 and 200 then return null; end if;
  v_scope:='public-'||p_kind||':'||p_target_id::text||':'||
    substr(encode(sha256(convert_to(lower(btrim(p_email)),'UTF8')),'hex'),1,32);
  v_key:=encode(sha256(convert_to(v_scope||'|'||btrim(p_operation_key),'UTF8')),'hex');
  select j.id into v_job
  from public.rental_listings l
  join private.idempotency_records r on r.organization_id=l.organization_id and r.actor_scope=v_scope
    and r.route=v_route and r.idempotency_key=v_key and r.state='completed'
  join private.notification_jobs j on j.organization_id=r.organization_id
    and j.idempotency_key='rental-'||p_kind||'-verification:'||r.resource_id::text
    and j.template_code='rental_'||p_kind||'_verification' and j.channel='email'
  where l.public_id=p_target_id and j.status='queued' and j.available_at<=now()
    and j.payload ? 'verificationToken';
  return v_job;
end;
$$;
revoke all on function public.locate_rental_fast_mail(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.locate_rental_fast_mail(text,uuid,text,text) to service_role;

alter table private.rental_agreements add column expiry_notified_at timestamptz;

create function public.queue_expired_rental_agreement_notifications(p_limit integer)
returns integer language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_organization_id uuid; v_count integer:=0;
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode='22023',message='INVALID_AGREEMENT_EXPIRY_BUDGET';
  end if;
  for v_id,v_organization_id in
    select a.id,a.organization_id from private.rental_agreements a where a.status='open'
      and a.expires_at<=now() and a.expiry_notified_at is null
      and exists(select 1 from private.rental_agreement_signer_claims c
        where c.agreement_id=a.id and c.organization_id=a.organization_id)
    order by a.expires_at,a.id limit p_limit for update of a skip locked
  loop
    update private.rental_agreements set expiry_notified_at=now() where id=v_id and organization_id=v_organization_id;
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values(v_organization_id,'rental_agreement.expired','rental_agreement',v_id,v_id,jsonb_build_object('agreementId',v_id));
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.queue_expired_rental_agreement_notifications(integer) from public,anon,authenticated;
grant execute on function public.queue_expired_rental_agreement_notifications(integer) to service_role;

commit;
