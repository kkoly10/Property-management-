-- Phase 8: staff invitations, memberships, property scopes, and seat controls.
begin;

insert into public.plan_entitlements(plan_code,feature_code,limit_value,enabled)
values
  ('free','core.staff',1,true),
  ('starter','core.staff',2,true),
  ('growth','core.staff',5,true),
  ('pro','core.staff',null,true)
on conflict (plan_code,feature_code) do update
set limit_value=excluded.limit_value,enabled=excluded.enabled;

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invitation_type text not null check (
    invitation_type in (
      'organization_member','resident_relationship','owner_relationship','vendor_relationship'
    )
  ),
  email citext not null,
  membership_id uuid references public.organization_memberships(id) on delete restrict,
  relationship_type text,
  relationship_id uuid,
  token_hash text not null,
  token_prefix text not null,
  locale text not null,
  redirect_surface text not null,
  status text not null default 'pending' check (
    status in ('pending','accepted','expired','revoked','superseded')
  ),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  invited_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(token_hash),
  foreign key (organization_id,membership_id)
    references public.organization_memberships(organization_id,id) on delete restrict,
  check (length(token_hash)=64),
  check (length(token_prefix) between 6 and 16),
  check (expires_at>created_at),
  check (
    (status='accepted' and accepted_at is not null and revoked_at is null)
    or (status in ('revoked','superseded') and revoked_at is not null and accepted_at is null)
    or (status in ('pending','expired') and accepted_at is null)
  )
);
create index invitations_lookup_idx
  on public.invitations(organization_id,email,status,expires_at);
create index invitations_membership_idx
  on public.invitations(membership_id,created_at desc)
  where membership_id is not null;
create unique index invitations_pending_staff_unique
  on public.invitations(organization_id,email)
  where invitation_type='organization_member' and status='pending';

alter table public.invitations enable row level security;
create policy invitations_admin_or_recipient_read
on public.invitations
for select
to authenticated
using (
  (select private.has_org_permission(organization_id,'organization.manage'))
  or exists (
    select 1
    from public.organization_memberships m
    where m.id=membership_id
      and m.organization_id=organization_id
      and m.user_id=(select auth.uid())
  )
);

revoke all on table public.invitations from public,anon,authenticated,service_role;

create or replace function public.resolve_auth_user_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  where lower(u.email)=lower(trim(p_email))
  order by u.created_at
  limit 1
$$;
revoke all on function public.resolve_auth_user_by_email(text)
  from public,anon,authenticated,service_role;
