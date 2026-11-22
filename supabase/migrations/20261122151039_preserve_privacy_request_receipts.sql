begin;

create index privacy_requests_requester_history_idx
  on public.privacy_requests (requester_user_id,created_at desc,id desc);

-- Used only by the two separately scoped workspace projections.
create function private.privacy_request_workspace_item(p_request public.privacy_requests)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'privacyRequestId',p_request.id,
    'organizationId',p_request.organization_id,
    'organizationName',(select o.display_name from public.organizations o where o.id=p_request.organization_id),
    'requestType',p_request.request_type,
    'jurisdictionCode',p_request.jurisdiction_code,
    'controllerRole',p_request.controller_role,
    'status',p_request.status,
    'identityVerificationStatus',p_request.identity_verification_status,
    'submittedAt',p_request.submitted_at,
    'dueAt',p_request.due_at,
    'completedAt',p_request.completed_at,
    'version',p_request.version,
    'jobCount',count(j.id)::integer,
    'queuedJobCount',count(j.id) filter (where j.status='queued'),
    'blockedByHold',coalesce(bool_or(j.status='blocked_by_hold'),false),
    'canVerify',p_request.requester_user_id=(select auth.uid())
      and p_request.identity_verification_status='pending'
      and p_request.status='identity_verification',
    'canCancel',p_request.status not in ('fulfilled','partially_fulfilled','denied','canceled'),
    'canViewReceipt',p_request.requester_user_id=(select auth.uid())
      and p_request.identity_verification_status='verified'
  )
  from private.privacy_request_jobs j where j.privacy_request_id=p_request.id;
$$;
revoke all on function private.privacy_request_workspace_item(public.privacy_requests)
  from public,anon,authenticated,service_role;

create function public.get_relationship_privacy_request_workspace(p_before_request_id uuid)
returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  with page_with_lookahead as (
    select pr as request,pr.created_at,pr.id from public.privacy_requests pr
    where pr.requester_user_id=(select auth.uid()) and (
      p_before_request_id is null or exists (
        select 1 from public.privacy_requests cursor_case
        where cursor_case.id=p_before_request_id and cursor_case.requester_user_id=(select auth.uid())
          and (pr.created_at,pr.id)<(cursor_case.created_at,cursor_case.id)
      )
    )
    order by pr.created_at desc,pr.id desc limit 101
  ), page as (
    select * from page_with_lookahead order by created_at desc,id desc limit 100
  )
  select jsonb_build_object(
    'authenticatorLevel',coalesce(auth.jwt()->>'aal','aal1'),
    'organizations',coalesce((
      select jsonb_agg(jsonb_build_object(
        'organizationId',o.id,'organizationName',o.display_name,'countryCode',o.headquarters_country_code
      ) order by o.display_name,o.id)
      from public.organizations o
      where o.status not in ('closing','closed') and exists (
        select 1 from public.user_relationships ur
        where ur.organization_id=o.id and ur.user_id=(select auth.uid()) and ur.status='active'
      )
    ),'[]'::jsonb),
    'items',coalesce((
      select jsonb_agg(private.privacy_request_workspace_item(pr.request) order by pr.created_at desc,pr.id desc)
      from page pr
    ),'[]'::jsonb),
    'nextCursor',case when (select count(*) from page_with_lookahead)>100
      then (select id from page order by created_at,id limit 1) end
  );
$$;
revoke all on function public.get_relationship_privacy_request_workspace(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_relationship_privacy_request_workspace(uuid) to authenticated;

create or replace function public.get_relationship_privacy_request_workspace()
returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  select public.get_relationship_privacy_request_workspace(null::uuid);
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

-- An exact self-only receipt derived from the durable case after idempotency records expire.
-- Lookup the verified subject before returning an MFA challenge so foreign IDs are undisclosed.
create function public.get_own_privacy_request_receipt(p_privacy_request_id uuid)
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
  );
