-- Serialize authority and ownership writes before checking mutable state.
-- RPC signatures, grants, idempotency records and audit/event contracts are preserved.
begin;

-- Write a shared tuple on every acquisition. READ COMMITTED readers see the
-- previous writer's commit. At stronger isolation PostgreSQL rejects stale
-- snapshots, preventing two writers from deciding on the same outdated state.
create table private.authority_write_locks (
  scope text not null check (scope in ('staff', 'property_ownership')),
  resource_id uuid not null,
  primary key (scope, resource_id)
);
revoke all on table private.authority_write_locks from public,anon,authenticated,service_role;

create function private.lock_authority_write(p_scope text,p_resource_id uuid)
returns void
language sql
set search_path = ''
as $$
  insert into private.authority_write_locks(scope,resource_id)
  values (p_scope,p_resource_id)
  on conflict (scope,resource_id) do update set resource_id=excluded.resource_id;
$$;
revoke all on function private.lock_authority_write(text,uuid) from public,anon,authenticated,service_role;

create function private.lock_staff_management(p_organization_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_checked_at timestamptz;
begin
  -- Avoid locking an organization on behalf of an unrelated actor.
  if not private.has_org_permission(p_organization_id,'organization.manage') then
    raise exception using errcode='42501',message='ORGANIZATION_SCOPE_DENIED';
  end if;

  perform private.lock_authority_write('staff',p_organization_id);
  v_checked_at := clock_timestamp();
  -- Recheck after the wait and evaluate time-bound access at the decision time.
  if not exists (
    select 1
    from public.organization_memberships m
    join public.role_permissions rp on rp.role_code=m.role_code
    where m.organization_id=p_organization_id
      and m.user_id=auth.uid()
      and m.status='active'
      and m.starts_at<=v_checked_at
      and (m.ends_at is null or m.ends_at>v_checked_at)
      and rp.permission_code in ('*','organization.manage')
      and (private.active_organization_id() is null or p_organization_id=private.active_organization_id())
  ) then
    raise exception using errcode='42501',message='ORGANIZATION_SCOPE_DENIED';
  end if;
end;
$$;
revoke all on function private.lock_staff_management(uuid) from public,anon,authenticated,service_role;

create function private.lock_staff_membership_write(p_membership_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  -- Resolve the scope before taking any target membership row lock.
  select m.organization_id into v_organization_id
  from public.organization_memberships m
  where m.id=p_membership_id;
  if not found then
    raise exception using errcode='P0002',message='MEMBERSHIP_NOT_FOUND';
  end if;
  perform private.lock_staff_management(v_organization_id);
  return v_organization_id;
end;
$$;
revoke all on function private.lock_staff_membership_write(uuid) from public,anon,authenticated,service_role;

create function private.assert_staff_owner_continuity(
  p_before public.organization_memberships,
  p_replacement tstzrange
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_future tstzrange := tstzrange(clock_timestamp(),null,'[)');
  v_affected_window tstzrange;
  v_coverage tstzmultirange;
begin
  if p_before.role_code<>'org_owner' or p_before.status<>'active' then
    return;
  end if;

  v_affected_window := tstzrange(p_before.starts_at,nullif(p_before.ends_at,'infinity'::timestamptz),'[)') * v_future;
  if isempty(v_affected_window) or coalesce(p_replacement @> v_affected_window,false) then
    return;
  end if;

  -- Adjacent [start,end) tenures can provide continuous coverage. Pending invites
  -- and inactive memberships cannot provide future authority. Widening an owner's
  -- tenure remains possible even if a legacy workspace already has a gap.
  select range_agg(tenure.owner_window) into v_coverage
  from (
    select tstzrange(m.starts_at,nullif(m.ends_at,'infinity'::timestamptz),'[)') as owner_window
    from public.organization_memberships m
    where m.organization_id=p_before.organization_id
      and m.id<>p_before.id
      and m.role_code='org_owner'
      and m.status='active'
    union all
    select p_replacement
  ) tenure;
  if not coalesce(v_coverage @> v_future,false) then
    raise exception using errcode='23514',message='SOLE_OWNER_REQUIRED';
  end if;
end;
$$;
revoke all on function private.assert_staff_owner_continuity(public.organization_memberships,tstzrange) from public,anon,authenticated,service_role;


create or replace function public.invite_staff_member(
  p_organization_id uuid,
  p_invited_user_id uuid,
  p_email text,
  p_role_code text,
  p_property_ids uuid[],
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_mfa_required boolean,
  p_locale text,
  p_token_hash text,
  p_token_prefix text,
  p_audit_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email,'')));
  v_role public.role_definitions%rowtype;
  v_property_ids uuid[] := coalesce(p_property_ids,'{}'::uuid[]);
  v_starts_at timestamptz := coalesce(p_starts_at,now());
  v_checked_at timestamptz;
  v_reason text := nullif(trim(coalesce(p_audit_reason,'')),'');
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_membership_id uuid := gen_random_uuid();
  v_invitation_id uuid := gen_random_uuid();
  v_correlation_id uuid := gen_random_uuid();
  v_plan_code text;
  v_staff_limit integer;
  v_staff_count integer;
  v_status public.membership_status;
  v_response jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  perform private.lock_staff_management(p_organization_id);
  if length(trim(coalesce(p_idempotency_key,''))) not between 8 and 200 then
    raise exception using errcode='22023',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode='22023',message='INVALID_EMAIL';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$'
     or length(trim(coalesce(p_token_prefix,''))) not between 6 and 16 then
    raise exception using errcode='22023',message='INVALID_INVITATION_TOKEN';
  end if;
  if p_locale not in ('en-US','es-MX','en-CA','fr-CA') then
    raise exception using errcode='22023',message='INVALID_LOCALE';
  end if;
  if p_ends_at is not null and p_ends_at<=v_starts_at then
    raise exception using errcode='22023',message='INVALID_MEMBERSHIP_DATES';
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id=p_invited_user_id and lower(u.email)=v_email
  ) then
    raise exception using errcode='22023',message='INVITED_USER_EMAIL_MISMATCH';
  end if;
  if p_invited_user_id=v_actor_id then
    raise exception using errcode='22023',message='CANNOT_INVITE_SELF';
  end if;

  select * into v_role
  from public.role_definitions r
  where r.code=p_role_code;
  if not found then
    raise exception using errcode='22023',message='INVALID_ROLE';
  end if;
  select coalesce(array_agg(distinct p order by p),'{}'::uuid[])
  into v_property_ids
  from unnest(v_property_ids) p;
  if not v_role.organization_wide_allowed
     and cardinality(v_property_ids)=0 then
    raise exception using errcode='22023',message='PROPERTY_SCOPE_REQUIRED';
  end if;
  if exists (
    select 1
    from unnest(v_property_ids) requested(property_id)
    left join public.properties p
      on p.id=requested.property_id and p.organization_id=p_organization_id
    where p.id is null
  ) then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  v_checked_at := clock_timestamp();
  if p_role_code='org_owner'
     and not exists (
       select 1 from public.organization_memberships m
       where m.organization_id=p_organization_id
         and m.user_id=v_actor_id
         and m.role_code='org_owner'
         and m.status='active'
         and m.starts_at<=v_checked_at
         and (m.ends_at is null or m.ends_at>v_checked_at)
     ) then
    raise exception using errcode='42501',message='OWNER_ROLE_REQUIRED';
  end if;
  if p_role_code in ('org_owner','org_admin','accountant')
     and coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then
    raise exception using errcode='42501',message='MFA_STEP_UP_REQUIRED';
  end if;
  if p_role_code in ('org_owner','org_admin','accountant') and v_reason is null then
    raise exception using errcode='22023',message='AUDIT_REASON_REQUIRED';
  end if;

  v_request_hash := encode(sha256(convert_to(concat_ws(
    '|',p_organization_id,p_invited_user_id,v_email,p_role_code,
    array_to_string(v_property_ids,','),p_starts_at,p_ends_at,
    coalesce(p_mfa_required,false),p_locale,p_token_hash,v_reason
  ),'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',p_organization_id,v_actor_id,'InviteStaffMember',trim(p_idempotency_key)
  ),0));

  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=p_organization_id
    and r.actor_scope='user:'||v_actor_id::text
    and r.route='InviteStaffMember'
    and r.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then
      return v_previous.response_body||jsonb_build_object('idempotentReplay',true);
    end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  if exists (
    select 1 from public.organization_memberships m
    where m.organization_id=p_organization_id
      and m.user_id=p_invited_user_id
      and m.status in ('invited','active','suspended')
  ) then
    raise exception using errcode='23505',message='MEMBERSHIP_ALREADY_EXISTS';
  end if;

  select s.plan_code into v_plan_code
  from public.organization_subscriptions s
  where s.organization_id=p_organization_id
    and s.status in ('trialing','active','past_due','restricted')
  order by s.created_at desc
  limit 1
  for update;
  if not found then
    raise exception using errcode='23514',message='PLAN_UNAVAILABLE';
  end if;
  select e.limit_value::integer into v_staff_limit
  from public.plan_entitlements e
  where e.plan_code=v_plan_code
    and e.feature_code='core.staff'
    and e.enabled;
  if not found then
    raise exception using errcode='23514',message='PLAN_UNAVAILABLE';
  end if;
  select count(*)::integer into v_staff_count
  from public.organization_memberships m
  where m.organization_id=p_organization_id
    and m.status in ('invited','active','suspended')
    and (m.ends_at is null or m.ends_at>now());
  if v_staff_limit is not null and v_staff_count>=v_staff_limit then
    raise exception using errcode='23514',message='PLAN_LIMIT_EXCEEDED';
  end if;

  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,
    request_hash,expires_at
  ) values (
    p_organization_id,v_actor_id,'user:'||v_actor_id::text,
    'InviteStaffMember',trim(p_idempotency_key),v_request_hash,
    now()+interval '24 hours'
  );

  v_status := 'invited';
  insert into public.organization_memberships(
    id,organization_id,user_id,role_code,status,mfa_required,
    starts_at,ends_at,invited_by
  ) values (
    v_membership_id,p_organization_id,p_invited_user_id,p_role_code,
    v_status,coalesce(p_mfa_required,false) or
      p_role_code in ('org_owner','org_admin','accountant'),
    v_starts_at,p_ends_at,v_actor_id
  );
  insert into public.membership_property_scopes(
    organization_id,membership_id,property_id
  )
  select p_organization_id,v_membership_id,p
  from unnest(v_property_ids) p;

  update public.invitations i
  set status='superseded',revoked_at=now()
  where i.organization_id=p_organization_id
    and i.invitation_type='organization_member'
    and i.email=v_email
    and i.status='pending';
  insert into public.invitations(
    id,organization_id,invitation_type,email,membership_id,
    token_hash,token_prefix,locale,redirect_surface,status,
    expires_at,invited_by
  ) values (
    v_invitation_id,p_organization_id,'organization_member',v_email,
    v_membership_id,p_token_hash,trim(p_token_prefix),p_locale,
    'crecy_os','pending',now()+interval '72 hours',v_actor_id
  );

  insert into private.notification_jobs(
    organization_id,template_code,locale,channel,recipient_user_id,
    recipient_address,payload,idempotency_key
  ) values (
    p_organization_id,'staff_invitation',p_locale,'email',
    p_invited_user_id,v_email,
    jsonb_build_object(
      'invitationId',v_invitation_id,
      'organizationId',p_organization_id,
      'roleCode',p_role_code,
      'tokenPrefix',trim(p_token_prefix),
      'expiresAt',now()+interval '72 hours'
    ),
    'staff-invitation:'||v_invitation_id::text
  );

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,
    resource_id,correlation_id,reason,after_data
  ) values (
    p_organization_id,v_actor_id,'user','membership.invited','organization_membership',
    v_membership_id,v_correlation_id,v_reason,jsonb_build_object(
      'invitationId',v_invitation_id,
      'roleCode',p_role_code,
      'propertyIds',to_jsonb(v_property_ids),
      'startsAt',v_starts_at,
      'endsAt',p_ends_at,
      'mfaRequired',coalesce(p_mfa_required,false) or
        p_role_code in ('org_owner','org_admin','accountant'),
      'planCode',v_plan_code,
      'staffSeat',v_staff_count+1,
      'staffLimit',v_staff_limit
    )
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,
    correlation_id,payload
  ) values
  (
    p_organization_id,'membership.invited','organization_membership',
    v_membership_id,v_correlation_id,jsonb_build_object(
      'membershipId',v_membership_id,
      'invitationId',v_invitation_id,
      'roleCode',p_role_code,
      'propertyIds',to_jsonb(v_property_ids)
    )
  ),
  (
    p_organization_id,'notification.requested','invitation',
    v_invitation_id,v_correlation_id,jsonb_build_object(
      'templateCode','staff_invitation',
      'recipientRelationship','organization_member',
      'locale',p_locale,
      'channelPreference','email'
    )
  );

  v_response := jsonb_build_object(
    'membershipId',v_membership_id,
    'invitationId',v_invitation_id,
    'organizationId',p_organization_id,
    'email',v_email,
    'roleCode',p_role_code,
    'status',v_status,
    'propertyIds',to_jsonb(v_property_ids),
    'expiresAt',now()+interval '72 hours',
    'version',1
  );
  update private.idempotency_records r
  set state='completed',response_status=201,response_body=v_response,
      resource_type='organization_membership',resource_id=v_membership_id,
      completed_at=now()
  where r.organization_id=p_organization_id
    and r.actor_scope='user:'||v_actor_id::text
    and r.route='InviteStaffMember'
    and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;

