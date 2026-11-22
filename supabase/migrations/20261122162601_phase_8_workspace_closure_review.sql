begin;

-- Workspace closure review is an append-only workflow. It records owner actions
-- and readiness evidence without changing operational access or retention.
create table private.organization_closure_actions (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  case_id uuid not null,
  case_version integer not null check (case_version > 0),
  actor_user_id uuid not null,
  idempotency_key uuid not null,
  expected_case_id uuid,
  expected_case_version integer not null check (expected_case_version >= 0),
  status text not null check (status in ('requested','reviewed','canceled')),
  readiness jsonb,
  recorded_at timestamptz not null default statement_timestamp(),
  unique (organization_id,case_id,case_version),
  unique (organization_id,actor_user_id,idempotency_key),
  check ((status='reviewed')=(readiness is not null))
);
create index organization_closure_actions_latest_idx on private.organization_closure_actions (organization_id,id desc);
alter table private.organization_closure_actions enable row level security;
revoke all on private.organization_closure_actions from public,anon,authenticated,service_role;

create function private.require_workspace_closure_owner(p_organization_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if private.active_organization_id() is not null
     and private.active_organization_id() is distinct from p_organization_id then
    raise exception using errcode='42501',message='ORGANIZATION_SCOPE_DENIED';
  end if;
  perform private.enter_organization_context(p_organization_id);
  if not exists (
    select 1 from public.organization_memberships m
    join public.role_definitions r on r.code=m.role_code and r.organization_wide_allowed
    where m.organization_id=p_organization_id and m.user_id=(select auth.uid())
      and m.role_code='org_owner' and m.status='active' and m.starts_at<=now()
      and (m.ends_at is null or m.ends_at>now())
      and not exists (select 1 from public.membership_property_scopes s where s.membership_id=m.id)
  ) then
    raise exception using errcode='42501',message='WORKSPACE_OWNER_REQUIRED';
  end if;
  if coalesce((select auth.jwt()->>'aal'),'aal1')<>'aal2' then
    raise exception using errcode='42501',message='MFA_REQUIRED';
  end if;
end;
$$;
revoke all on function private.require_workspace_closure_owner(uuid) from public,anon,authenticated,service_role;

create function public.get_workspace_closure_review(p_organization_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_current private.organization_closure_actions%rowtype;
  v_review private.organization_closure_actions%rowtype;
begin
  perform private.require_workspace_closure_owner(p_organization_id);
  select a.* into v_current from private.organization_closure_actions a
    where a.organization_id=p_organization_id order by a.id desc limit 1;

  select a.* into v_review from private.organization_closure_actions a
    where a.organization_id=p_organization_id and a.case_id=v_current.case_id and a.status='reviewed'
      and a.case_version<=v_current.case_version
    order by a.case_version desc limit 1;

  return jsonb_build_object(
    'organizationId',p_organization_id,
    'case',case when v_current.id is not null then jsonb_build_object(
      'caseId',v_current.case_id,'caseVersion',v_current.case_version,'status',v_current.status,
      'recordedAt',v_current.recorded_at,
      'reviewedReadiness',case when v_review.id is not null then jsonb_build_object(
        'caseVersion',v_review.case_version,'readiness',v_review.readiness
      ) end
    ) end
  );
end;
$$;
revoke all on function public.get_workspace_closure_review(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_workspace_closure_review(uuid) to authenticated;

create function public.record_workspace_closure_action(
  p_organization_id uuid,p_expected_case_id uuid,p_expected_case_version integer,
  p_action text,p_idempotency_key uuid
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_current private.organization_closure_actions%rowtype;
  v_saved private.organization_closure_actions%rowtype;
  v_case_id uuid;
  v_version integer;
  v_status text;
  v_readiness jsonb;
  v_correlation_id uuid := gen_random_uuid();
  v_before jsonb;
  v_after jsonb;
begin
  perform private.require_workspace_closure_owner(p_organization_id);
  v_status := case p_action when 'request' then 'requested' when 'review' then 'reviewed' when 'cancel' then 'canceled' end;
  if v_status is null or p_idempotency_key is null
     or p_expected_case_version is null or p_expected_case_version<0
     or (p_expected_case_id is null)<>(p_expected_case_version=0) then
    raise exception using errcode='22023',message='INVALID_CLOSURE_ACTION';
  end if;

  -- Serialize transitions for this workspace only, including the first request.
  perform pg_advisory_xact_lock(hashtextextended('workspace_closure:' || p_organization_id::text,0));
  select a.* into v_saved from private.organization_closure_actions a
    where a.organization_id=p_organization_id and a.actor_user_id=v_actor_id and a.idempotency_key=p_idempotency_key;
  if found then
    if v_saved.status<>v_status or v_saved.expected_case_id is distinct from p_expected_case_id
       or v_saved.expected_case_version<>p_expected_case_version then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('caseId',v_saved.case_id,'caseVersion',v_saved.case_version,'status',v_saved.status);
  end if;

  select a.* into v_current from private.organization_closure_actions a
    where a.organization_id=p_organization_id order by a.id desc limit 1;
  if p_expected_case_id is distinct from v_current.case_id
     or p_expected_case_version<>coalesce(v_current.case_version,0) then
    raise exception using errcode='40001',message='CLOSURE_VERSION_CONFLICT';
  end if;
  if p_action='request' then
    if v_current.status in ('requested','reviewed') or exists (
      select 1 from public.organizations o where o.id=p_organization_id and o.status in ('closing','closed')
    ) then
      raise exception using errcode='23514',message='CLOSURE_REVIEW_ALREADY_ACTIVE_OR_UNAVAILABLE';
    end if;
    v_case_id := gen_random_uuid();
    v_version := 1;
  else
    if v_current.status is null or v_current.status='canceled' then
      raise exception using errcode='23514',message='CLOSURE_REVIEW_NOT_ACTIVE';
    end if;
    v_case_id := v_current.case_id;
    v_version := v_current.case_version+1;
    if p_action='review' then
      v_readiness := public.get_organization_closure_readiness(p_organization_id);
    end if;
  end if;

  insert into private.organization_closure_actions (
    organization_id,case_id,case_version,actor_user_id,idempotency_key,expected_case_id,expected_case_version,status,readiness
  ) values (
    p_organization_id,v_case_id,v_version,v_actor_id,p_idempotency_key,p_expected_case_id,p_expected_case_version,v_status,v_readiness
  );
  if v_current.id is not null then
    v_before := jsonb_build_object('caseId',v_current.case_id,'caseVersion',v_current.case_version,'status',v_current.status);
  end if;
  v_after := jsonb_build_object('caseId',v_case_id,'caseVersion',v_version,'status',v_status);
  insert into audit.audit_events (
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,before_data,after_data
  ) values (
    p_organization_id,v_actor_id,'user','organization_closure.action_recorded','organization_closure',
    v_case_id,v_correlation_id,v_before,v_after
  );
  insert into private.outbox_events (organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (p_organization_id,'organization_closure.action_recorded','organization_closure',v_case_id,v_correlation_id,v_after);
  return v_after;
end;
$$;
revoke all on function public.record_workspace_closure_action(uuid,uuid,integer,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.record_workspace_closure_action(uuid,uuid,integer,text,uuid) to authenticated;

commit;