end;
$$;
revoke all on function public.get_own_privacy_request_receipt(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_own_privacy_request_receipt(uuid) to authenticated;

create or replace function public.submit_privacy_request(
  p_organization_id uuid,
  p_request_type text,
  p_jurisdiction_code text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request_type text := lower(trim(coalesce(p_request_type,'')));
  v_jurisdiction_code text := nullif(upper(trim(coalesce(p_jurisdiction_code,''))),'');
  v_organization public.organizations%rowtype;
  v_controller_role text;
  v_identity_status text;
  v_status text;
  v_request_hash text;
  v_privacy_request_id uuid;
  v_due_at timestamptz := now() + interval '30 days';
  v_correlation_id uuid := gen_random_uuid();
  v_previous private.idempotency_records%rowtype;
  v_response jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if length(trim(coalesce(p_idempotency_key,''))) < 8
     or length(trim(p_idempotency_key)) > 200 then
    raise exception using errcode='22023',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if v_request_type not in (
    'access','correction','deletion','export','restriction','objection','withdraw_consent','appeal'
  ) then
    raise exception using errcode='22023',message='INVALID_PRIVACY_REQUEST_TYPE';
  end if;
  if v_jurisdiction_code is not null
     and v_jurisdiction_code !~ '^[A-Z]{2}(-[A-Z0-9]{1,8})?$' then
    raise exception using errcode='22023',message='INVALID_JURISDICTION';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',coalesce(p_organization_id::text,'platform'),v_actor_id,'SubmitPrivacyRequest',trim(p_idempotency_key)
  ),0));

  select * into v_previous
  from private.idempotency_records r
  where r.organization_id is not distinct from p_organization_id
    and r.actor_user_id = v_actor_id
    and r.route = 'SubmitPrivacyRequest'
    and r.idempotency_key = trim(p_idempotency_key);
  if v_previous.id is not null then
    -- Match the original resolved jurisdiction after an ambiguous acknowledgment.
    -- This exact actor/key replay never grants permission to open another case.
    if p_organization_id is not null and v_jurisdiction_code is null then
      v_jurisdiction_code := v_previous.response_body->>'jurisdictionCode';
      if v_jurisdiction_code is null then
        select o.headquarters_country_code into v_jurisdiction_code
          from public.organizations o where o.id=p_organization_id;
      end if;
    end if;
  elsif p_organization_id is null then
    v_controller_role := 'platform';
  else
    select o.* into v_organization
    from public.organizations o
    where o.id = p_organization_id
      and o.status not in ('closing','closed');
    if not found then
      raise exception using errcode='42501',message='ORGANIZATION_SCOPE_DENIED';
    end if;
    if not (
      private.is_active_org_member(p_organization_id)
      or exists (
        select 1
        from public.user_relationships ur
        where ur.organization_id = p_organization_id
          and ur.user_id = v_actor_id
          and ur.status = 'active'
      )
    ) then
      raise exception using errcode='42501',message='ORGANIZATION_SCOPE_DENIED';
    end if;
    if v_jurisdiction_code is null then
      v_jurisdiction_code := v_organization.headquarters_country_code;
    elsif left(v_jurisdiction_code,2) <> v_organization.headquarters_country_code then
      raise exception using errcode='22023',message='JURISDICTION_ORGANIZATION_MISMATCH';
    end if;
    v_controller_role := 'operator';
  end if;

  v_identity_status := case
    when coalesce(auth.jwt()->>'aal','aal1') = 'aal2' then 'verified'
    else 'pending'
  end;
  v_status := case
    when v_identity_status <> 'verified' then 'identity_verification'
    when v_controller_role = 'platform' then 'processing'
    else 'operator_action_required'
  end;
  v_request_hash := encode(sha256(convert_to(concat_ws(
    '|',p_organization_id,v_request_type,v_jurisdiction_code
  ),'UTF8')),'hex');

  if v_previous.id is not null then
    if v_previous.request_hash <> v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state = 'completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  insert into private.idempotency_records(
    organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at
  )
  values (
    p_organization_id,v_actor_id,'SubmitPrivacyRequest',trim(p_idempotency_key),
    v_request_hash,now()+interval '24 hours'
  );

  insert into public.privacy_requests(
    organization_id,requester_user_id,request_type,jurisdiction_code,controller_role,
    status,identity_verification_status,identity_verified_at,identity_verified_by_user_id,due_at
  )
  values (
    p_organization_id,v_actor_id,v_request_type,v_jurisdiction_code,v_controller_role,
    v_status,v_identity_status,
    case when v_identity_status = 'verified' then now() end,
    case when v_identity_status = 'verified' then v_actor_id end,
    v_due_at
  )
  returning id into v_privacy_request_id;

  insert into private.privacy_request_jobs(
    privacy_request_id,job_type,blocked_until_verified
  )
  values (
    v_privacy_request_id,'discover',v_identity_status <> 'verified'
  );

  if v_request_type in ('access','export') then
    insert into private.privacy_request_jobs(
      privacy_request_id,job_type,blocked_until_verified
    )
    values (
      v_privacy_request_id,'export',v_identity_status <> 'verified'
    );
  elsif v_request_type = 'deletion' then
    insert into private.privacy_request_jobs(
      privacy_request_id,job_type,blocked_until_verified
    )
    values
      (v_privacy_request_id,'delete',v_identity_status <> 'verified'),
      (v_privacy_request_id,'anonymize',v_identity_status <> 'verified'),
      (v_privacy_request_id,'subprocessor_notify',v_identity_status <> 'verified');
  elsif v_request_type in ('restriction','objection','withdraw_consent') then
    insert into private.privacy_request_jobs(
      privacy_request_id,job_type,blocked_until_verified
    )
    values (
      v_privacy_request_id,'subprocessor_notify',v_identity_status <> 'verified'
    );
  end if;

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,
    correlation_id,after_data
  )
  values (
    p_organization_id,v_actor_id,'user','privacy_request.submitted','privacy_request',
    v_privacy_request_id,v_correlation_id,
    jsonb_build_object(
      'requestType',v_request_type,
      'jurisdictionCode',v_jurisdiction_code,
      'controllerRole',v_controller_role,
      'status',v_status,
      'identityVerificationStatus',v_identity_status,
      'dueAt',v_due_at
    )
  );

  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  )
  values (
    p_organization_id,'privacy_request.submitted','privacy_request',
    v_privacy_request_id,v_correlation_id,
    jsonb_build_object(
      'privacyRequestId',v_privacy_request_id,
      'requestType',v_request_type,
      'controllerRole',v_controller_role,
      'dueAt',v_due_at
    )
  );

  v_response := jsonb_build_object(
    'privacyRequestId',v_privacy_request_id,
    'requestType',v_request_type,
    'status',v_status,
    'identityVerificationStatus',v_identity_status,
    'controllerRole',v_controller_role,
    'jurisdictionCode',v_jurisdiction_code,
    'dueAt',v_due_at,
    'version',1
  );

  update private.idempotency_records r
  set state='completed',response_status=201,response_body=v_response,
      resource_type='privacy_request',resource_id=v_privacy_request_id,completed_at=now()
  where r.organization_id is not distinct from p_organization_id
    and r.actor_user_id=v_actor_id
    and r.route='SubmitPrivacyRequest'
    and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;

commit;
