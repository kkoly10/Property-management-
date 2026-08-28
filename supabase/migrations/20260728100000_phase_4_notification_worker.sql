-- Phase 4: transactional notification worker.
--
-- Commands across the app already ENQUEUE private.notification_jobs, but nothing ever drained the
-- queue, so no transactional message was ever sent. This slice adds the drain half: a service_role
-- worker surface that claims due jobs with FOR UPDATE SKIP LOCKED (so N concurrent workers never send
-- the same message twice), records a provider receipt per attempt in private.notification_deliveries,
-- retries with capped exponential backoff, and dead-letters a job that exhausts its attempts.
--
-- Deliberate boundaries:
--   * No provider is invented here. The worker hands a sanitized job DTO to the caller, which performs
--     the send with real credentials; complete/fail record the outcome. With no transport configured
--     the internal route reports "not configured" rather than pretending to deliver.
--   * Preference suppression is honored for CATEGORY notifications only. Access/security mail
--     (invitations, password-style flows) maps to a null category and can never be silenced by a
--     preference row — losing an invitation email would lock a user out of the product.
--   * Forward-only and additive: columns are added with `if not exists`, no table and no RLS policy is
--     created, so the authority table/policy counts are unchanged.
begin;

-- ── Worker bookkeeping columns (additive) ─────────────────────────────────────────────────────────
alter table private.notification_jobs add column if not exists claimed_at timestamptz;
alter table private.notification_jobs add column if not exists sent_at timestamptz;
alter table private.notification_jobs add column if not exists last_error text;
alter table private.notification_jobs add column if not exists max_attempts integer not null default 6;
alter table private.notification_jobs add column if not exists worker_run_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notification_jobs_max_attempts_positive'
  ) then
    alter table private.notification_jobs
      add constraint notification_jobs_max_attempts_positive check (max_attempts between 1 and 20);
  end if;
end;
$$;

-- The queue's hot path: due jobs of one channel, oldest first.
create index if not exists notification_jobs_due_idx
  on private.notification_jobs(channel, available_at, created_at)
  where status = 'queued';
-- Stalled-claim sweep support.
create index if not exists notification_jobs_processing_idx
  on private.notification_jobs(claimed_at)
  where status = 'processing';

