begin;

create function private.is_account_privacy_export_case(p_request public.privacy_requests)
returns boolean
language sql immutable
set search_path = ''
as $$
  select p_request.organization_id is null
    and p_request.controller_role='platform'
    and p_request.request_type in ('access','export')
    and p_request.identity_verification_status='verified'
    and p_request.status in ('processing','fulfilled','partially_fulfilled');
$$;
revoke all on function private.is_account_privacy_export_case(public.privacy_requests)
  from public,anon,authenticated,service_role;

-- This direct projection limits the account file to explicit first-party fields.
create function public.get_own_privacy_account_export(p_privacy_request_id uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.privacy_requests%rowtype;
begin
  select pr.* into v_request
  from public.privacy_requests pr
  where pr.id=p_privacy_request_id and pr.requester_user_id=v_actor_id;
  if not found or not private.is_account_privacy_export_case(v_request) then
    raise exception using errcode='P0002',message='PRIVACY_EXPORT_NOT_FOUND';
  end if;
  if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
    raise exception using errcode='42501',message='MFA_STEP_UP_REQUIRED';
  end if;

  return jsonb_build_object(
    'formatVersion',1,
    'scope','crecy_platform_account',
    'privacyRequestId',v_request.id,
    'generatedAt',now(),
    'account',(
      select jsonb_build_object(
        'email',u.email,'createdAt',u.created_at,'emailConfirmedAt',u.email_confirmed_at,
        'displayName',p.display_name,'phone',p.primary_phone_e164,'locale',p.locale,'timeZone',p.time_zone,
        'reduceMotion',p.reduce_motion,'highContrast',p.high_contrast,'textScale',p.text_scale
      )
      from auth.users u left join public.profiles p on p.user_id=u.id
      where u.id=v_actor_id
    ),
    'notificationPreferences',coalesce((
      select jsonb_agg(jsonb_build_object(
        'category',p.category,'channel',p.channel,'enabled',p.enabled,'updatedAt',p.updated_at
      ) order by p.category,p.channel)
      from public.notification_preferences p where p.user_id=v_actor_id
    ),'[]'::jsonb),
    'platformConsents',coalesce((
      select jsonb_agg(jsonb_build_object(
        'type',c.consent_type,'purpose',c.purpose_code,'documentVersion',c.legal_document_version,
        'status',c.status,'grantedAt',c.granted_at,'withdrawnAt',c.withdrawn_at,'createdAt',c.created_at
      ) order by c.created_at desc,c.id desc)
      from (
        select consent_type,purpose_code,legal_document_version,status,granted_at,withdrawn_at,created_at,id
        from public.consent_records where user_id=v_actor_id and organization_id is null
        order by created_at desc,id desc limit 500
      ) c
    ),'[]'::jsonb),
    'platformConsentLimit',500
  );
end;
$$;
revoke all on function public.get_own_privacy_account_export(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_own_privacy_account_export(uuid) to authenticated;

create or replace function public.get_own_privacy_request_receipt(p_privacy_request_id uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_request public.privacy_requests%rowtype;
begin
  select pr.* into v_request from public.privacy_requests pr
  where pr.id=p_privacy_request_id and pr.requester_user_id=(select auth.uid())
    and pr.identity_verification_status='verified';
  if not found then
    raise exception using errcode='P0002',message='PRIVACY_REQUEST_NOT_FOUND';
  end if;
  if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then
    raise exception using errcode='42501',message='MFA_STEP_UP_REQUIRED';
  end if;
  return jsonb_build_object(
    'privacyRequestId',v_request.id,
    'organizationName',(select o.display_name from public.organizations o where o.id=v_request.organization_id),
    'requestType',v_request.request_type,
    'status',v_request.status,
    'identityVerifiedAt',v_request.identity_verified_at,
    'submittedAt',v_request.submitted_at,
    'dueAt',v_request.due_at,
    'completedAt',v_request.completed_at
  )
  || case when private.is_account_privacy_export_case(v_request)
       then jsonb_build_object('canDownloadAccountExport',true) else '{}'::jsonb end
  || case when v_request.controller_role='operator'
       and v_request.status in ('fulfilled','partially_fulfilled','denied')
       then jsonb_build_object('decisionReason',v_request.decision_reason) else '{}'::jsonb end;
end;
$$;

create or replace function public.get_privacy_request_workspace(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_can_review boolean;
begin
  perform private.enter_organization_context(p_organization_id);
  v_can_review := private.has_unscoped_org_permission(p_organization_id,'organization.manage');

  return jsonb_build_object(
    'authenticatorLevel',coalesce(auth.jwt()->>'aal','aal1'),
    'canRecordOutcomes',v_can_review,
    'organizations',coalesce((
      select jsonb_agg(jsonb_build_object(
        'organizationId',o.id,'organizationName',o.display_name,'countryCode',o.headquarters_country_code
      ))
      from public.organizations o
      where o.id=p_organization_id and o.status not in ('closing','closed')
    ),'[]'::jsonb),
    'items',coalesce((
      select jsonb_agg(private.privacy_request_workspace_item(pr.request) order by pr.created_at desc,pr.id desc)
      from (
        select pr as request,pr.created_at,pr.id
        from public.privacy_requests pr
        where pr.organization_id=p_organization_id and (pr.requester_user_id=v_actor_id or v_can_review)
        order by pr.created_at desc,pr.id desc limit 100
      ) pr
    ),'[]'::jsonb)
  );
end;
$$;

-- A current workspace controller records a dated decision made outside this workflow.
-- Approval does not execute a deletion, send a message, or release a hold.
create function public.record_operator_privacy_outcome(
  p_organization_id uuid,
  p_privacy_request_id uuid,
  p_expected_version integer,
  p_outcome text,
  p_requester_message text,
  p_review_reference text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.privacy_requests%rowtype;
  v_previous private.idempotency_records%rowtype;
  v_message text := trim(coalesce(p_requester_message,''));
  v_reference text := trim(coalesce(p_review_reference,''));
  v_key text := trim(coalesce(p_idempotency_key,''));
  v_hash text;
  v_response jsonb;
  v_correlation_id uuid := gen_random_uuid();
  v_now timestamptz := now();
begin
  perform private.enter_organization_context(p_organization_id);
  if not private.has_unscoped_org_permission(p_organization_id,'organization.manage') then
    raise exception using errcode='42501',message='ORGANIZATION_SCOPE_DENIED';
  end if;
  select pr.* into v_request from public.privacy_requests pr
    where pr.id=p_privacy_request_id and pr.organization_id=p_organization_id
      and pr.controller_role='operator' for update;
  if not found then
    raise exception using errcode='P0002',message='PRIVACY_REQUEST_NOT_FOUND';
  end if;
  if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
    raise exception using errcode='42501',message='MFA_STEP_UP_REQUIRED';
  end if;
  if p_expected_version is null or p_expected_version<1
     or p_outcome is null or p_outcome not in ('fulfilled','partially_fulfilled','denied')
     or length(v_message) not between 1 and 500
     or v_reference !~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$'
     or length(v_key) not between 8 and 200 then
    raise exception using errcode='22023',message='INVALID_PRIVACY_OUTCOME';
  end if;

  v_hash := encode(sha256(convert_to(
    jsonb_build_array(p_privacy_request_id,p_expected_version,p_outcome,v_message,v_reference)::text,'UTF8'
  )),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',p_organization_id::text,v_actor_id::text,'RecordOperatorPrivacyOutcome',v_key
  ),0));
  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='RecordOperatorPrivacyOutcome' and r.idempotency_key=v_key;
  if found then
    if v_previous.request_hash<>v_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  if v_request.version<>p_expected_version then
    raise exception using errcode='40001',message='VERSION_CONFLICT';
  end if;
  if v_request.identity_verification_status<>'verified'
     or v_request.status not in ('operator_action_required','processing') then
    raise exception using errcode='23514',message='PRIVACY_REQUEST_NOT_ACTIONABLE';
  end if;

  perform 1 from private.privacy_request_jobs j where j.privacy_request_id=p_privacy_request_id for update;
  if exists (select 1 from private.privacy_request_jobs j where j.privacy_request_id=p_privacy_request_id and j.status='processing') then
    raise exception using errcode='23514',message='PRIVACY_COMMAND_IN_PROGRESS';
  end if;
  if p_outcome='fulfilled' and (
    v_request.request_type='deletion'
    or exists (select 1 from private.privacy_request_jobs j where j.privacy_request_id=p_privacy_request_id and j.status='blocked_by_hold')
  ) then
    raise exception using errcode='23514',message='PRIVACY_FULL_FULFILLMENT_UNAVAILABLE';
  end if;

  v_response := jsonb_build_object('privacyRequestId',p_privacy_request_id,'status',p_outcome,'version',v_request.version+1);
  insert into private.idempotency_records(
    organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at,
    state,response_status,response_body,resource_type,resource_id,completed_at
  ) values (
    p_organization_id,v_actor_id,'RecordOperatorPrivacyOutcome',v_key,v_hash,v_now+interval '24 hours',
    'completed',200,v_response,'privacy_request',p_privacy_request_id,v_now
  );

  update public.privacy_requests
  set status=p_outcome,completed_at=v_now,decision_reason=v_message,version=version+1
  where id=p_privacy_request_id;
  -- Finish this manual pathway without claiming that any queued action ran.
  update private.privacy_request_jobs
  set status='canceled',completed_at=v_now,result=jsonb_build_object('outcome','operator_decision_recorded')
  where privacy_request_id=p_privacy_request_id and status='queued';

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,before_data,after_data
  ) values (
    p_organization_id,v_actor_id,'user','privacy_request.operator_outcome_recorded','privacy_request',
    p_privacy_request_id,v_correlation_id,jsonb_build_object('status',v_request.status,'version',v_request.version),
    jsonb_build_object('status',p_outcome,'version',v_request.version+1,'reviewReference',v_reference)
  );
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values(p_organization_id,'privacy_request.operator_outcome_recorded','privacy_request',
    p_privacy_request_id,v_correlation_id,jsonb_build_object('privacyRequestId',p_privacy_request_id,'status',p_outcome));
  return v_response;
end;
$$;
revoke all on function public.record_operator_privacy_outcome(uuid,uuid,integer,text,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.record_operator_privacy_outcome(uuid,uuid,integer,text,text,text,text) to authenticated;

commit;
