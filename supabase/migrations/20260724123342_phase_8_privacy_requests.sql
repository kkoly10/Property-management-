begin;

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  requester_user_id uuid not null references auth.users(id) on delete restrict,
  request_type text not null check (request_type in (
    'access','correction','deletion','export','restriction','objection','withdraw_consent','appeal'
  )),
  jurisdiction_code text check (
    jurisdiction_code is null
    or jurisdiction_code ~ '^[A-Z]{2}(-[A-Z0-9]{1,8})?$'
  ),
  controller_role text not null check (controller_role in ('platform','operator','joint_review_required')),
  status text not null default 'submitted' check (status in (
    'submitted','identity_verification','operator_action_required','processing',
    'fulfilled','partially_fulfilled','denied','canceled'
  )),
  identity_verification_status text not null default 'pending' check (
    identity_verification_status in ('pending','verified','failed','waived')
  ),
  identity_verified_at timestamptz,
  identity_verified_by_user_id uuid references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  due_at timestamptz not null,
  completed_at timestamptz,
  canceled_at timestamptz,
  canceled_by_user_id uuid references auth.users(id) on delete restrict,
  decision_reason text,
  export_document_version_id uuid references public.document_versions(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  check (
    (identity_verification_status = 'verified') =
    (identity_verified_at is not null and identity_verified_by_user_id is not null)
  ),
  check ((status = 'canceled') = (canceled_at is not null and canceled_by_user_id is not null)),
  check (
    (status in ('fulfilled','partially_fulfilled','denied','canceled')) =
    (completed_at is not null)
  )
);

create index privacy_requests_requester_status_idx
  on public.privacy_requests(requester_user_id,status,created_at desc);
create index privacy_requests_org_status_due_idx
  on public.privacy_requests(organization_id,status,due_at)
  where organization_id is not null
    and status not in ('fulfilled','partially_fulfilled','denied','canceled');
create index privacy_requests_identity_verifier_idx
  on public.privacy_requests(identity_verified_by_user_id)
  where identity_verified_by_user_id is not null;
create index privacy_requests_canceled_by_idx
  on public.privacy_requests(canceled_by_user_id)
  where canceled_by_user_id is not null;
create index privacy_requests_export_document_idx
  on public.privacy_requests(export_document_version_id)
  where export_document_version_id is not null;

create table private.privacy_request_jobs (
  id uuid primary key default gen_random_uuid(),
  privacy_request_id uuid not null references public.privacy_requests(id) on delete cascade,
  job_type text not null check (job_type in ('discover','export','delete','anonymize','subprocessor_notify')),
  status text not null default 'queued' check (status in (
    'queued','processing','completed','failed','blocked_by_hold','canceled'
  )),
  blocked_until_verified boolean not null default true,
  result jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (privacy_request_id,job_type),
  check (
    (status in ('completed','failed','canceled')) =
    (completed_at is not null)
  )
);

create index privacy_request_jobs_pending_idx
  on private.privacy_request_jobs(available_at,created_at)
  where status = 'queued' and not blocked_until_verified;

create trigger privacy_requests_touch
before update on public.privacy_requests
for each row execute function private.touch_updated_at();

create trigger privacy_request_jobs_touch
before update on private.privacy_request_jobs
for each row execute function private.touch_updated_at();

alter table public.privacy_requests enable row level security;

create policy privacy_requests_self_or_admin_read
on public.privacy_requests
for select
to authenticated
using (
  requester_user_id = (select auth.uid())
  or (
    organization_id is not null
    and (select private.has_org_permission(organization_id,'organization.manage'))
  )
);