grant execute on function public.resolve_auth_user_by_email(text) to service_role;

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
  if not private.has_org_permission(p_organization_id,'organization.manage') then
    raise exception using errcode='42501',message='ORGANIZATION_SCOPE_DENIED';
  end if;
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
  if p_role_code='org_owner'
     and not exists (
       select 1 from public.organization_memberships m
       where m.organization_id=p_organization_id
         and m.user_id=v_actor_id
         and m.role_code='org_owner'
         and m.status='active'
         and m.starts_at<=now()
         and (m.ends_at is null or m.ends_at>now())
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
  v_role public.role_definitions%rowtype;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
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

  select * into v_membership
  from public.organization_memberships m
  where m.id=p_membership_id
  for update;
  if not found then
    raise exception using errcode='P0002',message='MEMBERSHIP_NOT_FOUND';
  end if;
  if not private.has_org_permission(v_membership.organization_id,'organization.manage') then
    raise exception using errcode='42501',message='ORGANIZATION_SCOPE_DENIED';
  end if;
  if v_membership.user_id=v_actor_id then
    raise exception using errcode='22023',message='CANNOT_CHANGE_SELF';
  end if;
  if v_membership.status='revoked' then
    raise exception using errcode='23514',message='MEMBERSHIP_REVOKED';
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
  if (v_membership.role_code='org_owner' or p_role_code='org_owner')
     and not exists (
       select 1 from public.organization_memberships m
       where m.organization_id=v_membership.organization_id
         and m.user_id=v_actor_id
         and m.role_code='org_owner'
         and m.status='active'
         and m.starts_at<=now()
         and (m.ends_at is null or m.ends_at>now())
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
  select * into v_membership
  from public.organization_memberships m
  where m.id=p_membership_id
  for update;
  if not found then
    raise exception using errcode='P0002',message='MEMBERSHIP_NOT_FOUND';
  end if;
  if not private.has_org_permission(v_membership.organization_id,'organization.manage') then
    raise exception using errcode='42501',message='ORGANIZATION_SCOPE_DENIED';
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

  select * into v_membership
  from public.organization_memberships m
  where m.id=p_membership_id
  for update;
  if not found then
    raise exception using errcode='P0002',message='MEMBERSHIP_NOT_FOUND';
  end if;
  if not private.has_org_permission(v_membership.organization_id,'organization.manage') then
    raise exception using errcode='42501',message='ORGANIZATION_SCOPE_DENIED';
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
  if v_membership.role_code='org_owner'
     and (
       not exists (
         select 1 from public.organization_memberships m
         where m.organization_id=v_membership.organization_id
           and m.user_id=v_actor_id
           and m.role_code='org_owner'
           and m.status='active'
           and m.starts_at<=now()
           and (m.ends_at is null or m.ends_at>now())
       )
       or (
         select count(*)
         from public.organization_memberships m
         where m.organization_id=v_membership.organization_id
           and m.role_code='org_owner'
           and m.status='active'
           and m.starts_at<=now()
           and (m.ends_at is null or m.ends_at>now())
       )<=1
     ) then
    raise exception using errcode='23514',message='SOLE_OWNER_REQUIRED';
  end if;
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
  v_membership public.organization_memberships%rowtype;
  v_correlation_id uuid := gen_random_uuid();
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='INVALID_INVITATION_TOKEN';
  end if;
  select * into v_invitation
  from public.invitations i
  where i.token_hash=p_token_hash
    and i.invitation_type='organization_member'
  for update;
  if not found then
    raise exception using errcode='P0002',message='INVITATION_NOT_FOUND';
  end if;
  select * into v_membership
  from public.organization_memberships m
  where m.id=v_invitation.membership_id
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
  if v_invitation.expires_at<=now() then
    update public.invitations set status='expired'
    where id=v_invitation.id;
    raise exception using errcode='22023',message='INVITATION_EXPIRED';
  end if;
  if v_membership.status<>'invited' then
    raise exception using errcode='23514',message='MEMBERSHIP_NOT_INVITED';
  end if;
  if v_membership.starts_at>now()
     or (v_membership.ends_at is not null and v_membership.ends_at<=now()) then
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

create or replace function public.get_staff_management_workspace(
  p_organization_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_organization_id uuid;
  v_plan_code text;
  v_staff_limit integer;
  v_staff_count integer;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  select o.id into v_organization_id
  from public.organizations o
  where (p_organization_id is null or o.id=p_organization_id)
    and private.has_org_permission(o.id,'organization.manage')
  order by o.created_at,o.id
  limit 1;
  if v_organization_id is null then
    return jsonb_build_object(
      'authenticatorLevel',coalesce(auth.jwt()->>'aal','aal1'),
      'organization',null,
      'members','[]'::jsonb,
      'invitations','[]'::jsonb,
      'roles','[]'::jsonb,
      'properties','[]'::jsonb,
      'staffSeatCount',0,
      'staffSeatLimit',null
    );
  end if;
  select s.plan_code into v_plan_code
  from public.organization_subscriptions s
  where s.organization_id=v_organization_id
    and s.status in ('trialing','active','past_due','restricted')
  order by s.created_at desc
  limit 1;
  select e.limit_value::integer into v_staff_limit
  from public.plan_entitlements e
  where e.plan_code=v_plan_code
    and e.feature_code='core.staff'
    and e.enabled;
  select count(*)::integer into v_staff_count
  from public.organization_memberships m
  where m.organization_id=v_organization_id
    and m.status in ('invited','active','suspended')
    and (m.ends_at is null or m.ends_at>now());

  return jsonb_build_object(
    'authenticatorLevel',coalesce(auth.jwt()->>'aal','aal1'),
    'organization',(
      select jsonb_build_object(
        'organizationId',o.id,
        'organizationName',o.display_name,
        'planCode',v_plan_code
      )
      from public.organizations o
      where o.id=v_organization_id
    ),
    'staffSeatCount',v_staff_count,
    'staffSeatLimit',v_staff_limit,
    'members',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'membershipId',m.id,
        'userId',m.user_id,
        'displayName',coalesce(p.display_name,u.email,'Invited staff member'),
        'email',u.email,
        'roleCode',m.role_code,
        'roleName',r.display_name,
        'status',m.status,
        'mfaRequired',m.mfa_required,
        'startsAt',m.starts_at,
        'endsAt',m.ends_at,
        'propertyIds',(
          select coalesce(jsonb_agg(s.property_id order by s.property_id),'[]'::jsonb)
          from public.membership_property_scopes s
          where s.membership_id=m.id
        ),
        'isCurrentUser',m.user_id=v_actor_id,
        'version',m.version
      ) order by
        case m.status when 'active' then 0 when 'invited' then 1
          when 'suspended' then 2 else 3 end,
        lower(coalesce(p.display_name,u.email,'')),m.created_at),'[]'::jsonb)
      from public.organization_memberships m
      join public.role_definitions r on r.code=m.role_code
      join auth.users u on u.id=m.user_id
      left join public.profiles p on p.user_id=m.user_id
      where m.organization_id=v_organization_id
    ),
    'invitations',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'invitationId',i.id,
        'membershipId',i.membership_id,
        'email',i.email,
        'status',case
          when i.status='pending' and i.expires_at<=now() then 'expired'
          else i.status
        end,
        'expiresAt',i.expires_at,
        'createdAt',i.created_at
      ) order by i.created_at desc),'[]'::jsonb)
      from public.invitations i
      where i.organization_id=v_organization_id
        and i.invitation_type='organization_member'
    ),
    'roles',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'code',r.code,
        'displayName',r.display_name,
        'organizationWideAllowed',r.organization_wide_allowed,
        'sensitive',r.code in ('org_owner','org_admin','accountant')
      ) order by r.display_name),'[]'::jsonb)
      from public.role_definitions r
    ),
    'properties',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'propertyId',p.id,'propertyName',p.name
      ) order by lower(p.name),p.id),'[]'::jsonb)
      from public.properties p
      where p.organization_id=v_organization_id
        and p.archived_at is null
        and p.status<>'archived'
    )
  );
