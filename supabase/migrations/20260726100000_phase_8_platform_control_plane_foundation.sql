-- Phase 8: platform control-plane FOUNDATION — audited, time-boxed cross-org support grants.
--
-- Spec: doc 01 §3.5 (platform control plane, "audited impersonation", "must not bypass domain
-- commands"), doc 09 §24 (support-access controls: time-limited elevation, mandatory reason, full
-- audit, step-up auth), doc 05 Phase 8 exit "support actions are audited and constrained".
--
-- SCOPE OF THIS SLICE (deliberately the safe half): the grant record and its lifecycle only. It
-- introduces private.has_active_support_session() but does NOT wire it into any RLS/tenant policy —
-- an active support session grants ZERO cross-org data access until a later slice deliberately ORs
-- the helper into a policy (with sensitive-field masking, read-only enforcement, and a visible
-- impersonation banner, per doc 09). The decisive test for this slice is the NEGATIVE one: an active
-- session must yield no rows, so the bypass can never be introduced silently.
--
-- Both tables live in schema `private` (definer-only, never exposed to the browser like
-- idempotency_records/outbox_events), so no RLS policy is added (policy count unchanged); the two
-- tables move the authority table count 74 -> 76 (mirrored into doc 12).
begin;

-- Registry of PLATFORM staff (distinct from public.organization_memberships, which binds a user
-- INTO one org). A platform actor helps a customer org WITHOUT a membership row in it.
create table if not exists private.platform_actors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  platform_role text not null check (platform_role in ('support_agent','platform_admin')),
  status text not null default 'active' check (status in ('active','suspended')),
  display_name text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  unique (user_id)
);

-- A time-boxed, audited support grant: platform actor -> target customer org, with a mandatory
-- reason. access_scope is read-only for the pilot (the column exists for forward compatibility; only
-- 'read_only' is accepted and, this slice, nothing is even wired to honor it).
create table if not exists private.support_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  platform_actor_id uuid not null references private.platform_actors(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (length(trim(reason)) between 8 and 500),
  access_scope text not null default 'read_only' check (access_scope in ('read_only')),
  status text not null default 'active' check (status in ('active','ended','revoked','expired')),
  correlation_id uuid not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  ended_reason text,
  created_by uuid not null references auth.users(id) on delete restrict,
  check (expires_at > started_at),
  check ((status = 'active' and ended_at is null)
      or (status in ('ended','revoked','expired') and ended_at is not null))
);
create index if not exists support_sessions_actor_active_idx
  on private.support_sessions (user_id, organization_id, status, expires_at);
create index if not exists support_sessions_org_idx
  on private.support_sessions (organization_id, started_at desc);

-- The gate a LATER slice will OR into tenant policies. Defined and unit-tested now, but wired
-- nowhere — an active session is inert until then. Kept separate from has_org_permission so the
-- bypass surface is a single, reviewable function.
create or replace function private.has_active_support_session(target_organization uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.support_sessions s
    join private.platform_actors a on a.id = s.platform_actor_id
    where s.organization_id = target_organization
      and s.user_id = (select auth.uid())
      and s.status = 'active'
      and s.expires_at > now()
      and a.status = 'active'
  );
$$;
revoke all on function private.has_active_support_session(uuid) from public;
grant execute on function private.has_active_support_session(uuid) to authenticated;

