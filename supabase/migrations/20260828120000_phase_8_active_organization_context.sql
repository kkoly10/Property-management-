-- Phase 8 (v4.2 Batch A3): canonical active-organization context.
--
-- The defect. Crecy's tenant is the organization, and an operator may belong to several. But the
-- operator surfaces never carried an organization: most workspace RPCs took no organization argument
-- at all and simply returned every row the caller could see ACROSS ALL of their organizations, and the
-- two that did accept one defaulted it to null and then resolved
--
--     order by o.created_at, o.id limit 1
--
-- — the implicit-first-organization pattern that AGENTS.md and file 27 §5.A3 both forbid. For an
-- operator in two organizations that is not a cosmetic issue: the dashboard, maintenance queue, payment
-- summary and global search would each show MIXED ROWS from both tenants at once.
--
-- The fix, in this file:
--   1. list_operator_organizations() — the canonical source for the switcher. Active memberships only.
--   2. private.has_active_organization_membership(org) — the single gate every scoped surface uses.
--   3. An organization-scoped variant of every operator workspace RPC.
--   4. The two organization-defaulting RPCs now REFUSE a null organization instead of guessing.
--   5. Execute is revoked from `authenticated` on the unscoped operator workspace functions, so a
--      fetcher CANNOT go unscoped even by mistake. test:db asserts that revocation holds.
--
-- Portal RPCs (get_resident_*, get_owner_*, get_recipient_*, notification preferences) are deliberately
-- untouched: they are scoped by the caller's own relationship, not by an operator's chosen context.
--
-- Authority: adds no table and no RLS policy, so the authority counts are unchanged.
begin;

-- ── The gate ─────────────────────────────────────────────────────────────────────────────────────
-- True iff the caller holds an ACTIVE membership in this organization, right now. Revocation or an
-- expired end date takes effect on the next call — there is no cached grant anywhere.
create or replace function private.has_active_organization_membership(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.starts_at <= now()
      and (m.ends_at is null or m.ends_at > now())
  )
$$;

-- ── list_operator_organizations: the canonical switcher source ───────────────────────────────────
-- Every organization the caller may act in, and nothing else. An operator with exactly one gets it
-- selected automatically by the caller; an operator with several must choose. An operator with none
-- belongs in onboarding, not in a silently-empty workspace.
create or replace function public.list_operator_organizations()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'organizationId', o.id,
        'displayName', o.display_name,
        'slug', o.slug,
        'roleCode', m.role_code,
        'defaultLocale', o.default_locale,
        'defaultTimeZone', o.default_time_zone,
        'headquartersCountryCode', o.headquarters_country_code
      ) order by o.display_name, o.id)
      from public.organization_memberships m
      join public.organizations o on o.id = m.organization_id
      where m.user_id = (select auth.uid())
        and m.status = 'active'
        and m.starts_at <= now()
        and (m.ends_at is null or m.ends_at > now())
    ), '[]'::jsonb)
  )
$$;
revoke all on function public.list_operator_organizations() from public,anon;
grant execute on function public.list_operator_organizations() to authenticated;

-- ── The active-organization context ──────────────────────────────────────────────────────────────
-- A transaction-local setting, established ONLY by the scoped wrappers below after they have verified
-- the caller's active membership. Two properties make this safe:
--
--   * It can only ever NARROW. Every helper reads it as `(setting is null or column = setting)`, so a
--     context that is unset behaves exactly as before, and a context that is set can only remove rows.
--     Nothing can be reached by setting it that could not be reached without it.
--   * It is `set_config(..., is_local => true)`, so it dies with the transaction. PostgREST runs each
--     RPC in its own transaction, so a context can never leak into another request.
create or replace function private.active_organization_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('crecy.active_organization_id', true), '')::uuid
$$;