create or replace function public.update_staff_membership(
  p_membership_id uuid,
  p_role_code text,
  p_status text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_mfa_required boolean,
  p_expected_version integer,
  p_audit_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_membership public.organization_memberships%rowtype;
  v_organization_id uuid;
  v_role public.role_definitions%rowtype;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_checked_at timestamptz;
  v_reason text := nullif(trim(coalesce(p_audit_reason,'')),'');
  v_sensitive boolean;
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if length(trim(coalesce(p_idempotency_key,''))) not between 8 and 200 then
    raise exception using errcode='22023',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception using errcode='22023',message='INVALID_EXPECTED_VERSION';
  end if;
  if p_status not in ('active','suspended') then
    raise exception using errcode='22023',message='INVALID_MEMBERSHIP_STATUS';
  end if;

  v_organization_id := private.lock_staff_membership_write(p_membership_id);
  select * into v_membership
  from public.organization_memberships m
  where m.id=p_membership_id and m.organization_id=v_organization_id
  for update;
  if not found then
    raise exception using errcode='P0002',message='MEMBERSHIP_NOT_FOUND';
  end if;
  if v_membership.user_id=v_actor_id then
    raise exception using errcode='22023',message='CANNOT_CHANGE_SELF';
  end if;
  if v_membership.status='revoked' then
    raise exception using errcode='23514',message='MEMBERSHIP_REVOKED';
  end if;

  if v_membership.status='invited' then
    raise exception using errcode='23514',message='MEMBERSHIP_INVITATION_PENDING';
  end if;

  select * into v_role
  from public.role_definitions r
  where r.code=p_role_code;
  if not found then
    raise exception using errcode='22023',message='INVALID_ROLE';
  end if;
  if not v_role.organization_wide_allowed
     and not exists (
       select 1 from public.membership_property_scopes s
       where s.membership_id=p_membership_id
     ) then
    raise exception using errcode='22023',message='PROPERTY_SCOPE_REQUIRED';
  end if;
  v_checked_at := clock_timestamp();
  if (v_membership.role_code='org_owner' or p_role_code='org_owner')
     and not exists (
       select 1 from public.organization_memberships m
       where m.organization_id=v_membership.organization_id
         and m.user_id=v_actor_id
         and m.role_code='org_owner'
         and m.status='active'
         and m.starts_at<=v_checked_at
         and (m.ends_at is null or m.ends_at>v_checked_at)
     ) then
    raise exception using errcode='42501',message='OWNER_ROLE_REQUIRED';
  end if;

  v_starts_at := coalesce(p_starts_at,v_membership.starts_at);
  v_ends_at := p_ends_at;
  if v_ends_at is not null and v_ends_at<=v_starts_at then
    raise exception using errcode='22023',message='INVALID_MEMBERSHIP_DATES';
  end if;
  v_sensitive :=
    p_role_code in ('org_owner','org_admin','accountant')
    or v_membership.role_code in ('org_owner','org_admin','accountant')
    or p_status='suspended';
  if v_sensitive and coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then
    raise exception using errcode='42501',message='MFA_STEP_UP_REQUIRED';
  end if;
  if v_sensitive and v_reason is null then
    raise exception using errcode='22023',message='AUDIT_REASON_REQUIRED';
  end if;

  v_request_hash := encode(sha256(convert_to(concat_ws(
    '|',p_membership_id,p_role_code,p_status,p_starts_at,p_ends_at,
    coalesce(p_mfa_required,false),p_expected_version,v_reason
  ),'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',v_membership.organization_id,v_actor_id,'UpdateStaffMembership',
    trim(p_idempotency_key)
  ),0));
  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=v_membership.organization_id
    and r.actor_scope='user:'||v_actor_id::text
    and r.route='UpdateStaffMembership'
    and r.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;
  if v_membership.version<>p_expected_version then
    raise exception using errcode='40001',message='MEMBERSHIP_VERSION_CONFLICT';
  end if;
  perform private.assert_staff_owner_continuity(
    v_membership,
    case when p_role_code='org_owner' and p_status='active'
      then tstzrange(v_starts_at,nullif(v_ends_at,'infinity'::timestamptz),'[)')
    end
  );
  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,
    request_hash,expires_at
  ) values (
    v_membership.organization_id,v_actor_id,'user:'||v_actor_id::text,
    'UpdateStaffMembership',trim(p_idempotency_key),v_request_hash,
    now()+interval '24 hours'
  );

  update public.organization_memberships m
  set role_code=p_role_code,status=p_status::public.membership_status,starts_at=v_starts_at,
      ends_at=v_ends_at,
      mfa_required=coalesce(p_mfa_required,false) or
        p_role_code in ('org_owner','org_admin','accountant'),
      updated_at=now(),version=version+1
  where m.id=p_membership_id;

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,
    resource_id,correlation_id,reason,before_data,after_data
  ) values (
    v_membership.organization_id,v_actor_id,'user','membership.changed',
    'organization_membership',p_membership_id,v_correlation_id,v_reason,
    jsonb_build_object(
      'roleCode',v_membership.role_code,'status',v_membership.status,
      'startsAt',v_membership.starts_at,'endsAt',v_membership.ends_at,
      'mfaRequired',v_membership.mfa_required,'version',v_membership.version
    ),
    jsonb_build_object(
      'roleCode',p_role_code,'status',p_status,'startsAt',v_starts_at,
      'endsAt',v_ends_at,
      'mfaRequired',coalesce(p_mfa_required,false) or
        p_role_code in ('org_owner','org_admin','accountant'),
      'version',v_membership.version+1
    )
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,
    correlation_id,payload
  ) values (
    v_membership.organization_id,'membership.changed',
    'organization_membership',p_membership_id,v_correlation_id,
    jsonb_build_object(
      'membershipId',p_membership_id,'roleCode',p_role_code,
      'status',p_status,'version',v_membership.version+1
    )
  );

  v_response := jsonb_build_object(
    'membershipId',p_membership_id,'organizationId',v_membership.organization_id,
    'roleCode',p_role_code,'status',p_status,'startsAt',v_starts_at,
    'endsAt',v_ends_at,'mfaRequired',
      coalesce(p_mfa_required,false) or
        p_role_code in ('org_owner','org_admin','accountant'),
    'version',v_membership.version+1
  );
  update private.idempotency_records r
  set state='completed',response_status=200,response_body=v_response,
      resource_type='organization_membership',resource_id=p_membership_id,
      completed_at=now()
  where r.organization_id=v_membership.organization_id
    and r.actor_scope='user:'||v_actor_id::text
    and r.route='UpdateStaffMembership'
    and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;