end;
$$;

create or replace function public.get_staff_invitation_delivery_status(
  p_invitation_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select j.status
  from private.notification_jobs j
  where j.idempotency_key='staff-invitation:'||p_invitation_id::text
  limit 1
$$;

create or replace function public.mark_staff_invitation_email_sent(
  p_invitation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.notification_jobs j
  set status='sent',attempts=attempts+1
  where j.idempotency_key='staff-invitation:'||p_invitation_id::text
    and j.status in ('queued','failed');
  return found;
end;
$$;

revoke all on function public.invite_staff_member(
  uuid,uuid,text,text,uuid[],timestamptz,timestamptz,boolean,text,text,text,text,text
) from public,anon,authenticated,service_role;
revoke all on function public.update_staff_membership(
  uuid,text,text,timestamptz,timestamptz,boolean,integer,text,text
) from public,anon,authenticated,service_role;
revoke all on function public.replace_staff_property_scopes(
  uuid,uuid[],integer,text,text
) from public,anon,authenticated,service_role;
revoke all on function public.revoke_staff_membership(
  uuid,integer,text,text
) from public,anon,authenticated,service_role;
revoke all on function public.accept_staff_invitation(text)
  from public,anon,authenticated,service_role;
revoke all on function public.get_staff_management_workspace(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.get_staff_invitation_delivery_status(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.mark_staff_invitation_email_sent(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.invite_staff_member(
  uuid,uuid,text,text,uuid[],timestamptz,timestamptz,boolean,text,text,text,text,text
) to authenticated;
grant execute on function public.update_staff_membership(
  uuid,text,text,timestamptz,timestamptz,boolean,integer,text,text
) to authenticated;
grant execute on function public.replace_staff_property_scopes(
  uuid,uuid[],integer,text,text
) to authenticated;
grant execute on function public.revoke_staff_membership(
  uuid,integer,text,text
) to authenticated;
grant execute on function public.accept_staff_invitation(text) to authenticated;
grant execute on function public.get_staff_management_workspace(uuid) to authenticated;
grant execute on function public.get_staff_invitation_delivery_status(uuid) to service_role;
grant execute on function public.mark_staff_invitation_email_sent(uuid) to service_role;

commit;
