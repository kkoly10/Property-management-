-- Phase 8: platform control-plane hardening (correction A/B/C).
-- Forward-only; redefines functions and adds one partial unique index. No tenant RLS is touched and
-- has_active_support_session remains ORed into zero tenant policies.
--
-- A. Last-admin cardinality is now race-free: provisioning a platform_admin, activating a suspended
--    platform_admin, and suspending an active platform_admin all take a single transaction-scoped
--    advisory lock, then re-read authoritative state under it, guaranteeing >=1 active admin remains.
-- B. One active, unexpired support session per platform actor GLOBALLY. start_support_session takes a
--    per-actor advisory lock, materializes lapsed 'active' sessions to 'expired', short-circuits true
--    idempotent replays, then raises SUPPORT_SESSION_ALREADY_ACTIVE (with safe metadata in DETAIL) if
--    another active session remains — so authorize_support_query never chooses ambiguously. A partial
--    unique index enforces the invariant at the storage layer as defense-in-depth.
-- C. support_get_organization_overview selects exactly ONE current subscription deterministically.
begin;

-- ── B: storage-layer guarantee — at most one active session per actor ────────────────────────────
create unique index if not exists support_sessions_active_per_actor_unique
  on private.support_sessions(user_id) where status = 'active';

-- ── A: advisory-locked provisioning ──────────────────────────────────────────────────────────────
create or replace function public.provision_platform_actor(
  p_user_id uuid, p_platform_role text, p_display_name text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_hash text;
  v_prev private.idempotency_records%rowtype;
  v_corr uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor is null then raise exception using errcode='28000', message='AUTHENTICATION_REQUIRED'; end if;
  if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then raise exception using errcode='42501', message='MFA_STEP_UP_REQUIRED'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then raise exception using errcode='23514', message='INVALID_IDEMPOTENCY_KEY'; end if;
  if p_platform_role not in ('support_agent','platform_admin') then raise exception using errcode='23514', message='INVALID_PLATFORM_ROLE'; end if;
  if p_user_id is null then raise exception using errcode='23514', message='PLATFORM_USER_REQUIRED'; end if;
  if not private.is_platform_admin() then raise exception using errcode='42501', message='NOT_PLATFORM_ADMIN'; end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then raise exception using errcode='P0002', message='PLATFORM_USER_NOT_FOUND'; end if;

  -- Serialize with every other admin-cardinality change so counts read consistently.
  if p_platform_role = 'platform_admin' then
    perform pg_advisory_xact_lock(hashtext('crecy.platform_admin_cardinality'), 0);
  end if;

  v_hash := encode(sha256(convert_to(jsonb_build_object('userId',p_user_id,'platformRole',p_platform_role,'displayName',p_display_name)::text,'UTF8')),'hex');
  select * into v_prev from private.idempotency_records r
  where r.organization_id is null and r.actor_user_id = v_actor and r.route = 'ProvisionPlatformActor' and r.idempotency_key = p_idempotency_key;
  if found then
    if v_prev.request_hash <> v_hash then raise exception using errcode='23505', message='IDEMPOTENCY_CONFLICT'; end if;
    if v_prev.state = 'completed' then return v_prev.response_body; end if;
    raise exception using errcode='40001', message='COMMAND_IN_PROGRESS';
  end if;

  if exists (select 1 from private.platform_actors a where a.user_id = p_user_id) then
    raise exception using errcode='23505', message='PLATFORM_ACTOR_EXISTS';
  end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (null,v_actor,'ProvisionPlatformActor',p_idempotency_key,v_hash,now()+interval '24 hours');

  insert into private.platform_actors(id,user_id,platform_role,status,display_name,created_by)
  values (v_id,p_user_id,p_platform_role,'active',nullif(trim(coalesce(p_display_name,'')),''),v_actor);

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (null,v_actor,'support','platform.actor_provisioned','platform_actor',v_id,v_corr,
    jsonb_build_object('platformActorId',v_id,'platformRole',p_platform_role,'targetUserId',p_user_id));

  v_response := jsonb_build_object('platformActorId',v_id,'platformRole',p_platform_role,'status','active');
  update private.idempotency_records r set state='completed',response_status=201,response_body=v_response,resource_type='platform_actor',resource_id=v_id,completed_at=now()
  where r.organization_id is null and r.actor_user_id = v_actor and r.route='ProvisionPlatformActor' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.provision_platform_actor(uuid,text,text,text) from public,anon;
grant execute on function public.provision_platform_actor(uuid,text,text,text) to authenticated;

-- ── A: advisory-locked status change (activate/suspend) with race-free last-admin invariant ───────
create or replace function public.set_platform_actor_status(
  p_platform_actor_id uuid, p_status text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_target private.platform_actors%rowtype;
  v_prev_status text;
  v_hash text;
  v_prev private.idempotency_records%rowtype;
  v_corr uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor is null then raise exception using errcode='28000', message='AUTHENTICATION_REQUIRED'; end if;
  if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then raise exception using errcode='42501', message='MFA_STEP_UP_REQUIRED'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then raise exception using errcode='23514', message='INVALID_IDEMPOTENCY_KEY'; end if;
  if p_status not in ('active','suspended') then raise exception using errcode='23514', message='INVALID_PLATFORM_ACTOR_STATUS'; end if;
  if not private.is_platform_admin() then raise exception using errcode='42501', message='NOT_PLATFORM_ADMIN'; end if;

  -- Serialize EVERY admin-cardinality change (provision/activate/suspend) before reading the count,
  -- so two concurrent suspends of different admins cannot both observe two active admins.
  perform pg_advisory_xact_lock(hashtext('crecy.platform_admin_cardinality'), 0);

  select * into v_target from private.platform_actors a where a.id = p_platform_actor_id for update;
  if not found then raise exception using errcode='P0002', message='PLATFORM_ACTOR_NOT_FOUND'; end if;
  v_prev_status := v_target.status;

  v_hash := encode(sha256(convert_to(jsonb_build_object('platformActorId',p_platform_actor_id,'status',p_status)::text,'UTF8')),'hex');
  select * into v_prev from private.idempotency_records r
  where r.organization_id is null and r.actor_user_id = v_actor and r.route = 'SetPlatformActorStatus' and r.idempotency_key = p_idempotency_key;
  if found then
    if v_prev.request_hash <> v_hash then raise exception using errcode='23505', message='IDEMPOTENCY_CONFLICT'; end if;
    if v_prev.state = 'completed' then return v_prev.response_body; end if;
    raise exception using errcode='40001', message='COMMAND_IN_PROGRESS';
  end if;

  -- Authoritative re-read under the lock: at least one active admin must remain after commit.
  if p_status = 'suspended' and v_target.platform_role = 'platform_admin'
     and (select count(*) from private.platform_actors a where a.status='active' and a.platform_role='platform_admin') <= 1 then
    raise exception using errcode='23514', message='CANNOT_SUSPEND_LAST_ADMIN';
  end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (null,v_actor,'SetPlatformActorStatus',p_idempotency_key,v_hash,now()+interval '24 hours');

  update private.platform_actors set status = p_status where id = p_platform_actor_id;

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,before_data,after_data)
  values (null,v_actor,'support','platform.actor_status_changed','platform_actor',p_platform_actor_id,v_corr,
    jsonb_build_object('status',v_prev_status),jsonb_build_object('status',p_status));

  v_response := jsonb_build_object('platformActorId',p_platform_actor_id,'status',p_status);
  update private.idempotency_records r set state='completed',response_status=200,response_body=v_response,resource_type='platform_actor',resource_id=p_platform_actor_id,completed_at=now()
  where r.organization_id is null and r.actor_user_id = v_actor and r.route='SetPlatformActorStatus' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.set_platform_actor_status(uuid,text,text) from public,anon;
grant execute on function public.set_platform_actor_status(uuid,text,text) to authenticated;

-- ── B: one active support session per actor, globally ────────────────────────────────────────────
create or replace function public.start_support_session(
  p_organization_id uuid, p_reason text, p_ttl_minutes integer, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid := auth.uid();
  v_platform_actor private.platform_actors%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
  v_session_id uuid := gen_random_uuid();
  v_expires_at timestamptz;
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_existing private.support_sessions%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception using errcode='42501',message='MFA_STEP_UP_REQUIRED'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY'; end if;
  if v_reason is null then raise exception using errcode='22023',message='AUDIT_REASON_REQUIRED'; end if;
  if length(v_reason) not between 8 and 500 then raise exception using errcode='23514',message='INVALID_SUPPORT_REASON'; end if;
  if p_ttl_minutes is null or p_ttl_minutes not between 5 and 240 then raise exception using errcode='23514',message='INVALID_SUPPORT_TTL'; end if;

  select * into v_platform_actor from private.platform_actors pa where pa.user_id=v_actor_id and pa.status='active';
  if not found then raise exception using errcode='42501',message='NOT_PLATFORM_ACTOR'; end if;
  if not exists (select 1 from public.organizations o where o.id=p_organization_id and o.status<>'closed') then
    raise exception using errcode='P0002',message='ORGANIZATION_NOT_FOUND';
  end if;

  -- Serialize support-session creation for THIS actor.
  perform pg_advisory_xact_lock(hashtext('crecy.support_session'), hashtext(v_actor_id::text));

  -- Materialize lapsed 'active' sessions to 'expired' so authorization + the invariant see truth.
  update private.support_sessions
    set status='expired', ended_at=now(), ended_reason='Expired automatically at TTL.'
    where user_id=v_actor_id and status='active' and expires_at<=now();

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

  -- One active, unexpired session per actor globally. Safe metadata in DETAIL directs the UI back.
  select * into v_existing from private.support_sessions
  where user_id=v_actor_id and status='active' and expires_at>now()
  order by started_at desc limit 1;
  if found then
    raise exception using errcode='23505', message='SUPPORT_SESSION_ALREADY_ACTIVE',
      detail=jsonb_build_object('organizationId',v_existing.organization_id,'supportSessionId',v_existing.id,'expiresAt',v_existing.expires_at)::text;
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

-- ── C: deterministic current-subscription selector in the sanitized overview ─────────────────────
create or replace function public.support_get_organization_overview(p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess private.support_sessions%rowtype; v_dto jsonb;
begin
  v_sess := private.authorize_support_query(p_organization_id);
  select jsonb_build_object(
    'organizationId', o.id, 'displayName', o.display_name, 'slug', o.slug, 'status', o.status, 'createdAt', o.created_at,
    'subscriptionPlanCode', sub.plan_code, 'subscriptionStatus', sub.status,
    'propertyCount', (select count(*) from public.properties p where p.organization_id = o.id),
    'unitCount', (select count(*) from public.units u where u.organization_id = o.id),
    'activeTenancyCount', (select count(*) from public.tenancies t where t.organization_id = o.id and t.status = 'active'),
    'openWorkOrderCount', (select count(*) from public.work_orders w where w.organization_id = o.id and w.status not in ('completed','closed','canceled')),
    'activeMemberCount', (select count(*) from public.organization_memberships m where m.organization_id = o.id and m.status = 'active')
  ) into v_dto
  from public.organizations o
  left join lateral (
    select s.plan_code, s.status
    from public.organization_subscriptions s
    where s.organization_id = o.id
    order by (s.status in ('trialing','active','past_due','restricted')) desc, s.created_at desc, s.id desc
    limit 1
  ) sub on true
  where o.id = p_organization_id;
  if v_dto is null then raise exception using errcode='P0002', message='ORGANIZATION_NOT_FOUND'; end if;

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (p_organization_id,(select auth.uid()),'support','support.viewed_overview','organization',p_organization_id,v_sess.correlation_id,
    jsonb_build_object('supportSessionId',v_sess.id,'queryType','organization_overview'));
  return v_dto;
end;
$$;
revoke all on function public.support_get_organization_overview(uuid) from public,anon;
grant execute on function public.support_get_organization_overview(uuid) to authenticated;

commit;