create or replace function public.replace_staff_property_scopes(
  p_membership_id uuid,
  p_property_ids uuid[],
  p_expected_version integer,
  p_audit_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_membership public.organization_memberships%rowtype;
  v_organization_id uuid;
  v_role public.role_definitions%rowtype;
  v_property_ids uuid[] := coalesce(p_property_ids,'{}'::uuid[]);
  v_previous_property_ids uuid[];
  v_reason text := nullif(trim(coalesce(p_audit_reason,'')),'');
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if length(trim(coalesce(p_idempotency_key,''))) not between 8 and 200 then
    raise exception using errcode='22023',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception using errcode='22023',message='INVALID_EXPECTED_VERSION';
  end if;
  v_organization_id := private.lock_staff_membership_write(p_membership_id);
  select * into v_membership
  from public.organization_memberships m
  where m.id=p_membership_id and m.organization_id=v_organization_id
  for update;
  if not found then
    raise exception using errcode='P0002',message='MEMBERSHIP_NOT_FOUND';
  end if;
  if v_membership.user_id=v_actor_id then
    raise exception using errcode='22023',message='CANNOT_CHANGE_SELF';
  end if;
  if v_membership.status='revoked' then
    raise exception using errcode='23514',message='MEMBERSHIP_REVOKED';
  end if;
  select * into v_role
  from public.role_definitions r
  where r.code=v_membership.role_code;

  select coalesce(array_agg(distinct p order by p),'{}'::uuid[])
  into v_property_ids
  from unnest(v_property_ids) p;
  if not v_role.organization_wide_allowed and cardinality(v_property_ids)=0 then
    raise exception using errcode='22023',message='PROPERTY_SCOPE_REQUIRED';
  end if;
  if exists (
    select 1
    from unnest(v_property_ids) requested(property_id)
    left join public.properties p
      on p.id=requested.property_id
     and p.organization_id=v_membership.organization_id
    where p.id is null
  ) then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then
    raise exception using errcode='42501',message='MFA_STEP_UP_REQUIRED';
  end if;
  if v_reason is null then
    raise exception using errcode='22023',message='AUDIT_REASON_REQUIRED';
  end if;
  select coalesce(array_agg(s.property_id order by s.property_id),'{}'::uuid[])
  into v_previous_property_ids
  from public.membership_property_scopes s
  where s.membership_id=p_membership_id;
  v_request_hash := encode(sha256(convert_to(concat_ws(
    '|',p_membership_id,array_to_string(v_property_ids,','),
    p_expected_version,v_reason
  ),'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',v_membership.organization_id,v_actor_id,'ReplaceStaffPropertyScopes',
    trim(p_idempotency_key)
  ),0));
  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=v_membership.organization_id
    and r.actor_scope='user:'||v_actor_id::text
    and r.route='ReplaceStaffPropertyScopes'
    and r.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;
  if v_membership.version<>p_expected_version then
    raise exception using errcode='40001',message='MEMBERSHIP_VERSION_CONFLICT';
  end if;
  if v_previous_property_ids=v_property_ids then
    return jsonb_build_object(
      'membershipId',p_membership_id,'organizationId',v_membership.organization_id,
      'propertyIds',to_jsonb(v_property_ids),'version',v_membership.version
    );
  end if;
  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,
    request_hash,expires_at
  ) values (
    v_membership.organization_id,v_actor_id,'user:'||v_actor_id::text,
    'ReplaceStaffPropertyScopes',trim(p_idempotency_key),v_request_hash,
    now()+interval '24 hours'
  );

  delete from public.membership_property_scopes s
  where s.membership_id=p_membership_id;
  insert into public.membership_property_scopes(
    organization_id,membership_id,property_id
  )
  select v_membership.organization_id,p_membership_id,p
  from unnest(v_property_ids) p;
  update public.organization_memberships m
  set updated_at=now(),version=version+1
  where m.id=p_membership_id;

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,
    resource_id,correlation_id,reason,before_data,after_data
  ) values (
    v_membership.organization_id,v_actor_id,'user','membership.scopes_changed',
    'organization_membership',p_membership_id,v_correlation_id,v_reason,
    jsonb_build_object('propertyIds',to_jsonb(v_previous_property_ids)),
    jsonb_build_object(
      'propertyIds',to_jsonb(v_property_ids),
      'version',v_membership.version+1
    )
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,
    correlation_id,payload
  ) values (
    v_membership.organization_id,'membership.scopes_changed',
    'organization_membership',p_membership_id,v_correlation_id,
    jsonb_build_object(
      'membershipId',p_membership_id,
      'propertyIds',to_jsonb(v_property_ids),
      'version',v_membership.version+1
    )
  );
  v_response := jsonb_build_object(
    'membershipId',p_membership_id,
    'organizationId',v_membership.organization_id,
    'propertyIds',to_jsonb(v_property_ids),
    'version',v_membership.version+1
  );
  update private.idempotency_records r
  set state='completed',response_status=200,response_body=v_response,
      resource_type='organization_membership',resource_id=p_membership_id,
      completed_at=now()
  where r.organization_id=v_membership.organization_id
    and r.actor_scope='user:'||v_actor_id::text
    and r.route='ReplaceStaffPropertyScopes'
    and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;

