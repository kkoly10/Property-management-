-- v4.2 Batch A.1 — sanitized runtime diagnostics.
--
-- Batch A created failure states that exist only in private tables or in a cron response body nobody
-- reads: a dead-lettered scan, a dead-lettered notification, a charge schedule the command would
-- refuse, a property whose time zone is not a real zone. Each one silently stops work — documents that
-- never become usable, mail that never sends, rent that never generates — and none of them is visible
-- anywhere a human looks.
--
-- This adds ONE read-only support query for all of it, through the existing audited support-session
-- controls. It follows the same shape as the other support queries: authorize the session, read, and
-- record that the read happened.
--
-- What it deliberately does NOT expose, because a diagnostic surface that leaks is worse than no
-- diagnostic surface: document contents or titles, storage buckets or paths, secure-link tokens,
-- email bodies or recipient addresses, payment credentials, provider identifiers, and resident PII.
-- Every row is an identifier, a state, a bounded reason code and a timestamp.
--
-- It also adds NO tenant-RLS bypass. has_active_support_session is wired into no policy and this does
-- not change that: the function is `security definer` and reads directly, exactly like the other
-- sanitized support queries.
--
-- Authority: no table, no policy. Counts unchanged.
begin;

-- ── Reason codes safe to show ────────────────────────────────────────────────────────────────────
-- A raw last_error can contain anything a provider chose to put in it, including a URL with a token.
-- Only a known code passes through; anything else becomes 'UNCLASSIFIED', which still tells the
-- operator a job failed without repeating whatever the provider said.
create or replace function private.safe_failure_code(p_raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_raw is null then null
    when p_raw ~ '^[A-Z][A-Z0-9_]{2,60}$' then p_raw
    else 'UNCLASSIFIED'
  end
$$;

-- ── support_get_runtime_diagnostics ──────────────────────────────────────────────────────────────
-- One organization's stuck work, in the five states that actually differ operationally:
--
--   queued      — waiting for its worker; normal
--   processing  — claimed and in flight; normal
--   retrying    — failed, backing off, will be tried again on its own
--   dead_letter — out of attempts; will NEVER be tried again without a human
--   blocked     — a configuration problem the worker cannot fix by retrying
--
-- The distinction matters because the operator's response differs: "retrying" needs patience,
-- "dead_letter" needs retry_document_scan, and "blocked" needs someone to fix a book or a time zone.
create or replace function public.support_get_runtime_diagnostics(p_organization_id uuid, p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sess private.support_sessions%rowtype;
  v_limit integer := least(greatest(coalesce(p_limit,50),1),200);
  v_scans jsonb;
  v_notifications jsonb;
  v_schedules jsonb;
  v_zones jsonb;
  v_counts jsonb;
begin
  v_sess := private.authorize_support_query(p_organization_id);

  -- Document scans. No bucket, no path, no title, no digest — an id, a state and a bounded reason.
  select coalesce(jsonb_agg(jsonb_build_object(
    'documentScanJobId', j.id,
    'documentVersionId', j.document_version_id,
    'state', case
      when j.status = 'dead_letter' then 'dead_letter'
      when j.status = 'scanning' then 'processing'
      when j.status = 'queued' and j.attempts > 0 then 'retrying'
      when j.status = 'queued' then 'queued'
      else j.status
    end,
    'attempts', j.attempts,
    'maxAttempts', j.max_attempts,
    'reasonCode', private.safe_failure_code(j.last_error),
    'availableAt', j.available_at,
    'createdAt', j.created_at
  ) order by j.created_at desc), '[]'::jsonb)
  into v_scans
  from (
    select * from private.document_scan_jobs d
    where d.organization_id = p_organization_id and d.status <> 'succeeded'
    order by d.created_at desc limit v_limit
  ) j;

  -- Notifications. No recipient address, no subject, no body — template code and state only.
  select coalesce(jsonb_agg(jsonb_build_object(
    'notificationJobId', n.id,
    'templateCode', n.template_code,
    'channel', n.channel,
    'state', case
      when n.status = 'dead_letter' then 'dead_letter'
      when n.status = 'processing' then 'processing'
      when n.status = 'queued' and n.attempts > 0 then 'retrying'
      when n.status = 'queued' then 'queued'
      else n.status
    end,
    'attempts', n.attempts,
    'maxAttempts', n.max_attempts,
    'reasonCode', private.safe_failure_code(n.last_error),
    'availableAt', n.available_at,
    'createdAt', n.created_at
  ) order by n.created_at desc), '[]'::jsonb)
  into v_notifications
  from (
    select * from private.notification_jobs j
    where j.organization_id = p_organization_id and j.status not in ('sent','canceled')
    order by j.created_at desc limit v_limit
  ) n;

  -- Charge schedules the generator would refuse. These are 'blocked': retrying cannot help, because
  -- the cause is a closed book, an inactive receivable account or a currency mismatch.
  select coalesce(jsonb_agg(jsonb_build_object(
    'chargeScheduleId', s.schedule_id,
    'state', 'blocked',
    'reasonCode', s.blocked_reason,
    'nextRunOn', s.next_run_on
  ) order by s.schedule_id), '[]'::jsonb)
  into v_schedules
  from (
    select
      s.id as schedule_id,
      s.next_run_on,
      case
        when b.id is null or b.status <> 'open' then 'ACCOUNTING_BOOK_NOT_OPEN'
        when r.id is null or r.status <> 'active' then 'RECEIVABLE_ACCOUNT_NOT_ACTIVE'
        when p.accounting_book_id <> s.accounting_book_id
          or r.accounting_book_id <> s.accounting_book_id
          or r.currency_code <> s.currency_code
          or b.functional_currency_code <> s.currency_code then 'SCHEDULE_BOOK_CURRENCY_MISMATCH'
        else null
      end as blocked_reason
    from public.charge_schedules s
    join public.tenancies t on t.id = s.tenancy_id and t.organization_id = s.organization_id
    join public.properties p on p.id = t.property_id and p.organization_id = s.organization_id
    left join public.accounting_books b on b.id = s.accounting_book_id and b.organization_id = s.organization_id
    left join public.receivable_accounts r on r.id = s.receivable_account_id and r.organization_id = s.organization_id
    where s.organization_id = p_organization_id
      and s.status = 'active'
      and s.next_run_on is not null
      and t.status = 'active'
  ) s
  where s.blocked_reason is not null;

  -- Properties whose time zone is not a real zone. Rent never generates for these and the cron cannot
  -- tell anyone, because it skips them to avoid aborting every other zone.
  select coalesce(jsonb_agg(jsonb_build_object(
    'propertyId', p.id,
    'state', 'blocked',
    'reasonCode', 'UNKNOWN_TIME_ZONE',
    'timeZone', p.time_zone
  ) order by p.id), '[]'::jsonb)
  into v_zones
  from public.properties p
  where p.organization_id = p_organization_id
    and p.status <> 'archived'
    and not private.is_known_time_zone(p.time_zone);

  v_counts := jsonb_build_object(
    'deadLetterScans', (select count(*) from private.document_scan_jobs d where d.organization_id = p_organization_id and d.status = 'dead_letter'),
    'deadLetterNotifications', (select count(*) from private.notification_jobs j where j.organization_id = p_organization_id and j.status = 'dead_letter'),
    'blockedSchedules', jsonb_array_length(v_schedules),
    'invalidTimeZones', jsonb_array_length(v_zones)
  );

  -- Reading diagnostics is itself a support action and is audited like every other support query.
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (p_organization_id,(select auth.uid()),'support','support.viewed_runtime_diagnostics','organization',p_organization_id,v_sess.correlation_id,
    jsonb_build_object('supportSessionId',v_sess.id,'queryType','runtime_diagnostics','counts',v_counts));

  return jsonb_build_object(
    'counts', v_counts,
    'documentScans', v_scans,
    'notifications', v_notifications,
    'chargeSchedules', v_schedules,
    'propertyTimeZones', v_zones
  );
end;
$$;
revoke all on function public.support_get_runtime_diagnostics(uuid,integer) from public,anon;
grant execute on function public.support_get_runtime_diagnostics(uuid,integer) to authenticated;

commit;