revoke all on public.privacy_requests from public,anon,authenticated,service_role;
revoke all on private.privacy_request_jobs from public,anon,authenticated,service_role;

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

  if p_organization_id is null then
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

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',coalesce(p_organization_id::text,'platform'),v_actor_id,'SubmitPrivacyRequest',trim(p_idempotency_key)
  ),0));

  select * into v_previous
  from private.idempotency_records r
  where r.organization_id is not distinct from p_organization_id
    and r.actor_user_id = v_actor_id
    and r.route = 'SubmitPrivacyRequest'
    and r.idempotency_key = trim(p_idempotency_key);
  if found then
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

create or replace function public.verify_privacy_request(
  p_privacy_request_id uuid,
  p_expected_version integer,
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
  v_request_hash text;
  v_new_status text;
  v_correlation_id uuid := gen_random_uuid();
  v_previous private.idempotency_records%rowtype;
  v_response jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
    raise exception using errcode='42501',message='MFA_STEP_UP_REQUIRED';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception using errcode='22023',message='INVALID_EXPECTED_VERSION';
  end if;
  if length(trim(coalesce(p_idempotency_key,''))) < 8
     or length(trim(p_idempotency_key)) > 200 then
    raise exception using errcode='22023',message='INVALID_IDEMPOTENCY_KEY';
  end if;

  select pr.* into v_request
  from public.privacy_requests pr
  where pr.id = p_privacy_request_id;
  if not found or v_request.requester_user_id <> v_actor_id then
    raise exception using errcode='42501',message='PRIVACY_REQUEST_NOT_FOUND';
  end if;

  v_request_hash := encode(sha256(convert_to(concat_ws(
    '|',p_privacy_request_id,p_expected_version
  ),'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',coalesce(v_request.organization_id::text,'platform'),v_actor_id,
    'VerifyPrivacyRequest',trim(p_idempotency_key)
  ),0));

  select * into v_previous
  from private.idempotency_records r
  where r.organization_id is not distinct from v_request.organization_id
    and r.actor_user_id=v_actor_id
    and r.route='VerifyPrivacyRequest'
    and r.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_previous.request_hash <> v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  select pr.* into v_request
  from public.privacy_requests pr
  where pr.id=p_privacy_request_id
  for update;
  if v_request.version <> p_expected_version then
    raise exception using errcode='40001',message='VERSION_CONFLICT';
  end if;
  if v_request.status <> 'identity_verification'
     or v_request.identity_verification_status <> 'pending' then
    raise exception using errcode='23514',message='PRIVACY_REQUEST_NOT_VERIFIABLE';
  end if;

  insert into private.idempotency_records(
    organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at
  )
  values (
    v_request.organization_id,v_actor_id,'VerifyPrivacyRequest',
    trim(p_idempotency_key),v_request_hash,now()+interval '24 hours'
  );

  v_new_status := case
    when v_request.controller_role='platform' then 'processing'
    else 'operator_action_required'
  end;
  update public.privacy_requests
  set identity_verification_status='verified',
      identity_verified_at=now(),
      identity_verified_by_user_id=v_actor_id,
      status=v_new_status,
      version=version+1
  where id=p_privacy_request_id;

  update private.privacy_request_jobs
  set blocked_until_verified=false,available_at=now()
  where privacy_request_id=p_privacy_request_id
    and status='queued';

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,
    correlation_id,before_data,after_data
  )
  values (
    v_request.organization_id,v_actor_id,'user','privacy_request.identity_verified',
    'privacy_request',p_privacy_request_id,v_correlation_id,
    jsonb_build_object(
      'status',v_request.status,
      'identityVerificationStatus',v_request.identity_verification_status,
      'version',v_request.version
    ),
    jsonb_build_object(
      'status',v_new_status,
      'identityVerificationStatus','verified',
      'version',v_request.version+1
    )
  );

  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  )
  values (
    v_request.organization_id,'privacy_request.verified','privacy_request',
    p_privacy_request_id,v_correlation_id,
    jsonb_build_object(
      'privacyRequestId',p_privacy_request_id,
      'controllerRole',v_request.controller_role,
      'status',v_new_status
    )
  );

  v_response := jsonb_build_object(
    'privacyRequestId',p_privacy_request_id,
    'status',v_new_status,
    'identityVerificationStatus','verified',
    'version',v_request.version+1
  );
  update private.idempotency_records r
  set state='completed',response_status=200,response_body=v_response,
      resource_type='privacy_request',resource_id=p_privacy_request_id,completed_at=now()
  where r.organization_id is not distinct from v_request.organization_id
    and r.actor_user_id=v_actor_id
    and r.route='VerifyPrivacyRequest'
    and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;