create or replace function public.revoke_staff_membership(
  p_membership_id uuid,
  p_expected_version integer,
  p_audit_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_membership public.organization_memberships%rowtype;
  v_organization_id uuid;
  v_checked_at timestamptz;
  v_reason text := nullif(trim(coalesce(p_audit_reason,'')),'');
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if length(trim(coalesce(p_idempotency_key,''))) not between 8 and 200 then
    raise exception using errcode='22023',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception using errcode='22023',message='INVALID_EXPECTED_VERSION';
  end if;
  if v_reason is null then
    raise exception using errcode='22023',message='AUDIT_REASON_REQUIRED';
  end if;
  if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then
    raise exception using errcode='42501',message='MFA_STEP_UP_REQUIRED';
  end if;

  v_organization_id := private.lock_staff_membership_write(p_membership_id);
  select * into v_membership
  from public.organization_memberships m
  where m.id=p_membership_id and m.organization_id=v_organization_id
  for update;
  if not found then
    raise exception using errcode='P0002',message='MEMBERSHIP_NOT_FOUND';
  end if;
  if v_membership.user_id=v_actor_id then
    raise exception using errcode='22023',message='CANNOT_REVOKE_SELF';
  end if;
  v_request_hash := encode(sha256(convert_to(concat_ws(
    '|',p_membership_id,p_expected_version,v_reason
  ),'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',v_membership.organization_id,v_actor_id,'RevokeStaffMembership',
    trim(p_idempotency_key)
  ),0));
  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=v_membership.organization_id
    and r.actor_scope='user:'||v_actor_id::text
    and r.route='RevokeStaffMembership'
    and r.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;
  if v_membership.status='revoked' then
    return jsonb_build_object(
      'membershipId',p_membership_id,
      'organizationId',v_membership.organization_id,
      'status','revoked','version',v_membership.version
    );
  end if;
  if v_membership.version<>p_expected_version then
    raise exception using errcode='40001',message='MEMBERSHIP_VERSION_CONFLICT';
  end if;
  v_checked_at := clock_timestamp();
  if v_membership.role_code='org_owner'
     and not exists (
       select 1 from public.organization_memberships m
       where m.organization_id=v_membership.organization_id
         and m.user_id=v_actor_id
         and m.role_code='org_owner'
         and m.status='active'
         and m.starts_at<=v_checked_at
         and (m.ends_at is null or m.ends_at>v_checked_at)
     ) then
    raise exception using errcode='23514',message='SOLE_OWNER_REQUIRED';
  end if;
  perform private.assert_staff_owner_continuity(v_membership,null);
  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,
    request_hash,expires_at
  ) values (
    v_membership.organization_id,v_actor_id,'user:'||v_actor_id::text,
    'RevokeStaffMembership',trim(p_idempotency_key),v_request_hash,
    now()+interval '24 hours'
  );

  update public.organization_memberships m
  set status='revoked',updated_at=now(),version=version+1
  where m.id=p_membership_id;
  update public.invitations i
  set status='revoked',revoked_at=now()
  where i.membership_id=p_membership_id and i.status='pending';

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,
    resource_id,correlation_id,reason,before_data,after_data
  ) values (
    v_membership.organization_id,v_actor_id,'user','membership.revoked',
    'organization_membership',p_membership_id,v_correlation_id,v_reason,
    jsonb_build_object(
      'roleCode',v_membership.role_code,'status',v_membership.status,
      'propertyIds',(
        select coalesce(jsonb_agg(s.property_id order by s.property_id),'[]'::jsonb)
        from public.membership_property_scopes s
        where s.membership_id=p_membership_id
      ),
      'version',v_membership.version
    ),
    jsonb_build_object('status','revoked','version',v_membership.version+1)
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,
    correlation_id,payload
  ) values (
    v_membership.organization_id,'membership.revoked',
    'organization_membership',p_membership_id,v_correlation_id,
    jsonb_build_object(
      'membershipId',p_membership_id,
      'revokedUserId',v_membership.user_id,
      'version',v_membership.version+1
    )
  );
  v_response := jsonb_build_object(
    'membershipId',p_membership_id,
    'organizationId',v_membership.organization_id,
    'status','revoked','version',v_membership.version+1
  );
  update private.idempotency_records r
  set state='completed',response_status=200,response_body=v_response,
      resource_type='organization_membership',resource_id=p_membership_id,
      completed_at=now()
  where r.organization_id=v_membership.organization_id
    and r.actor_scope='user:'||v_actor_id::text
    and r.route='RevokeStaffMembership'
    and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;

