-- Phase 4 (v4.2 Batch A2): runtime scheduling support for rent generation and operational recovery.
--
-- Two defects this closes.
--
-- (1) NOTHING EVER CALLED THE WORKERS. generate_recurring_charges, the notification drain and the scan
--     drain all existed and all worked, but no scheduler invoked any of them, so in a deployed product
--     no rent was ever charged and no message was ever sent. The scheduled callers ship alongside this
--     migration as repository-defined Vercel cron entries; this file adds the database half they need.
--
-- (2) ONE NAIVE UTC DATE FOR EVERY PROPERTY. generate_recurring_charges takes a single p_run_date and
--     applies it to every due schedule. A scheduler that passed `current_date` in UTC would charge a
--     Los Angeles property on the 1st while it is still the 31st there — every month, and every rent
--     charge would carry a due date and a journal effective date belonging to the wrong day. File 27
--     §5.A2 makes the property's own time zone binding.
--
-- The fix reuses the existing, proven, idempotent command rather than reimplementing it:
-- list_due_charge_schedule_batches partitions due schedules by their PROPERTY'S time zone, computes the
-- operational date in each zone, and hands back exactly the schedule ids due for that local date plus a
-- deterministic worker-run id. The scheduler then calls generate_recurring_charges once per zone.
--
-- Authority: adds NO table and NO RLS policy, so the authority counts are unchanged.
begin;

-- ── The operational date for one zone ────────────────────────────────────────────────────────────
-- Every financial command in this codebase already derives its effective date this way
-- (`(x at time zone property.time_zone)::date`). Naming it makes the scheduler use the same rule.
create or replace function private.operational_date(p_time_zone text, p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_at at time zone p_time_zone)::date
$$;

-- properties.time_zone is unconstrained text. A single unrecognized zone would abort a query that spans
-- every property, so the batch selector validates zones once and reports the bad ones instead of
-- failing the whole run — an unknown zone must not stop rent from generating everywhere else.
create or replace function private.is_known_time_zone(p_time_zone text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_time_zone)
$$;

-- ── list_due_charge_schedule_batches: what is due, per zone, right now ───────────────────────────
-- Read-only. Returns one batch per time zone that has due schedules, each carrying the local
-- operational date, the bounded set of schedule ids due on that date, and a worker-run id derived from
-- (zone, local date, exact id set).
--
-- That derivation is what makes repeated and overlapping scheduler invocations safe. Call it twice with
-- the same due set and generate_recurring_charges sees the same worker-run id AND the same request
-- hash, so the second call replays the stored response instead of double-charging. Once a run succeeds
-- the schedules' next_run_on has advanced, so the next evaluation simply returns no batch for them.
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
  v_zone text;
  v_local_date date;
  v_ids uuid[];
  v_batches jsonb := '[]'::jsonb;
  v_invalid jsonb := '[]'::jsonb;
begin
  -- 500 is generate_recurring_charges' own TOO_MANY_SCHEDULE_IDS ceiling; a batch it would refuse is
  -- not a batch worth handing out.
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception using errcode='23514',message='INVALID_SCHEDULE_BATCH_SIZE';
  end if;

  for v_zone in
    select distinct p.time_zone
    from public.charge_schedules s
    join public.tenancies t on t.id = s.tenancy_id and t.organization_id = s.organization_id
    join public.properties p on p.id = t.property_id and p.organization_id = s.organization_id
    where s.status = 'active' and s.next_run_on is not null
    order by 1
  loop
    if not private.is_known_time_zone(v_zone) then
      v_invalid := v_invalid || to_jsonb(v_zone);
      continue;
    end if;

    v_local_date := private.operational_date(v_zone, v_at);

    select coalesce(array_agg(x.id order by x.id), '{}'::uuid[])
    into v_ids
    from (
      select s.id
      from public.charge_schedules s
      join public.tenancies t on t.id = s.tenancy_id and t.organization_id = s.organization_id
      join public.properties p on p.id = t.property_id and p.organization_id = s.organization_id
      where s.status = 'active'
        and s.next_run_on is not null
        and p.time_zone = v_zone
        and t.status = 'active'
        and s.next_run_on <= v_local_date
      order by s.next_run_on, s.id
      limit p_limit
    ) x;

    if coalesce(array_length(v_ids, 1), 0) = 0 then
      continue;
    end if;

    v_batches := v_batches || jsonb_build_array(jsonb_build_object(
      'timeZone', v_zone,
      'localDate', v_local_date,
      'scheduleCount', array_length(v_ids, 1),
      'scheduleIds', to_jsonb(v_ids),
      -- Stable across invocations for an identical due set, distinct across zones and across dates.
      'workerRunId', 'rent-' || v_local_date::text || '-'
        || left(encode(sha256(convert_to(v_zone || '|' || array_to_string(v_ids, ','), 'UTF8')), 'hex'), 32)
    ));
  end loop;

  return jsonb_build_object(
    'evaluatedAt', v_at,
    'batchCount', jsonb_array_length(v_batches),
    'batches', v_batches,
    'invalidTimeZones', v_invalid
  );
end;
$$;
revoke all on function public.list_due_charge_schedule_batches(timestamptz,integer) from public,anon,authenticated;
grant execute on function public.list_due_charge_schedule_batches(timestamptz,integer) to service_role;

-- ── sweep_expired_operational_records: the recovery job with no other home ───────────────────────
-- Two kinds of stale row accumulate with nothing to clear them:
--   * upload grants still 'issued' past their expiry. finalize_document already expires one lazily when
--     it is presented, but a grant nobody ever finalizes stays 'issued' forever and keeps its storage
--     path reserved by the unique(storage_bucket,storage_path) constraint.
--   * idempotency records past expires_at. They exist to bound a replay window and carry the TTL for
--     exactly this purpose.
-- Both are bounded per run so a scheduled sweep can never take a long transaction on a large table.
create or replace function public.sweep_expired_operational_records(p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grants integer := 0;
  v_records integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 5000 then
    raise exception using errcode='23514',message='INVALID_SWEEP_LIMIT';
  end if;

  with due as (
    select g.id from private.upload_grants g
    where g.status = 'issued' and g.expires_at <= now()
    order by g.expires_at
    limit p_limit
    for update skip locked
  )
  update private.upload_grants g set status = 'expired'
  from due d where g.id = d.id;
  get diagnostics v_grants = row_count;

  with due as (
    select r.id from private.idempotency_records r
    where r.expires_at <= now()
    order by r.expires_at
    limit p_limit
    for update skip locked
  )
  delete from private.idempotency_records r using due d where r.id = d.id;
  get diagnostics v_records = row_count;

  return jsonb_build_object('expiredUploadGrants', v_grants, 'purgedIdempotencyRecords', v_records);
end;
$$;
revoke all on function public.sweep_expired_operational_records(integer) from public,anon,authenticated;
grant execute on function public.sweep_expired_operational_records(integer) to service_role;

commit;
