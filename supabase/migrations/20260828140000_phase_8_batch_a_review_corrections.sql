-- v4.2 Batch A — corrections from adversarial review.
--
-- Three defects found by reviewing the batch against a live PGlite chain. Two were confirmed by
-- executing them, not by reading.
--
-- (1) ONE MISCONFIGURED SCHEDULE BLOCKED ITS ENTIRE TIME ZONE, FOREVER.
--     list_due_charge_schedule_batches filtered only `status='active'`, `next_run_on <= local_date`
--     and an active tenancy — but generate_recurring_charges raises on four MORE conditions, from
--     inside its loop. A raise rolls the whole batch back, including the charge_generation_runs row,
--     so the zone produced zero charges. The next hourly run recomputed an identical (zone, date, id
--     set), derived the identical worker-run id, and failed identically. Forever.
--
--     Confirmed: closing one receivable account in a 6-schedule New York batch left the five HEALTHY
--     schedules with 0 charges and no run recorded. With the cron's p_limit of 500, one bad row could
--     hold up 500 tenancies' rent.
--
--     The selector now pre-checks the same conditions the command enforces and splits the result:
--     healthy schedules go into batches, unhealthy ones are reported as `blockedSchedules` with the
--     reason, so they are visible instead of silently poisoning their neighbours.
--
-- (2) BACK-DATED SCHEDULES CAUGHT UP AT MOST ONE PERIOD PER LOCAL DAY.
--     The worker-run id was derived from (zone, local date, schedule IDS). generate_recurring_charges
--     advances next_run_on by exactly one period per call, so a schedule three months in arrears was
--     still in the due set afterwards — with the SAME id set, therefore the same run id, so the next
--     run of that local day replayed the stored response instead of charging the next period.
--
--     The run id now covers (schedule id, next_run_on) PAIRS. An identical due set still replays, so
--     repeated and overlapping invocations remain duplicate-safe; but once a period is charged the
--     pair changes, so the following run legitimately charges the next one and arrears clear.
--
-- (3) get_privacy_request_workspace(p_organization_id) WAS NOT ACTUALLY SCOPED.
--     A3 narrowed has_property_access, has_org_permission and has_unscoped_org_permission — but the
--     privacy workspace gates its `organizations` list with private.is_active_org_member, which was
--     left alone. Confirmed: asking for organization A returned BOTH of the caller's organizations,
--     so the picker offered the tenant the page was not showing.
--
--     is_active_org_member is now narrowed the same way. It backs the RLS read policies on
--     organizations, operating_entities, accounting_books and organization_subscriptions, so this also
--     makes those base-table reads follow the active context — which is the intent, not a side effect.
--
-- Authority: no table, no policy. Counts unchanged.
begin;

-- ── (3) The last un-narrowed organization-membership helper ─────────────────────────────────────
-- Only the final `and (...)` clause is new; the rest is the shipped predicate verbatim. As with the
-- other three helpers it can only NARROW: an unset context behaves exactly as before.
create or replace function private.is_active_org_member(target_organization uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id=target_organization
      and m.user_id=(select auth.uid())
      and m.status='active'
      and m.starts_at<=now()
      and (m.ends_at is null or m.ends_at>now())
      and (private.active_organization_id() is null or target_organization=private.active_organization_id())
  );
$$;

-- ── (1) + (2) The batch selector, with per-schedule health and pair-based run ids ────────────────
create or replace function public.list_due_charge_schedule_batches(
  p_at timestamptz,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_at timestamptz := coalesce(p_at, now());
  v_batches jsonb;
  v_invalid jsonb;
  v_blocked jsonb;
begin
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception using errcode='23514',message='INVALID_SCHEDULE_BATCH_SIZE';
  end if;

  with due as (
    -- Every active schedule on an active tenancy, carrying the reason it could NOT be charged. The
    -- reasons mirror exactly what generate_recurring_charges raises, so a schedule that reaches a
    -- batch below is one the command will accept.
    select
      s.id as schedule_id,
      p.time_zone,
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
    where s.status = 'active'
      and s.next_run_on is not null
      and t.status = 'active'
  ),
  arrived as (
    -- The operational date is computed per zone, so "due" means due WHERE THE PROPERTY STANDS.
    select d.*, private.operational_date(d.time_zone, v_at) as local_date
    from due d
    where private.is_known_time_zone(d.time_zone)
      and d.next_run_on <= private.operational_date(d.time_zone, v_at)
  ),
  limited as (
    select a.*, row_number() over (partition by a.time_zone order by a.next_run_on, a.schedule_id) as rank_in_zone
    from arrived a
    where a.blocked_reason is null
  ),
  grouped as (
    select
      l.time_zone,
      l.local_date,
      count(*)::integer as schedule_count,
      array_agg(l.schedule_id order by l.schedule_id) as schedule_ids,
      string_agg(l.schedule_id::text || '@' || l.next_run_on::text, ',' order by l.schedule_id) as pairs
    from limited l
    where l.rank_in_zone <= p_limit
    group by l.time_zone, l.local_date
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'timeZone', g.time_zone,
        'localDate', g.local_date,
        'scheduleCount', g.schedule_count,
        'scheduleIds', to_jsonb(g.schedule_ids),
        -- Over (schedule, next_run_on) PAIRS, not ids alone: an unchanged due set still replays, but a
        -- charged period changes the pair, so arrears clear one run at a time instead of one per day.
        'workerRunId', 'rent-' || g.local_date::text || '-'
          || left(encode(sha256(convert_to(g.time_zone || '|' || g.pairs, 'UTF8')), 'hex'), 32)
      ) order by g.time_zone)
      from grouped g
    ), '[]'::jsonb),
    coalesce((
      -- Reported, never carried into a batch where they would roll back every healthy schedule beside
      -- them. Visible instead of silently poisoning their neighbours.
      select jsonb_agg(jsonb_build_object(
        'scheduleId', a.schedule_id,
        'timeZone', a.time_zone,
        'localDate', a.local_date,
        'reason', a.blocked_reason
      ) order by a.schedule_id)
      from arrived a
      where a.blocked_reason is not null
    ), '[]'::jsonb)
  into v_batches, v_blocked;

  select coalesce(jsonb_agg(distinct to_jsonb(z.time_zone)), '[]'::jsonb)
  into v_invalid
  from (
    select distinct p.time_zone
    from public.charge_schedules s
    join public.tenancies t on t.id = s.tenancy_id and t.organization_id = s.organization_id
    join public.properties p on p.id = t.property_id and p.organization_id = s.organization_id
    where s.status = 'active' and s.next_run_on is not null and t.status = 'active'
  ) z
  where not private.is_known_time_zone(z.time_zone);

  return jsonb_build_object(
    'evaluatedAt', v_at,
    'batchCount', jsonb_array_length(v_batches),
    'batches', v_batches,
    'invalidTimeZones', v_invalid,
    'blockedSchedules', v_blocked
  );
end;
$$;
revoke all on function public.list_due_charge_schedule_batches(timestamptz,integer) from public,anon,authenticated;
grant execute on function public.list_due_charge_schedule_batches(timestamptz,integer) to service_role;

commit;