-- ── Template → preference category ────────────────────────────────────────────────────────────────
-- NULL means "transactional / access mail": never suppressible by a notification preference.
create or replace function private.notification_template_category(p_template_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_template_code like 'payment%' or p_template_code like 'receipt%' then 'payments'
    when p_template_code like 'maintenance%' or p_template_code like 'work_order%' then 'maintenance'
    when p_template_code like 'conversation%' or p_template_code like 'message%' then 'messages'
    when p_template_code like 'document%' or p_template_code like 'statement%' then 'documents'
    when p_template_code like 'announcement%' then 'announcements'
    else null
  end
$$;

-- ── Retry backoff: exponential, capped, deterministic ─────────────────────────────────────────────
create or replace function private.notification_retry_delay(p_attempts integer)
returns interval
language sql
immutable
set search_path = ''
as $$
  select least(
    make_interval(secs => 60 * power(3, greatest(p_attempts,1) - 1)::double precision),
    interval '6 hours'
  )
$$;

-- ── claim_notification_jobs: the queue pop ────────────────────────────────────────────────────────
-- Suppresses opted-out category mail first (terminal 'canceled', so it is never re-examined), then
-- claims up to p_limit due jobs for the channel. SKIP LOCKED makes concurrent workers disjoint.
create or replace function public.claim_notification_jobs(
  p_channel text,
  p_limit integer,
  p_worker_run_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_suppressed integer := 0;
  v_jobs jsonb;
begin
  if p_channel is null or p_channel not in ('in_app','email','sms','whatsapp','push') then
    raise exception using errcode='23514',message='INVALID_NOTIFICATION_CHANNEL';
  end if;
  if p_limit is null or p_limit not between 1 and 200 then
    raise exception using errcode='23514',message='INVALID_NOTIFICATION_BATCH_SIZE';
  end if;
  if p_worker_run_id is null or length(trim(p_worker_run_id)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_WORKER_RUN_ID';
  end if;

  -- Preference suppression. in_app is not a preference-gated channel (the preference table's own check
  -- constraint excludes it), and a null category is transactional mail that must always send.
  if p_channel <> 'in_app' then
    with suppressible as (
      select j.id
      from private.notification_jobs j
      where j.channel = p_channel
        and j.status = 'queued'
        and j.available_at <= now()
        and j.recipient_user_id is not null
        and private.notification_template_category(j.template_code) is not null
        and exists (
          select 1 from public.notification_preferences np
          where np.user_id = j.recipient_user_id
            and np.channel = j.channel
            and np.category = private.notification_template_category(j.template_code)
            and np.enabled = false
        )
      for update skip locked
    )
    update private.notification_jobs j
    set status = 'canceled', last_error = 'RECIPIENT_OPTED_OUT'
    from suppressible s
    where j.id = s.id;
    get diagnostics v_suppressed = row_count;
  end if;

  with due as (
    select j.id
    from private.notification_jobs j
    where j.channel = p_channel
      and j.status = 'queued'
      and j.available_at <= now()
    order by j.available_at, j.created_at
    limit p_limit
    for update skip locked
  ),
  claimed as (
    update private.notification_jobs j
    set status = 'processing',
        attempts = j.attempts + 1,
        claimed_at = now(),
        worker_run_id = p_worker_run_id
    from due d
    where j.id = d.id
    returning j.id, j.organization_id, j.template_code, j.locale, j.channel,
              j.recipient_user_id, j.recipient_address, j.payload, j.attempts, j.max_attempts
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'notificationJobId', c.id,
    'organizationId', c.organization_id,
    'templateCode', c.template_code,
    'category', private.notification_template_category(c.template_code),
    'locale', c.locale,
    'channel', c.channel,
    'recipientUserId', c.recipient_user_id,
    'recipientAddress', coalesce(c.recipient_address, u.email),
    'payload', c.payload,
    'attempt', c.attempts,
    'maxAttempts', c.max_attempts
  ) order by c.id), '[]'::jsonb)
  into v_jobs
  from claimed c
  left join auth.users u on u.id = c.recipient_user_id;

  return jsonb_build_object(
    'workerRunId', p_worker_run_id,
    'channel', p_channel,
    'claimed', jsonb_array_length(v_jobs),
    'suppressed', v_suppressed,
    'jobs', v_jobs
  );
end;
$$;
revoke all on function public.claim_notification_jobs(text,integer,text) from public,anon,authenticated;
grant execute on function public.claim_notification_jobs(text,integer,text) to service_role;

-- ── complete_notification_job: a successful send ──────────────────────────────────────────────────
create or replace function public.complete_notification_job(
  p_notification_job_id uuid,
  p_provider_code text,
  p_provider_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.notification_jobs%rowtype;
begin
  select * into v_job from private.notification_jobs j where j.id = p_notification_job_id for update;
  if not found then raise exception using errcode='P0002',message='NOTIFICATION_JOB_NOT_FOUND'; end if;
  -- Idempotent: a duplicate completion (worker retried its own bookkeeping) returns the stored outcome.
  if v_job.status = 'sent' then
    return jsonb_build_object('notificationJobId',v_job.id,'status','sent','duplicate',true);
  end if;
  if v_job.status <> 'processing' then
    raise exception using errcode='23514',message='NOTIFICATION_JOB_NOT_CLAIMED';
  end if;

  update private.notification_jobs
  set status='sent', sent_at=now(), last_error=null
  where id = p_notification_job_id;

  insert into private.notification_deliveries(notification_job_id,provider_code,provider_message_id,status,provider_payload)
  values (p_notification_job_id,nullif(trim(coalesce(p_provider_code,'')),''),nullif(trim(coalesce(p_provider_message_id,'')),''),'accepted',
    jsonb_build_object('attempt',v_job.attempts));

  return jsonb_build_object('notificationJobId',v_job.id,'status','sent','duplicate',false);
end;
$$;
revoke all on function public.complete_notification_job(uuid,text,text) from public,anon,authenticated;
grant execute on function public.complete_notification_job(uuid,text,text) to service_role;

-- ── fail_notification_job: retry with backoff, or dead-letter ─────────────────────────────────────
create or replace function public.fail_notification_job(
  p_notification_job_id uuid,
  p_error_code text,
  p_retryable boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.notification_jobs%rowtype;
  v_error text := left(coalesce(nullif(trim(coalesce(p_error_code,'')),''),'UNKNOWN_SEND_ERROR'), 500);
  v_retryable boolean := coalesce(p_retryable, true);
  v_next_status text;
  v_available_at timestamptz;
begin
  select * into v_job from private.notification_jobs j where j.id = p_notification_job_id for update;
  if not found then raise exception using errcode='P0002',message='NOTIFICATION_JOB_NOT_FOUND'; end if;
  if v_job.status in ('dead_letter','canceled') then
    return jsonb_build_object('notificationJobId',v_job.id,'status',v_job.status,'duplicate',true);
  end if;
  if v_job.status <> 'processing' then
    raise exception using errcode='23514',message='NOTIFICATION_JOB_NOT_CLAIMED';
  end if;

  -- A non-retryable provider verdict (invalid address, hard bounce) dead-letters immediately; an
  -- exhausted retry budget does the same. Otherwise the job returns to the queue behind its backoff.
  if not v_retryable or v_job.attempts >= v_job.max_attempts then
    v_next_status := 'dead_letter';
    v_available_at := v_job.available_at;
  else
    v_next_status := 'queued';
    v_available_at := now() + private.notification_retry_delay(v_job.attempts);
  end if;

  update private.notification_jobs
  set status = v_next_status, last_error = v_error, available_at = v_available_at, claimed_at = null
  where id = p_notification_job_id;

  insert into private.notification_deliveries(notification_job_id,provider_code,status,provider_payload)
  values (p_notification_job_id,null,'failed',
    jsonb_build_object('attempt',v_job.attempts,'errorCode',v_error,'retryable',v_retryable));

  -- A dead letter is an operational incident worth investigating: leave an audit trail.
  if v_next_status = 'dead_letter' then
    insert into audit.audit_events(
      organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
    ) values (
      v_job.organization_id,null,'system','notification.deadLettered','notification_job',v_job.id,gen_random_uuid(),
      jsonb_build_object('templateCode',v_job.template_code,'channel',v_job.channel,'attempts',v_job.attempts,'errorCode',v_error)
    );
  end if;

  return jsonb_build_object(
    'notificationJobId',v_job.id,'status',v_next_status,'duplicate',false,
    'attempts',v_job.attempts,'availableAt',v_available_at
  );
end;
$$;
revoke all on function public.fail_notification_job(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.fail_notification_job(uuid,text,boolean) to service_role;

-- ── requeue_stalled_notification_jobs: a worker died mid-send ─────────────────────────────────────
-- Without this a crashed worker's claims stay 'processing' forever. Re-queueing costs at most one
-- duplicate send, which is the correct trade for a transactional message that would otherwise vanish.
create or replace function public.requeue_stalled_notification_jobs(p_stall_minutes integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_requeued integer := 0; v_dead integer := 0;
begin
  if p_stall_minutes is null or p_stall_minutes not between 1 and 1440 then
    raise exception using errcode='23514',message='INVALID_STALL_WINDOW';
  end if;

  -- One statement so the sweep, its dead-letter audit trail, and the counters share a snapshot.
  -- A data-modifying CTE always runs to completion even when the primary query ignores its output,
  -- so `audited` fires for every job this sweep dead-letters.
  with stalled as (
    select j.id, j.attempts, j.max_attempts
    from private.notification_jobs j
    where j.status = 'processing'
      and j.claimed_at is not null
      and j.claimed_at <= now() - make_interval(mins => p_stall_minutes)
    for update skip locked
  ),
  swept as (
    update private.notification_jobs j
    set status = case when s.attempts >= s.max_attempts then 'dead_letter' else 'queued' end,
        last_error = 'WORKER_STALLED',
        claimed_at = null,
        available_at = case when s.attempts >= s.max_attempts then j.available_at
                            else now() + private.notification_retry_delay(s.attempts) end
    from stalled s
    where j.id = s.id
    returning j.id, j.status, j.organization_id, j.template_code, j.channel, j.attempts
  ),
  audited as (
    insert into audit.audit_events(
      organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
    )
    select w.organization_id,null,'system','notification.deadLettered','notification_job',w.id,gen_random_uuid(),
      jsonb_build_object('templateCode',w.template_code,'channel',w.channel,'attempts',w.attempts,'errorCode','WORKER_STALLED')
    from swept w
    where w.status = 'dead_letter'
    returning 1
  )
  select count(*)::integer, count(*) filter (where w.status='dead_letter')::integer
  into v_requeued, v_dead
  from swept w;

  return jsonb_build_object('requeued',v_requeued,'deadLettered',v_dead);
end;
$$;
revoke all on function public.requeue_stalled_notification_jobs(integer) from public,anon,authenticated;
grant execute on function public.requeue_stalled_notification_jobs(integer) to service_role;

commit;