create or replace function public.accept_staff_invitation(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_invitation public.invitations%rowtype;
  v_organization_id uuid;
  v_recipient_id uuid;
  v_checked_at timestamptz;
  v_membership public.organization_memberships%rowtype;
  v_correlation_id uuid := gen_random_uuid();
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='INVALID_INVITATION_TOKEN';
  end if;
  select i.organization_id,m.user_id into v_organization_id,v_recipient_id
  from public.invitations i
  left join public.organization_memberships m
    on m.id=i.membership_id and m.organization_id=i.organization_id
  where i.token_hash=p_token_hash and i.invitation_type='organization_member';
  if not found then
    raise exception using errcode='P0002',message='INVITATION_NOT_FOUND';
  end if;
  if v_recipient_id is distinct from v_actor_id then
    raise exception using errcode='42501',message='INVITATION_RECIPIENT_MISMATCH';
  end if;
  perform private.lock_authority_write('staff',v_organization_id);

  select * into v_invitation
  from public.invitations i
  where i.token_hash=p_token_hash
    and i.organization_id=v_organization_id
    and i.invitation_type='organization_member'
  for update;
  if not found then
    raise exception using errcode='P0002',message='INVITATION_NOT_FOUND';
  end if;
  select * into v_membership
  from public.organization_memberships m
  where m.id=v_invitation.membership_id and m.organization_id=v_organization_id
  for update;
  if not found or v_membership.user_id<>v_actor_id then
    raise exception using errcode='42501',message='INVITATION_RECIPIENT_MISMATCH';
  end if;
  if v_invitation.status='accepted' and v_membership.status='active' then
    return jsonb_build_object(
      'membershipId',v_membership.id,
      'organizationId',v_membership.organization_id,
      'status','active','version',v_membership.version
    );
  end if;
  if v_invitation.status<>'pending' then
    raise exception using errcode='23514',message='INVITATION_NOT_PENDING';
  end if;
  v_checked_at := clock_timestamp();
  if v_invitation.expires_at<=v_checked_at then
    update public.invitations set status='expired'
    where id=v_invitation.id;
    raise exception using errcode='22023',message='INVITATION_EXPIRED';
  end if;
  if v_membership.status<>'invited' then
    raise exception using errcode='23514',message='MEMBERSHIP_NOT_INVITED';
  end if;
  if v_membership.starts_at>v_checked_at
     or (v_membership.ends_at is not null and v_membership.ends_at<=v_checked_at) then
    raise exception using errcode='23514',message='MEMBERSHIP_NOT_ACTIVE_YET';
  end if;

  update public.invitations
  set status='accepted',accepted_at=now()
  where id=v_invitation.id;
  update public.organization_memberships
  set status='active',updated_at=now(),version=version+1
  where id=v_membership.id;
  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,
    resource_id,correlation_id,after_data
  ) values (
    v_membership.organization_id,v_actor_id,'user','membership.activated',
    'organization_membership',v_membership.id,v_correlation_id,
    jsonb_build_object(
      'invitationId',v_invitation.id,
      'roleCode',v_membership.role_code,
      'version',v_membership.version+1
    )
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,
    correlation_id,payload
  ) values (
    v_membership.organization_id,'membership.activated',
    'organization_membership',v_membership.id,v_correlation_id,
    jsonb_build_object(
      'membershipId',v_membership.id,
      'invitationId',v_invitation.id,
      'roleCode',v_membership.role_code
    )
  );
  return jsonb_build_object(
    'membershipId',v_membership.id,
    'organizationId',v_membership.organization_id,
    'status','active','version',v_membership.version+1
  );