create or replace function public.cancel_privacy_request(
  p_privacy_request_id uuid,
  p_expected_version integer,
  p_reason text,
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
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
  v_request_hash text;
  v_correlation_id uuid := gen_random_uuid();
  v_previous private.idempotency_records%rowtype;
  v_response jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception using errcode='22023',message='INVALID_EXPECTED_VERSION';
  end if;
  if v_reason is not null and length(v_reason) > 500 then
    raise exception using errcode='22023',message='INVALID_CANCELLATION_REASON';
  end if;
  if length(trim(coalesce(p_idempotency_key,''))) < 8
     or length(trim(p_idempotency_key)) > 200 then
    raise exception using errcode='22023',message='INVALID_IDEMPOTENCY_KEY';
  end if;

  select pr.* into v_request
  from public.privacy_requests pr
  where pr.id=p_privacy_request_id;
  if not found or not (
    v_request.requester_user_id=v_actor_id
    or (
      v_request.organization_id is not null
      and private.has_org_permission(v_request.organization_id,'organization.manage')
    )
  ) then
    raise exception using errcode='42501',message='PRIVACY_REQUEST_NOT_FOUND';
  end if;

  v_request_hash := encode(sha256(convert_to(concat_ws(
    '|',p_privacy_request_id,p_expected_version,v_reason
  ),'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',coalesce(v_request.organization_id::text,'platform'),v_actor_id,
    'CancelPrivacyRequest',trim(p_idempotency_key)
  ),0));

  select * into v_previous
  from private.idempotency_records r
  where r.organization_id is not distinct from v_request.organization_id
    and r.actor_user_id=v_actor_id
    and r.route='CancelPrivacyRequest'
    and r.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_previous.request_hash <> v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  select pr.* into v_request
  from public.privacy_requests pr
  where pr.id=p_privacy_request_id
  for update;
  if v_request.version <> p_expected_version then
    raise exception using errcode='40001',message='VERSION_CONFLICT';
  end if;
  if v_request.status in ('fulfilled','partially_fulfilled','denied','canceled') then
    raise exception using errcode='23514',message='PRIVACY_REQUEST_NOT_CANCELABLE';
  end if;

  insert into private.idempotency_records(
    organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at
  )
  values (
    v_request.organization_id,v_actor_id,'CancelPrivacyRequest',
    trim(p_idempotency_key),v_request_hash,now()+interval '24 hours'
  );

  update public.privacy_requests
  set status='canceled',completed_at=now(),canceled_at=now(),
      canceled_by_user_id=v_actor_id,decision_reason=v_reason,version=version+1
  where id=p_privacy_request_id;

  update private.privacy_request_jobs
  set status='canceled',completed_at=now(),
      result=jsonb_build_object('outcome','request_canceled')
  where privacy_request_id=p_privacy_request_id
    and status in ('queued','processing','blocked_by_hold');

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,
    correlation_id,reason,before_data,after_data
  )
  values (
    v_request.organization_id,v_actor_id,'user','privacy_request.canceled',
    'privacy_request',p_privacy_request_id,v_correlation_id,v_reason,
    jsonb_build_object('status',v_request.status,'version',v_request.version),
    jsonb_build_object('status','canceled','version',v_request.version+1)
  );

  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  )
  values (
    v_request.organization_id,'privacy_request.canceled','privacy_request',
    p_privacy_request_id,v_correlation_id,
    jsonb_build_object('privacyRequestId',p_privacy_request_id,'status','canceled')
  );

  v_response := jsonb_build_object(
    'privacyRequestId',p_privacy_request_id,
    'status','canceled',
    'version',v_request.version+1
  );
  update private.idempotency_records r
  set state='completed',response_status=200,response_body=v_response,
      resource_type='privacy_request',resource_id=p_privacy_request_id,completed_at=now()
  where r.organization_id is not distinct from v_request.organization_id
    and r.actor_user_id=v_actor_id
    and r.route='CancelPrivacyRequest'
    and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;

