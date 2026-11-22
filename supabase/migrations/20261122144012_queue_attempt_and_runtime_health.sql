begin;

-- A run identifier belongs to a claim, even when that claim is later requeued.
-- Take the same row lock as the existing transition functions and hold it through settlement.
create function private.require_queue_attempt(p_queue text, p_job_id uuid, p_worker_run_id text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_run_id text;
begin
  case p_queue
    when 'notification' then
      select j.worker_run_id into v_run_id
        from private.notification_jobs j where j.id = p_job_id for update;
    when 'document_scan' then
      select j.worker_run_id into v_run_id
        from private.document_scan_jobs j where j.id = p_job_id for update;
    else
      raise exception using errcode = '22023', message = 'INVALID_WORKER_QUEUE';
  end case;
  if not found then
    raise exception using errcode = 'P0002', message = 'QUEUE_JOB_NOT_FOUND';
  end if;
  if p_worker_run_id is null or v_run_id is distinct from p_worker_run_id then
    raise exception using errcode = '40001', message = 'QUEUE_ATTEMPT_STALE';
  end if;
end;
$$;
revoke all on function private.require_queue_attempt(text,uuid,text) from public,anon,authenticated,service_role;

create function public.complete_notification_attempt(
  p_notification_job_id uuid, p_worker_run_id text, p_provider_code text, p_provider_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(btrim(coalesce(p_provider_message_id, ''))) not between 1 and 200
     or p_provider_message_id ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'NOTIFICATION_RECEIPT_REQUIRED';
  end if;
  perform private.require_queue_attempt('notification', p_notification_job_id, p_worker_run_id);
  return public.complete_notification_job(p_notification_job_id, p_provider_code, btrim(p_provider_message_id));
end;
$$;
revoke all on function public.complete_notification_attempt(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_notification_attempt(uuid,text,text,text) to service_role;

create function public.fail_notification_attempt(
  p_notification_job_id uuid, p_worker_run_id text, p_error_code text, p_retryable boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_queue_attempt('notification', p_notification_job_id, p_worker_run_id);
  return public.fail_notification_job(p_notification_job_id, p_error_code, p_retryable);
end;
$$;
revoke all on function public.fail_notification_attempt(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.fail_notification_attempt(uuid,text,text,boolean) to service_role;

create function public.complete_document_scan_attempt(
  p_document_scan_job_id uuid, p_worker_run_id text, p_verdict text,
  p_observed_sha256_hex text, p_provider_code text, p_provider_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_queue_attempt('document_scan', p_document_scan_job_id, p_worker_run_id);
  return public.complete_document_scan(
    p_document_scan_job_id, p_verdict, p_observed_sha256_hex, p_provider_code, p_provider_reference
  );
end;
$$;
revoke all on function public.complete_document_scan_attempt(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_document_scan_attempt(uuid,text,text,text,text,text) to service_role;

create function public.fail_document_scan_attempt(
  p_document_scan_job_id uuid, p_worker_run_id text, p_error_code text, p_retryable boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_queue_attempt('document_scan', p_document_scan_job_id, p_worker_run_id);
  return public.fail_document_scan(p_document_scan_job_id, p_error_code, p_retryable);
end;
$$;
revoke all on function public.fail_document_scan_attempt(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.fail_document_scan_attempt(uuid,text,text,boolean) to service_role;

create table private.runtime_heartbeats (
  job text primary key check (job in ('recurring-charges','notifications','document-scans','operational-sweep')),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  status integer not null check (status between 200 and 599)
);
alter table private.runtime_heartbeats enable row level security;
revoke all on table private.runtime_heartbeats from public,anon,authenticated,service_role;

create function public.record_runtime_heartbeat(p_job text, p_started_at timestamptz, p_status integer)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.runtime_heartbeats as h (job, started_at, finished_at, status)
  values (p_job, p_started_at, clock_timestamp(), p_status)
  on conflict (job) do update
    set started_at = excluded.started_at, finished_at = excluded.finished_at, status = excluded.status
    where excluded.started_at >= h.started_at;
$$;
revoke all on function public.record_runtime_heartbeat(text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.record_runtime_heartbeat(text,timestamptz,integer) to service_role;

create function public.platform_business_overview_with_runtime()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_overview jsonb;
begin
  -- Enforces the same platform-admin/AAL2 checks and audit as the business overview.
  v_overview := public.platform_business_overview();
  return jsonb_set(v_overview, '{operations,runtime}', jsonb_build_object(
    'heartbeats', (select coalesce(jsonb_object_agg(h.job, jsonb_build_object(
      'startedAt', h.started_at, 'finishedAt', h.finished_at, 'status', h.status
    )), '{}'::jsonb) from private.runtime_heartbeats h),
    'oldestDueNotificationAt', (select min(j.available_at) from private.notification_jobs j
      where j.status = 'queued' and j.available_at <= now()),
    'oldestDueScanAt', (select min(j.available_at) from private.document_scan_jobs j
      where j.status = 'queued' and j.available_at <= now())
  ));
end;
$$;
revoke all on function public.platform_business_overview_with_runtime() from public,anon,service_role;
grant execute on function public.platform_business_overview_with_runtime() to authenticated;

commit;