end;
$$;

create or replace function public.abandon_unsent_staff_invitation(
  p_organization_id uuid,
  p_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership_id uuid;
  v_correlation_id uuid := gen_random_uuid();
  v_job_status text;
  v_revoked_at timestamptz;
begin
  if p_organization_id is null or p_invitation_id is null then
    raise exception using errcode='23514',message='INVALID_INVITATION_REFERENCE';
  end if;

  if not exists (select 1 from public.organizations o where o.id=p_organization_id) then
    return jsonb_build_object('abandoned', false);
  end if;
  perform private.lock_authority_write('staff',p_organization_id);

  select i.membership_id into v_membership_id
  from public.invitations i
  join public.organization_memberships m on m.id=i.membership_id and m.organization_id=i.organization_id
  where m.status = 'invited'
    and i.id = p_invitation_id
    and i.organization_id = p_organization_id
    and i.invitation_type = 'organization_member'
    and i.status = 'pending';
  -- Not found is not an error: the caller is unwinding its own failure and may be retrying that
  -- unwind. An already-abandoned invitation is the state it was asking for.
  if v_membership_id is null then
    return jsonb_build_object('abandoned', false);
  end if;

  -- REFUSE to abandon an invitation whose email already left. Past that point the recipient may hold a
  -- working link, and revoking the membership under them would be a different and worse bug than the
  -- one this repairs.
  select j.status into v_job_status
  from private.notification_jobs j
  where j.organization_id = p_organization_id
    and j.idempotency_key = 'staff-invitation:' || p_invitation_id::text
  for update;
  if v_job_status in ('sent','processing') then
    raise exception using errcode='23514',message='INVITATION_ALREADY_DELIVERING';
  end if;

  update private.notification_jobs j
  set status = 'canceled', last_error = 'INVITATION_CREDENTIAL_NOT_ATTACHED'
  where j.organization_id = p_organization_id
    and j.idempotency_key = 'staff-invitation:' || p_invitation_id::text
    and j.status in ('queued','failed');

  v_revoked_at := clock_timestamp();
  update public.invitations i
  set status = 'revoked', revoked_at = v_revoked_at
  where i.id = p_invitation_id and i.organization_id = p_organization_id;

  update public.organization_memberships m
  set status = 'revoked',
      ends_at = case when m.starts_at < v_revoked_at then least(m.ends_at,v_revoked_at) else m.ends_at end,
      updated_at = v_revoked_at, version = m.version + 1
  where m.id = v_membership_id and m.organization_id = p_organization_id;

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,
    resource_id,correlation_id,reason,after_data
  ) values (
    p_organization_id,null,'system','membership.invitationAbandoned','organization_membership',
    v_membership_id,v_correlation_id,'Activation credential could not be attached; invitation withdrawn undelivered.',
    jsonb_build_object('invitationId',p_invitation_id,'reason','INVITATION_CREDENTIAL_NOT_ATTACHED')
  );

  return jsonb_build_object('abandoned', true);