create or replace function public.get_privacy_request_workspace()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then jsonb_build_object(
      'authenticatorLevel','aal1',
      'organizations','[]'::jsonb,
      'items','[]'::jsonb
    )
    else jsonb_build_object(
      'authenticatorLevel',coalesce(auth.jwt()->>'aal','aal1'),
      'organizations',coalesce((
        select jsonb_agg(jsonb_build_object(
          'organizationId',scope.organization_id,
          'organizationName',scope.organization_name,
          'countryCode',scope.country_code
        ) order by scope.organization_name,scope.organization_id)
        from (
          select distinct o.id as organization_id,o.display_name as organization_name,
                 o.headquarters_country_code as country_code
          from public.organizations o
          where o.status not in ('closing','closed')
            and (
              private.is_active_org_member(o.id)
              or exists (
                select 1
                from public.user_relationships ur
                where ur.organization_id=o.id
                  and ur.user_id=(select auth.uid())
                  and ur.status='active'
              )
            )
        ) scope
      ),'[]'::jsonb),
      'items',coalesce((
        select jsonb_agg(jsonb_build_object(
          'privacyRequestId',pr.id,
          'organizationId',pr.organization_id,
          'organizationName',o.display_name,
          'requestType',pr.request_type,
          'jurisdictionCode',pr.jurisdiction_code,
          'controllerRole',pr.controller_role,
          'status',pr.status,
          'identityVerificationStatus',pr.identity_verification_status,
          'submittedAt',pr.submitted_at,
          'dueAt',pr.due_at,
          'completedAt',pr.completed_at,
          'version',pr.version,
          'jobCount',(select count(*)::integer from private.privacy_request_jobs j where j.privacy_request_id=pr.id),
          'queuedJobCount',(select count(*)::integer from private.privacy_request_jobs j where j.privacy_request_id=pr.id and j.status='queued'),
          'blockedByHold',exists(
            select 1 from private.privacy_request_jobs j
            where j.privacy_request_id=pr.id and j.status='blocked_by_hold'
          ),
          'canVerify',pr.requester_user_id=(select auth.uid())
            and pr.identity_verification_status='pending'
            and pr.status='identity_verification',
          'canCancel',pr.status not in ('fulfilled','partially_fulfilled','denied','canceled')
        ) order by pr.created_at desc,pr.id desc)
        from (
          select visible.*
          from public.privacy_requests visible
          where visible.requester_user_id=(select auth.uid())
            or (
              visible.organization_id is not null
              and private.has_org_permission(visible.organization_id,'organization.manage')
            )
          order by visible.created_at desc,visible.id desc
          limit 100
        ) pr
        left join public.organizations o on o.id=pr.organization_id
      ),'[]'::jsonb)
    )
  end;
$$;

revoke all on function public.submit_privacy_request(uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.verify_privacy_request(uuid,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.cancel_privacy_request(uuid,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.get_privacy_request_workspace() from public,anon,authenticated,service_role;

grant execute on function public.submit_privacy_request(uuid,text,text,text) to authenticated;
grant execute on function public.verify_privacy_request(uuid,integer,text) to authenticated;
grant execute on function public.cancel_privacy_request(uuid,integer,text,text) to authenticated;
grant execute on function public.get_privacy_request_workspace() to authenticated;

commit;