-- Open a time-boxed support session against a customer org. Mirrors invite_staff_member: step-up
-- (AAL2) required, mandatory reason, idempotent, one audit + outbox row with actor_type='support'.
create or replace function public.start_support_session(
  p_organization_id uuid,
  p_reason text,
  p_ttl_minutes integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_platform_actor private.platform_actors%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
  v_session_id uuid := gen_random_uuid();
  v_expires_at timestamptz;
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then
    raise exception using errcode='42501',message='MFA_STEP_UP_REQUIRED';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if v_reason is null then raise exception using errcode='22023',message='AUDIT_REASON_REQUIRED'; end if;
  if length(v_reason) not between 8 and 500 then raise exception using errcode='23514',message='INVALID_SUPPORT_REASON'; end if;
  if p_ttl_minutes is null or p_ttl_minutes not between 5 and 240 then
    raise exception using errcode='23514',message='INVALID_SUPPORT_TTL';
  end if;

  select * into v_platform_actor from private.platform_actors pa
  where pa.user_id=v_actor_id and pa.status='active';
  if not found then raise exception using errcode='42501',message='NOT_PLATFORM_ACTOR'; end if;
  if not exists (select 1 from public.organizations o where o.id=p_organization_id and o.status<>'closed') then
    raise exception using errcode='P0002',message='ORGANIZATION_NOT_FOUND';
  end if;

  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'organizationId',p_organization_id,'reason',v_reason,'ttlMinutes',p_ttl_minutes
  )::text,'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='StartSupportSession' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (p_organization_id,v_actor_id,'StartSupportSession',p_idempotency_key,v_request_hash,now()+interval '24 hours');

  v_expires_at := now() + make_interval(mins => p_ttl_minutes);
  insert into private.support_sessions(
    id,organization_id,platform_actor_id,user_id,reason,access_scope,status,correlation_id,expires_at,created_by
  ) values (
    v_session_id,p_organization_id,v_platform_actor.id,v_actor_id,v_reason,'read_only','active',v_correlation_id,v_expires_at,v_actor_id
  );

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,reason,after_data)
  values (p_organization_id,v_actor_id,'support','support.session_started','support_session',v_session_id,v_correlation_id,v_reason,
    jsonb_build_object('supportSessionId',v_session_id,'accessScope','read_only','expiresAt',v_expires_at,'platformRole',v_platform_actor.platform_role));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (p_organization_id,'support.session_started','support_session',v_session_id,v_correlation_id,
    jsonb_build_object('supportSessionId',v_session_id,'organizationId',p_organization_id,'accessScope','read_only','expiresAt',v_expires_at));

  v_response := jsonb_build_object(
    'supportSessionId',v_session_id,'organizationId',p_organization_id,'status','active',
    'accessScope','read_only','startedAt',now(),'expiresAt',v_expires_at
  );
  update private.idempotency_records r set state='completed',response_status=201,response_body=v_response,
    resource_type='support_session',resource_id=v_session_id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='StartSupportSession' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.start_support_session(uuid,text,integer,text) from public,anon;
grant execute on function public.start_support_session(uuid,text,integer,text) to authenticated;

-- Close a support session (normal end or early revoke). The session's own actor can end it; a
-- platform_admin can end anyone's (oversight). Idempotent; audited.
create or replace function public.end_support_session(
  p_organization_id uuid,
  p_support_session_id uuid,
  p_disposition text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_platform_actor private.platform_actors%rowtype;
  v_session private.support_sessions%rowtype;
  v_previous_status text;
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_disposition not in ('ended','revoked') then raise exception using errcode='23514',message='INVALID_SUPPORT_DISPOSITION'; end if;

  select * into v_platform_actor from private.platform_actors pa where pa.user_id=v_actor_id and pa.status='active';
  if not found then raise exception using errcode='42501',message='NOT_PLATFORM_ACTOR'; end if;

  select * into v_session from private.support_sessions s
  where s.id=p_support_session_id and s.organization_id=p_organization_id for update;
  if not found then raise exception using errcode='P0002',message='SUPPORT_SESSION_NOT_FOUND'; end if;
  v_previous_status := v_session.status;
  if v_session.user_id<>v_actor_id and v_platform_actor.platform_role<>'platform_admin' then
    raise exception using errcode='42501',message='SUPPORT_SESSION_FORBIDDEN';
  end if;

  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'organizationId',p_organization_id,'supportSessionId',p_support_session_id,'disposition',p_disposition
  )::text,'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='EndSupportSession' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  -- Runs after the idempotency short-circuit so a replay returns the stored response rather than
  -- tripping on the session this same call already closed.
  if v_previous_status<>'active' then raise exception using errcode='23514',message='SUPPORT_SESSION_NOT_ACTIVE'; end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (p_organization_id,v_actor_id,'EndSupportSession',p_idempotency_key,v_request_hash,now()+interval '24 hours');

  update private.support_sessions set status=p_disposition,ended_at=now(),
    ended_reason=case when p_disposition='revoked' then 'Revoked by '||v_platform_actor.platform_role else 'Ended by session owner' end
  where id=p_support_session_id and organization_id=p_organization_id;

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,before_data,after_data)
  values (p_organization_id,v_actor_id,'support','support.session_'||p_disposition,'support_session',p_support_session_id,v_correlation_id,
    jsonb_build_object('status',v_previous_status),jsonb_build_object('status',p_disposition));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (p_organization_id,'support.session_'||p_disposition,'support_session',p_support_session_id,v_correlation_id,
    jsonb_build_object('supportSessionId',p_support_session_id,'organizationId',p_organization_id,'disposition',p_disposition));

  v_response := jsonb_build_object('supportSessionId',p_support_session_id,'organizationId',p_organization_id,'status',p_disposition);
  update private.idempotency_records r set state='completed',response_status=200,response_body=v_response,
    resource_type='support_session',resource_id=p_support_session_id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='EndSupportSession' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.end_support_session(uuid,uuid,text,text) from public,anon;
grant execute on function public.end_support_session(uuid,uuid,text,text) to authenticated;

commit;