end;
$$;

create or replace function public.create_ownership_interest(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_entity_id uuid,
  p_ownership_fraction numeric,
  p_effective_from date,
  p_effective_to date,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_scope text;
  v_previous private.idempotency_records%rowtype;
  v_request_hash text;
  v_property public.properties%rowtype;
  v_owner_active boolean;
  v_interest_id uuid := gen_random_uuid();
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='22023',message='IDEMPOTENCY_KEY_REQUIRED';
  end if;
  if p_ownership_fraction is null or p_ownership_fraction<=0 or p_ownership_fraction>1 then
    raise exception using errcode='22023',message='INVALID_OWNERSHIP_FRACTION';
  end if;
  if p_effective_from is null then
    raise exception using errcode='22007',message='INVALID_EFFECTIVE_FROM';
  end if;
  if p_effective_to is not null and p_effective_to<p_effective_from then
    raise exception using errcode='22007',message='INVALID_EFFECTIVE_RANGE';
  end if;
  if not private.has_property_access(p_property_id,'owner.manage') then
    raise exception using errcode='42501',message='OWNERSHIP_INTEREST_SCOPE_DENIED';
  end if;
  perform private.lock_authority_write('property_ownership',p_property_id);
  if not private.has_property_access(p_property_id,'owner.manage') then
    raise exception using errcode='42501',message='OWNERSHIP_INTEREST_SCOPE_DENIED';
  end if;
  if not private.has_plan_entitlement(p_organization_id,'portal.owner.standard',false) then
    raise exception using errcode='42501',message='OWNER_PLAN_UNAVAILABLE';
  end if;

  select * into v_property
  from public.properties p
  where p.id=p_property_id and p.organization_id=p_organization_id;
  if not found then
    raise exception using errcode='P0002',message='PROPERTY_NOT_FOUND';
  end if;

  -- The owner must belong to this organization and be active. Captured as an explicit boolean because
  -- FOUND is reset by the inserts that follow the idempotency short-circuit.
  select (oe.status='active') into v_owner_active
  from public.owner_entities oe
  where oe.id=p_owner_entity_id and oe.organization_id=p_organization_id;
  if v_owner_active is null then
    raise exception using errcode='P0002',message='OWNER_ENTITY_NOT_FOUND';
  end if;
  if not v_owner_active then
    raise exception using errcode='23514',message='OWNER_ENTITY_INACTIVE';
  end if;

  v_actor_scope := 'user:'||v_actor_id::text;
  v_request_hash := encode(sha256(convert_to(concat_ws(
    '|',p_organization_id,p_property_id,p_owner_entity_id,p_ownership_fraction,
    p_effective_from,coalesce(p_effective_to::text,'')
  ),'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',p_organization_id,v_actor_scope,'CreateOwnershipInterest',trim(p_idempotency_key)
  ),0));
  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=p_organization_id
    and r.actor_user_id=v_actor_id
    and r.route='CreateOwnershipInterest'
    and r.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  -- Check new writes under the property lock, after the replay short-circuit.
  if exists (
    select 1 from public.ownership_interests oi
    where oi.organization_id=p_organization_id
      and oi.property_id=p_property_id
      and oi.owner_entity_id=p_owner_entity_id
      and oi.effective_from <= coalesce(p_effective_to,'infinity'::date)
      and coalesce(oi.effective_to,'infinity'::date) >= p_effective_from
  ) then
    raise exception using errcode='23514',message='OWNERSHIP_INTEREST_OVERLAP';
  end if;

  -- Totals increase only at interval starts. Check every relevant start with the
  -- persisted precision. A partial allocation is still allowed during setup.
  if exists (
    with relevant as (
      select oi.effective_from,oi.effective_to,oi.ownership_fraction
      from public.ownership_interests oi
      where oi.organization_id=p_organization_id
        and oi.property_id=p_property_id
        and oi.effective_from<=coalesce(p_effective_to,'infinity'::date)
        and coalesce(oi.effective_to,'infinity'::date)>=p_effective_from
    ), boundaries as (
      select p_effective_from as boundary
      union
      select r.effective_from from relevant r where r.effective_from>p_effective_from
    )
    select 1
    from boundaries b
    left join relevant r on r.effective_from<=b.boundary
      and (r.effective_to is null or r.effective_to>=b.boundary)
    group by b.boundary
    having coalesce(sum(r.ownership_fraction),0)+p_ownership_fraction::numeric(9,8)>1
  ) then
    raise exception using errcode='23514',message='OWNERSHIP_ALLOCATION_EXCEEDED';
  end if;

  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,request_hash,expires_at
  ) values (
    p_organization_id,v_actor_id,v_actor_scope,'CreateOwnershipInterest',
    trim(p_idempotency_key),v_request_hash,now()+interval '24 hours'
  );

  insert into public.ownership_interests(
    id,organization_id,property_id,owner_entity_id,ownership_fraction,effective_from,effective_to
  ) values (
    v_interest_id,p_organization_id,p_property_id,p_owner_entity_id,p_ownership_fraction,
    p_effective_from,p_effective_to
  );

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,
    correlation_id,reason,after_data
  ) values (
    p_organization_id,v_actor_id,'user','owner.interestCreated','ownership_interest',v_interest_id,
    v_correlation_id,null,jsonb_build_object(
      'propertyId',p_property_id,'ownerEntityId',p_owner_entity_id,
      'ownershipFraction',p_ownership_fraction,'effectiveFrom',p_effective_from,'effectiveTo',p_effective_to
    )
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (
    p_organization_id,'owner.interestCreated','ownership_interest',v_interest_id,v_correlation_id,
    jsonb_build_object(
      'ownershipInterestId',v_interest_id,'propertyId',p_property_id,'ownerEntityId',p_owner_entity_id,
      'ownershipFraction',p_ownership_fraction,'effectiveFrom',p_effective_from,'effectiveTo',p_effective_to
    )
  );

  v_response := jsonb_build_object(
    'ownershipInterestId',v_interest_id,'propertyId',p_property_id,'ownerEntityId',p_owner_entity_id,
    'ownershipFraction',p_ownership_fraction,'effectiveFrom',p_effective_from,'effectiveTo',p_effective_to
  );
  update private.idempotency_records r
  set state='completed',response_status=201,response_body=v_response,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='CreateOwnershipInterest' and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;

commit;
