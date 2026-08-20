-- Phase 8: platform control plane — sanitized support-query surface + actor provisioning.
--
-- Spec: doc 01 §3.5 (platform control plane), doc 09 §24 (support-access controls), doc 10 journey 14
-- ("Support/admin can investigate the journey without direct database manipulation").
--
-- ARCHITECTURE (deliberate): support investigation is served EXCLUSIVELY by dedicated
-- `security definer` support-query RPCs that return allowlisted DTOs. Tenant base-table RLS is
-- UNCHANGED and `private.has_active_support_session` is still ORed into NO tenant policy — giving a
-- support actor ordinary SELECT on tenant rows would be an over-broad exposure surface. Instead each
-- support RPC:
--   * requires an active `private.platform_actors` row (`private.is_active_platform_actor`);
--   * requires an active, unexpired support session for the EXACT target org
--     (`private.authorize_support_query`, gate is `expires_at > now()` so expiry is authoritative at
--      query time even if no sweep ran, and `platform_actors.status='active'` so a suspend revokes
--      access immediately);
--   * derives the support actor from auth.uid() and never accepts a "target user identity" input;
--   * exposes only allowlisted fields (no secrets, provider ids, storage paths, full resident contact
--     info, message bodies, payment-instrument details, or raw audit before/after payloads);
--   * is bounded by a hard limit;
--   * records each investigation in audit.audit_events with the support session id + correlation id;
--   * never mutates tenant business data (only appends audit), and no domain WRITE command honors a
--     support session (they gate on membership/resident/owner helpers, never on support sessions).
--
-- Actor provisioning: the bootstrap platform admin is seeded out of band (a single INSERT into
-- private.platform_actors documented in the progress note); thereafter only an existing active
-- platform_admin at AAL2 can provision or suspend actors, and the last active admin cannot be
-- suspended (no lockout).
--
-- Adds only FUNCTIONS (no tables, no policies) -> authority table/policy counts unchanged.
begin;

-- ── platform-actor identity helpers ─────────────────────────────────────────────────────────────
create or replace function private.is_active_platform_actor()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.platform_actors a
    where a.user_id = (select auth.uid()) and a.status = 'active'
  );
$$;
revoke all on function private.is_active_platform_actor() from public;
grant execute on function private.is_active_platform_actor() to authenticated;

create or replace function private.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.platform_actors a
    where a.user_id = (select auth.uid()) and a.status = 'active' and a.platform_role = 'platform_admin'
  );
$$;
revoke all on function private.is_platform_admin() from public;
grant execute on function private.is_platform_admin() to authenticated;

create or replace function private.mask_email(p_email text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_email is null or position('@' in p_email) = 0 then '***'
    else left(p_email, 1) || '***@' || left(split_part(p_email, '@', 2), 1) || '***'
  end;
$$;

-- The single, reviewable support-read gate. Raises unless the caller is an active platform actor
-- holding an active, unexpired session for this exact org; returns the session (for audit stamping).
create or replace function private.authorize_support_query(p_organization_id uuid)
returns private.support_sessions language plpgsql stable security definer set search_path = '' as $$
declare v_sess private.support_sessions%rowtype;
begin
  if (select auth.uid()) is null then raise exception using errcode='28000', message='AUTHENTICATION_REQUIRED'; end if;
  if not private.is_active_platform_actor() then raise exception using errcode='42501', message='NOT_PLATFORM_ACTOR'; end if;
  select s.* into v_sess
  from private.support_sessions s
  join private.platform_actors a on a.id = s.platform_actor_id
  where s.organization_id = p_organization_id
    and s.user_id = (select auth.uid())
    and s.status = 'active'
    and s.expires_at > now()
    and a.status = 'active'
  order by s.started_at desc
  limit 1;
  if not found then raise exception using errcode='42501', message='SUPPORT_SESSION_REQUIRED'; end if;
  return v_sess;
end;
$$;
revoke all on function private.authorize_support_query(uuid) from public;
grant execute on function private.authorize_support_query(uuid) to authenticated;

-- ── platform-actor provisioning lifecycle (platform_admin + AAL2) ────────────────────────────────
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

  v_hash := encode(sha256(convert_to(jsonb_build_object('userId',p_user_id,'platformRole',p_platform_role,'displayName',p_display_name)::text,'UTF8')),'hex');
  select * into v_prev from private.idempotency_records r
  where r.organization_id is null and r.actor_user_id = v_actor and r.route = 'ProvisionPlatformActor' and r.idempotency_key = p_idempotency_key;
  if found then
    if v_prev.request_hash <> v_hash then raise exception using errcode='23505', message='IDEMPOTENCY_CONFLICT'; end if;
    if v_prev.state = 'completed' then return v_prev.response_body; end if;
    raise exception using errcode='40001', message='COMMAND_IN_PROGRESS';
  end if;

  -- After the idempotency short-circuit so a replay returns the stored response.
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

  -- No-lockout guard, after the idempotency short-circuit: never suspend the last active admin.
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

-- ── sanitized support-query surface ──────────────────────────────────────────────────────────────
-- Organization lookup (active platform actor; NO session needed — this is the pre-session search to
-- find a target). Returns org identity only; not audited (it is a search, not an investigation).
create or replace function public.support_lookup_organizations(p_query text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit,25),1),100);
  v_q text := nullif(trim(coalesce(p_query,'')),'');
  v_rows jsonb;