-- Establish the context. This is the single place membership is proven before an operator surface runs.
create or replace function private.enter_organization_context(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  -- No implicit choice. A surface that does not know which organization it is showing is a bug, not a
  -- prompt to guess one.
  if p_organization_id is null then
    raise exception using errcode='22023',message='ORGANIZATION_REQUIRED';
  end if;
  -- Revalidated on EVERY use, so a revoked or expired membership stops working on the next request
  -- rather than at the end of some cached window.
  if not private.has_active_organization_membership(p_organization_id) then
    raise exception using errcode='42501',message='ORGANIZATION_SCOPE_DENIED';
  end if;
  perform set_config('crecy.active_organization_id', p_organization_id::text, true);
end;
$$;

-- ── The three authorization helpers, narrowed by the active context ──────────────────────────────
-- Only the final `and (...)` clause is new in each; everything else is the shipped predicate verbatim.
create or replace function private.has_property_access(target_property uuid,target_permission text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties p
    join public.organization_memberships m on m.organization_id=p.organization_id
    join public.role_permissions rp on rp.role_code=m.role_code
    join public.role_definitions rd on rd.code=m.role_code
    where p.id=target_property
      and m.user_id=(select auth.uid())
      and m.status='active'
      and m.starts_at<=now()
      and (m.ends_at is null or m.ends_at>now())
      and (rp.permission_code='*' or rp.permission_code=target_permission)
      and (
        exists(select 1 from public.membership_property_scopes s where s.membership_id=m.id and s.property_id=p.id)
        or (rd.organization_wide_allowed and not exists(select 1 from public.membership_property_scopes s2 where s2.membership_id=m.id))
      )
      and (private.active_organization_id() is null or p.organization_id=private.active_organization_id())
  );
$$;

create or replace function private.has_org_permission(target_organization uuid,target_permission text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.role_permissions rp on rp.role_code=m.role_code
    where m.organization_id=target_organization
      and m.user_id=(select auth.uid())
      and m.status='active'
      and m.starts_at<=now()
      and (m.ends_at is null or m.ends_at>now())
      and (rp.permission_code='*' or rp.permission_code=target_permission)
      and (private.active_organization_id() is null or target_organization=private.active_organization_id())
  );
$$;

create or replace function private.has_unscoped_org_permission(target_organization uuid,target_permission text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.role_permissions rp on rp.role_code=m.role_code
    join public.role_definitions rd on rd.code=m.role_code
    where m.organization_id=target_organization
      and m.user_id=(select auth.uid())
      and m.status='active'
      and m.starts_at<=now()
      and (m.ends_at is null or m.ends_at>now())
      and rd.organization_wide_allowed
      and not exists(select 1 from public.membership_property_scopes s where s.membership_id=m.id)
      and (rp.permission_code='*' or rp.permission_code=target_permission)
      and (private.active_organization_id() is null or target_organization=private.active_organization_id())
  );
$$;

-- ── Organization-scoped operator surfaces ───────────────────────────────────────────────────────
-- Each wrapper proves the caller's active membership, establishes the narrowing context, and then runs
-- the SHIPPED, already-proven body unchanged. Scoping therefore applies to every query inside that body
-- -- including its summary aggregates -- with no chance of a filter being missed on one of them, which
-- is exactly the failure mode a hand-rewritten copy of each body would invite.
--
-- The wrappers are `security definer`, so they may call the unscoped inner functions even where those
-- have had EXECUTE revoked from `authenticated` below.

create or replace function public.get_operator_announcement_workspace(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return public.get_operator_announcement_workspace();
end;
$$;
revoke all on function public.get_operator_announcement_workspace(uuid) from public,anon;
grant execute on function public.get_operator_announcement_workspace(uuid) to authenticated;

create or replace function public.get_operator_maintenance_workspace(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return public.get_operator_maintenance_workspace();
end;
$$;
revoke all on function public.get_operator_maintenance_workspace(uuid) from public,anon;
grant execute on function public.get_operator_maintenance_workspace(uuid) to authenticated;

create or replace function public.get_operator_vendor_directory(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return public.get_operator_vendor_directory();
end;
$$;
revoke all on function public.get_operator_vendor_directory(uuid) from public,anon;
grant execute on function public.get_operator_vendor_directory(uuid) to authenticated;

create or replace function public.get_operator_owner_statement_workspace(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return public.get_operator_owner_statement_workspace();
end;
$$;
revoke all on function public.get_operator_owner_statement_workspace(uuid) from public,anon;
grant execute on function public.get_operator_owner_statement_workspace(uuid) to authenticated;

create or replace function public.get_operator_owner_approval_workspace(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return public.get_operator_owner_approval_workspace();
end;
$$;
revoke all on function public.get_operator_owner_approval_workspace(uuid) from public,anon;
grant execute on function public.get_operator_owner_approval_workspace(uuid) to authenticated;

create or replace function public.get_operator_payment_summary(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return public.get_operator_payment_summary();
end;
$$;
revoke all on function public.get_operator_payment_summary(uuid) from public,anon;
grant execute on function public.get_operator_payment_summary(uuid) to authenticated;

create or replace function public.get_operator_receivables_summary(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return public.get_operator_receivables_summary();
end;
$$;
revoke all on function public.get_operator_receivables_summary(uuid) from public,anon;
grant execute on function public.get_operator_receivables_summary(uuid) to authenticated;

create or replace function public.get_settlement_reconciliation_workspace(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return public.get_settlement_reconciliation_workspace();
end;
$$;
revoke all on function public.get_settlement_reconciliation_workspace(uuid) from public,anon;
grant execute on function public.get_settlement_reconciliation_workspace(uuid) to authenticated;

create or replace function public.get_manual_payment_options(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return public.get_manual_payment_options();
end;
$$;
revoke all on function public.get_manual_payment_options(uuid) from public,anon;
grant execute on function public.get_manual_payment_options(uuid) to authenticated;

create or replace function public.get_payment_connection_settings(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return public.get_payment_connection_settings();
end;
$$;
revoke all on function public.get_payment_connection_settings(uuid) from public,anon;
grant execute on function public.get_payment_connection_settings(uuid) to authenticated;

create or replace function public.get_conversation_workspace(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return public.get_conversation_workspace();
end;
$$;
revoke all on function public.get_conversation_workspace(uuid) from public,anon;
grant execute on function public.get_conversation_workspace(uuid) to authenticated;

create or replace function public.get_privacy_request_workspace(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return public.get_privacy_request_workspace();
end;
$$;
revoke all on function public.get_privacy_request_workspace(uuid) from public,anon;
grant execute on function public.get_privacy_request_workspace(uuid) to authenticated;

create or replace function public.get_conversation_detail(
  p_organization_id uuid,
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return public.get_conversation_detail(p_conversation_id);
end;
$$;
revoke all on function public.get_conversation_detail(uuid,uuid) from public,anon;
grant execute on function public.get_conversation_detail(uuid,uuid) to authenticated;

create or replace function public.get_import_job_detail(
  p_organization_id uuid,
  p_import_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return public.get_import_job_detail(p_import_job_id);
end;
$$;
revoke all on function public.get_import_job_detail(uuid,uuid) from public,anon;
grant execute on function public.get_import_job_detail(uuid,uuid) to authenticated;

create or replace function public.get_payment_detail(
  p_organization_id uuid,
  p_payment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return public.get_payment_detail(p_payment_id);
end;
$$;
revoke all on function public.get_payment_detail(uuid,uuid) from public,anon;
grant execute on function public.get_payment_detail(uuid,uuid) to authenticated;

create or replace function public.get_payment_attempt_history(
  p_organization_id uuid,
  p_payment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return public.get_payment_attempt_history(p_payment_id);
end;
$$;
revoke all on function public.get_payment_attempt_history(uuid,uuid) from public,anon;
grant execute on function public.get_payment_attempt_history(uuid,uuid) to authenticated;

create or replace function public.get_payment_dispute_history(
  p_organization_id uuid,
  p_payment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return public.get_payment_dispute_history(p_payment_id);
end;
$$;
revoke all on function public.get_payment_dispute_history(uuid,uuid) from public,anon;
grant execute on function public.get_payment_dispute_history(uuid,uuid) to authenticated;

create or replace function public.get_payment_refund_eligibility(
  p_organization_id uuid,
  p_payment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return public.get_payment_refund_eligibility(p_payment_id);
end;
$$;
revoke all on function public.get_payment_refund_eligibility(uuid,uuid) from public,anon;
grant execute on function public.get_payment_refund_eligibility(uuid,uuid) to authenticated;

create or replace function public.get_payment_settlement_history(
  p_organization_id uuid,
  p_payment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return public.get_payment_settlement_history(p_payment_id);
end;
$$;
revoke all on function public.get_payment_settlement_history(uuid,uuid) from public,anon;
grant execute on function public.get_payment_settlement_history(uuid,uuid) to authenticated;

create or replace function public.get_owner_statement_detail(
  p_organization_id uuid,
  p_statement_snapshot_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return public.get_owner_statement_detail(p_statement_snapshot_id);
end;
$$;
revoke all on function public.get_owner_statement_detail(uuid,uuid) from public,anon;
grant execute on function public.get_owner_statement_detail(uuid,uuid) to authenticated;

-- ── Close the unscoped operator surfaces ──────────────────────────────────────────────────────
-- A fetcher must not be ABLE to go unscoped. Revoking EXECUTE from `authenticated` on the unscoped form
-- turns "someone forgot to pass the organization" from a silent cross-tenant read into a permission
-- error. test:db asserts this revocation holds.
--
-- The line is drawn at what can actually MIX TENANTS. These are the collection surfaces: they take no
-- resource and return every row the caller can see, so without an organization they union across every
-- organization the operator belongs to. That is the defect.
--
-- Deliberately NOT revoked:
--   * resource-id surfaces (get_payment_detail, get_import_job_detail, get_conversation_detail, ...).
--     They return ONE resource that belongs to exactly one organization, so they cannot mix tenants;
--     RLS already decides whether the caller may see it. Residents and owners legitimately call several
--     of them for their own records and have no operator organization to supply. Their scoped overloads
--     exist for operator callers, which additionally pins the context.
--   * get_conversation_workspace and get_privacy_request_workspace, which serve the resident and owner
--     portals as well as operators.

revoke execute on function public.get_operator_announcement_workspace() from authenticated;
revoke execute on function public.get_operator_maintenance_workspace() from authenticated;
revoke execute on function public.get_operator_vendor_directory() from authenticated;
revoke execute on function public.get_operator_owner_statement_workspace() from authenticated;
revoke execute on function public.get_operator_owner_approval_workspace() from authenticated;
revoke execute on function public.get_operator_payment_summary() from authenticated;
revoke execute on function public.get_operator_receivables_summary() from authenticated;
revoke execute on function public.get_settlement_reconciliation_workspace() from authenticated;
revoke execute on function public.get_manual_payment_options() from authenticated;
revoke execute on function public.get_payment_connection_settings() from authenticated;

-- ── Global search: the one surface that could not be steered at all ────────────────────────
-- get_operator_global_search had NO organization parameter and resolved one internally with
-- `order by m.created_at,m.id limit 1`, so no wrapper could redirect it. Its body is reproduced here
-- with exactly two changes: the organization is now the first parameter, and that implicit pick is
-- replaced by a validated lookup of the supplied organization. Everything else is byte-identical to
-- the shipped definition.
create or replace function public.get_operator_global_search(
  p_organization_id uuid,
  p_query text,
  p_limit integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_organization_id uuid;
  v_query text := lower(trim(coalesce(p_query,'')));
  v_prefix text;
  v_limit integer := coalesce(p_limit,24);
  v_result jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if length(v_query)<2 then
    raise exception using errcode='22023',message='SEARCH_QUERY_TOO_SHORT';
  end if;
  if length(v_query)>80 then
    raise exception using errcode='22023',message='SEARCH_QUERY_TOO_LONG';
  end if;
  if v_limit<1 or v_limit>50 then
    raise exception using errcode='22023',message='SEARCH_LIMIT_OUT_OF_BOUNDS';
  end if;

  -- Was: `order by m.created_at,m.id limit 1` — the caller got whichever organization they joined
  -- first, with no way to steer it, so an operator in two tenants could only ever search one of them.
  -- The organization is now supplied and proven, and the context narrows every helper below it too.
  perform private.enter_organization_context(p_organization_id);

  select m.organization_id
    into v_organization_id
  from public.organization_memberships m
  join public.organizations o on o.id=m.organization_id
  where m.user_id=v_actor_id
    and m.organization_id=p_organization_id
    and m.status='active'
    and m.starts_at<=now()
    and (m.ends_at is null or m.ends_at>now())
    and o.status in ('trial','active');

  if v_organization_id is null then
    raise exception using errcode='42501',message='OPERATOR_ORGANIZATION_DENIED';
  end if;

  v_prefix := v_query||'%';

  with search_rows as (
    select
      'property'::text as kind,
      p.id as resource_id,
      p.name::text as title,
      concat_ws(', ',p.address_line1,p.locality,p.subdivision_code)::text as subtitle,
      p.status::text as status,
      p.id as property_id,
      p.name::text as property_name,
      concat('/app/properties/',p.id)::text as href,
      case
        when lower(p.name)=v_query then 0
        when lower(p.address_line1)=v_query then 1
        else 2
      end as match_rank,
      1 as kind_rank
    from public.properties p
    where p.organization_id=v_organization_id
      and p.status<>'archived'
      and (
        private.has_property_access(p.id,'property.read')
        or private.has_property_access(p.id,'property.manage')
      )
      and (lower(p.name) like v_prefix or lower(p.address_line1) like v_prefix)

    union all

    select
      'unit',u.id,concat('Unit ',u.unit_code),p.name,u.operational_status::text,
      p.id,p.name,concat('/app/properties/',p.id),
      case when lower(u.unit_code)=v_query then 0 else 2 end,2
    from public.units u
    join public.properties p on p.id=u.property_id
    where u.organization_id=v_organization_id
      and u.operational_status<>'retired'
      and (
        private.has_property_access(u.property_id,'property.read')
        or private.has_property_access(u.property_id,'property.manage')
      )
      and lower(u.unit_code) like v_prefix

    union all

    select
      'resident',t.id,h.display_name,concat(p.name,' · Unit ',u.unit_code),t.status::text,
      p.id,p.name,concat('/app/residents?tenancyId=',t.id),
      case when lower(h.display_name)=v_query then 0 else 2 end,3
    from public.tenancies t
    join public.households h on h.id=t.household_id
    join public.properties p on p.id=t.property_id
    join public.units u on u.id=t.unit_id
    where t.organization_id=v_organization_id
      and (
        private.has_property_access(t.property_id,'resident.read')
        or private.has_property_access(t.property_id,'resident.manage')
      )
      and lower(h.display_name) like v_prefix

    union all

    select
      'lease',l.id,coalesce(l.external_reference,concat('Lease · Unit ',u.unit_code)),
      concat(p.name,' · Unit ',u.unit_code),l.status::text,
      p.id,p.name,concat('/app/properties/',p.id),
      case when lower(coalesce(l.external_reference,''))=v_query then 0 else 2 end,4
    from public.leases l
    join public.properties p on p.id=l.property_id
    join public.units u on u.id=l.unit_id
    where l.organization_id=v_organization_id
      and l.external_reference is not null
      and (
        private.has_property_access(l.property_id,'lease.read')
        or private.has_property_access(l.property_id,'lease.manage')
      )
      and lower(l.external_reference) like v_prefix

    union all

    select
      'payment',pay.id,pay.public_reference,
      concat(p.name,' · ',pay.currency_code,' ',to_char(pay.amount_minor/100.0,'FM999999999990D00')),
      pay.status::text,p.id,p.name,concat('/app/payments/',pay.id),
      case when lower(pay.public_reference)=v_query then 0 else 2 end,5
    from public.payments pay
    join public.tenancies t on t.id=pay.tenancy_id
    join public.properties p on p.id=t.property_id
    where pay.organization_id=v_organization_id
      and (
        private.has_property_access(t.property_id,'finance.read')
        or private.has_property_access(t.property_id,'finance.manage')
      )
      and lower(pay.public_reference) like v_prefix

    union all

    select
      'maintenance_request',mr.id,mr.public_reference,
      concat(p.name,' · ',mr.title),mr.status::text,
      p.id,p.name,concat('/app/maintenance/',mr.id),
      case
        when lower(mr.public_reference)=v_query then 0
        when lower(mr.title)=v_query then 1
        else 2
      end,6
    from public.maintenance_requests mr
    join public.properties p on p.id=mr.property_id
    where mr.organization_id=v_organization_id
      and (
        private.has_property_access(mr.property_id,'maintenance.read')
        or private.has_property_access(mr.property_id,'maintenance.manage')
      )
      and (lower(mr.public_reference) like v_prefix or lower(mr.title) like v_prefix)

    union all

    select
      'work_order',wo.id,wo.public_reference,
      concat(p.name,' · ',mr.public_reference),wo.status::text,
      p.id,p.name,concat('/app/maintenance/',wo.maintenance_request_id),
      case when lower(wo.public_reference)=v_query then 0 else 2 end,7
    from public.work_orders wo
    join public.maintenance_requests mr on mr.id=wo.maintenance_request_id
    join public.properties p on p.id=wo.property_id
    where wo.organization_id=v_organization_id
      and (
        private.has_property_access(wo.property_id,'maintenance.read')
        or private.has_property_access(wo.property_id,'maintenance.manage')
      )
      and lower(wo.public_reference) like v_prefix

    union all

    select
      'document',d.id,d.title,
      concat_ws(' · ',replace(d.document_type,'_',' '),p.name),d.status::text,
      d.property_id,p.name,concat('/app/documents?documentId=',d.id),
      case when lower(d.title)=v_query then 0 else 2 end,8
    from public.documents d
    left join public.properties p on p.id=d.property_id
    where d.organization_id=v_organization_id
      and d.status not in ('archived','void')
      and (
        (
          d.property_id is not null
          and (
            private.has_property_access(d.property_id,'documents.read')
            or private.has_property_access(d.property_id,'documents.manage')
          )
        )
        or (
          d.property_id is null
          and (
            private.has_unscoped_org_permission(d.organization_id,'documents.read')
            or private.has_unscoped_org_permission(d.organization_id,'documents.manage')
          )
        )
      )
      and lower(d.title) like v_prefix

    union all

    select
      'owner_entity',oe.id,oe.display_name,p.name,oe.status,
      p.id,p.name,concat('/app/owner-statements/',oe.id),
      case when lower(oe.display_name)=v_query then 0 else 2 end,9
    from public.owner_entities oe
    join public.ownership_interests oi
      on oi.organization_id=oe.organization_id
     and oi.owner_entity_id=oe.id
     and oi.effective_from<=current_date
     and (oi.effective_to is null or oi.effective_to>=current_date)
    join public.properties p on p.id=oi.property_id
    where oe.organization_id=v_organization_id
      and oe.status='active'
      and (
        private.has_property_access(oi.property_id,'owner.read')
        or private.has_property_access(oi.property_id,'owner.manage')
      )
      and lower(oe.display_name) like v_prefix
  ),
  limited as (
    select *
    from search_rows
    order by match_rank,kind_rank,lower(title),resource_id
    limit v_limit
  )
  select jsonb_build_object(
    'query',v_query,
    'limit',v_limit,
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'kind',l.kind,
      'resourceId',l.resource_id,
      'title',l.title,
      'subtitle',l.subtitle,
      'status',l.status,
      'propertyId',l.property_id,
      'propertyName',l.property_name,
      'href',l.href
    ) order by l.match_rank,l.kind_rank,lower(l.title),l.resource_id),'[]'::jsonb)
  )
  into v_result
  from limited l;

  return v_result;
end;
$$;
revoke all on function public.get_operator_global_search(uuid,text,integer) from public,anon;
grant execute on function public.get_operator_global_search(uuid,text,integer) to authenticated;
revoke execute on function public.get_operator_global_search(text,integer) from authenticated;

commit;