begin
  if (select auth.uid()) is null then raise exception using errcode='28000', message='AUTHENTICATION_REQUIRED'; end if;
  if not private.is_active_platform_actor() then raise exception using errcode='42501', message='NOT_PLATFORM_ACTOR'; end if;
  select coalesce(jsonb_agg(row_json order by created_at desc),'[]'::jsonb) into v_rows from (
    select o.created_at, jsonb_build_object(
      'organizationId',o.id,'displayName',o.display_name,'slug',o.slug,'status',o.status,'createdAt',o.created_at
    ) as row_json
    from public.organizations o
    where v_q is null or o.display_name ilike '%'||v_q||'%' or o.slug ilike '%'||v_q||'%'
    order by o.created_at desc
    limit v_limit
  ) s;
  return jsonb_build_object('organizations', v_rows);
end;
$$;
revoke all on function public.support_lookup_organizations(text,integer) from public,anon;
grant execute on function public.support_lookup_organizations(text,integer) to authenticated;

-- Sanitized org overview (session-gated; audited). Operational counts + subscription state only —
-- no money, no PII, no secrets.
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
  left join public.organization_subscriptions sub on sub.organization_id = o.id
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

-- Sanitized member list (session-gated; audited). Role/status/window + MASKED email only.
create or replace function public.support_list_organization_members(p_organization_id uuid, p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess private.support_sessions%rowtype; v_limit integer := least(greatest(coalesce(p_limit,50),1),200); v_rows jsonb; v_count integer;
begin
  v_sess := private.authorize_support_query(p_organization_id);
  select coalesce(jsonb_agg(row_json order by created_at desc),'[]'::jsonb), count(*) into v_rows, v_count from (
    select m.created_at, jsonb_build_object(
      'membershipId',m.id,'roleCode',m.role_code,'status',m.status,'startsAt',m.starts_at,'endsAt',m.ends_at,
      'maskedEmail',private.mask_email(u.email)
    ) as row_json
    from public.organization_memberships m
    left join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id
    order by m.created_at desc
    limit v_limit
  ) s;
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (p_organization_id,(select auth.uid()),'support','support.viewed_members','organization',p_organization_id,v_sess.correlation_id,
    jsonb_build_object('supportSessionId',v_sess.id,'queryType','organization_members','resultCount',v_count));
  return jsonb_build_object('members', v_rows);
end;
$$;
revoke all on function public.support_list_organization_members(uuid,integer) from public,anon;
grant execute on function public.support_list_organization_members(uuid,integer) to authenticated;

-- Sanitized recent activity (session-gated; audited). Action codes + resource type/id + timestamp
-- only — NO before/after payloads, reason, or ip_hash.
create or replace function public.support_list_recent_activity(p_organization_id uuid, p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess private.support_sessions%rowtype; v_limit integer := least(greatest(coalesce(p_limit,50),1),200); v_rows jsonb; v_count integer;
begin
  v_sess := private.authorize_support_query(p_organization_id);
  select coalesce(jsonb_agg(row_json order by occurred_at desc),'[]'::jsonb), count(*) into v_rows, v_count from (
    select e.occurred_at, jsonb_build_object(
      'actionCode',e.action_code,'resourceType',e.resource_type,'resourceId',e.resource_id,'actorType',e.actor_type,'occurredAt',e.occurred_at
    ) as row_json
    from audit.audit_events e
    where e.organization_id = p_organization_id
    order by e.occurred_at desc
    limit v_limit
  ) s;
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (p_organization_id,(select auth.uid()),'support','support.viewed_activity','organization',p_organization_id,v_sess.correlation_id,
    jsonb_build_object('supportSessionId',v_sess.id,'queryType','recent_activity','resultCount',v_count));
  return jsonb_build_object('activity', v_rows);
end;
$$;
revoke all on function public.support_list_recent_activity(uuid,integer) from public,anon;
grant execute on function public.support_list_recent_activity(uuid,integer) to authenticated;

-- Support-session history for oversight: a platform_admin sees all sessions; a support_agent sees
-- only their own. Session metadata only (the reason is support's own, not customer data).
create or replace function public.support_list_sessions(p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_limit integer := least(greatest(coalesce(p_limit,50),1),200); v_is_admin boolean; v_rows jsonb;
begin
  if v_actor is null then raise exception using errcode='28000', message='AUTHENTICATION_REQUIRED'; end if;
  if not private.is_active_platform_actor() then raise exception using errcode='42501', message='NOT_PLATFORM_ACTOR'; end if;
  v_is_admin := private.is_platform_admin();
  select coalesce(jsonb_agg(row_json order by started_at desc),'[]'::jsonb) into v_rows from (
    select s.started_at, jsonb_build_object(
      'supportSessionId',s.id,'organizationId',s.organization_id,'organizationName',o.display_name,
      'platformActorId',s.platform_actor_id,'reason',s.reason,'status',s.status,
      'startedAt',s.started_at,'expiresAt',s.expires_at,'endedAt',s.ended_at
    ) as row_json
    from private.support_sessions s
    left join public.organizations o on o.id = s.organization_id
    where v_is_admin or s.user_id = v_actor
    order by s.started_at desc
    limit v_limit
  ) t;
  return jsonb_build_object('sessions', v_rows);
end;
$$;
revoke all on function public.support_list_sessions(integer) from public,anon;
grant execute on function public.support_list_sessions(integer) to authenticated;

commit;
