-- Phase 2 (v4.2 Batch A1): real document malware-scan lifecycle.
--
-- finalize_document has always parked a new version in 'quarantined', and 17 downstream gates refuse
-- anything that is not 'clean'. Nothing ever advanced a version, so every uploaded document was
-- permanently unusable and the only way past it was a manual SQL edit — which file 27 §5.A1 now
-- explicitly forbids as certification. This adds the missing half:
--
--     quarantined -> scanning -> clean | rejected
--
-- Provider-neutral by construction: the database owns the state machine and the SHA binding; whatever
-- performs the actual scan is an external adapter that only reports a verdict. No provider is invented.
--
-- Authority: adds ONE table in schema private (76 -> 77 tables). No RLS policy is added — the table is
-- private, unreachable from the browser, and reached only through service_role definer commands, so the
-- public/reporting policy count stays 59.
begin;

-- ── Durable scan-job state ───────────────────────────────────────────────────────────────────────
-- One job per finalized version, enforced by a unique constraint rather than by caller discipline.
create table if not exists private.document_scan_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_version_id uuid not null unique references public.document_versions(id) on delete restrict,
  -- The binding triple, copied at enqueue time. A result is only applied if it still matches BOTH this
  -- job and the live version row, so a late or replayed verdict cannot clean a different object.
  storage_bucket text not null,
  storage_path text not null,
  expected_sha256_hex text not null check (expected_sha256_hex ~ '^[0-9a-f]{64}$'),
  status text not null default 'queued' check (status in ('queued','scanning','succeeded','dead_letter')),
  verdict text check (verdict is null or verdict in ('clean','infected')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  worker_run_id text,
  provider_code text,
  provider_reference text,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status in ('succeeded') and verdict is not null) or status <> 'succeeded')
);
create index if not exists document_scan_jobs_due_idx
  on private.document_scan_jobs(available_at, created_at) where status = 'queued';
create index if not exists document_scan_jobs_stalled_idx
  on private.document_scan_jobs(claimed_at) where status = 'scanning';

revoke all on private.document_scan_jobs from public, anon, authenticated;

-- Capped exponential backoff, mirroring the notification worker's shape.
create or replace function private.scan_retry_delay(p_attempts integer)
returns interval
language sql
immutable
set search_path = ''
as $$
  select least(
    make_interval(secs => 30 * power(3, greatest(p_attempts,1) - 1)::double precision),
    interval '2 hours'
  )
$$;

-- ── Enqueue: finalize_document additionally creates the scan job ─────────────────────────────────
-- Same signature and same behavior as the shipped command, plus the enqueue. The version still lands
-- 'quarantined'; nothing here makes a document usable.
create or replace function public.finalize_document(
  p_actor_user_id uuid,
  p_grant_id uuid,
  p_sha256_hex text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := p_actor_user_id;
  v_grant private.upload_grants%rowtype;
  v_property_id uuid;
  v_unit_id uuid;
  v_tenancy_id uuid;
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='ACTOR_REQUIRED'; end if;
  if p_sha256_hex is null or p_sha256_hex !~ '^[0-9a-fA-F]{64}$' then raise exception using errcode='23514',message='INVALID_CHECKSUM'; end if;

  select * into v_grant from private.upload_grants g where g.id=p_grant_id for update;
  if not found or v_grant.actor_user_id<>v_actor_id then raise exception using errcode='42501',message='UPLOAD_GRANT_NOT_FOUND'; end if;
  if not private.user_can_manage_document_parent(v_actor_id,v_grant.organization_id,v_grant.parent_resource_type,v_grant.parent_resource_id) then
    raise exception using errcode='42501',message='PARENT_SCOPE_DENIED';
  end if;

  v_request_hash := encode(sha256(convert_to(concat_ws('|',p_grant_id,lower(p_sha256_hex)),'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=v_grant.organization_id and r.actor_user_id=v_actor_id
    and r.route='FinalizeDocument' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  if v_grant.status<>'issued' then raise exception using errcode='23514',message='UPLOAD_GRANT_ALREADY_USED'; end if;
  if v_grant.expires_at<=now() then
    update private.upload_grants set status='expired' where id=p_grant_id;
    raise exception using errcode='23514',message='UPLOAD_GRANT_EXPIRED';
  end if;

  if v_grant.parent_resource_type='property' then
    v_property_id := v_grant.parent_resource_id;
  elsif v_grant.parent_resource_type='unit' then
    v_unit_id := v_grant.parent_resource_id;
    select u.property_id into v_property_id from public.units u where u.id=v_unit_id and u.organization_id=v_grant.organization_id;
  elsif v_grant.parent_resource_type='tenancy' then
    v_tenancy_id := v_grant.parent_resource_id;
    select t.property_id,t.unit_id into v_property_id,v_unit_id from public.tenancies t
    where t.id=v_tenancy_id and t.organization_id=v_grant.organization_id;
    if not found then raise exception using errcode='P0002',message='TENANCY_NOT_FOUND'; end if;
  elsif v_grant.parent_resource_type='work_order' then
    select w.property_id,w.unit_id into v_property_id,v_unit_id from public.work_orders w
    where w.id=v_grant.parent_resource_id and w.organization_id=v_grant.organization_id;
    if not found then raise exception using errcode='P0002',message='WORK_ORDER_NOT_FOUND'; end if;
  end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (v_grant.organization_id,v_actor_id,'FinalizeDocument',p_idempotency_key,v_request_hash,now()+interval '24 hours');

  insert into public.documents(id,organization_id,property_id,unit_id,tenancy_id,document_type,title,source,status,operator_supplied_unverified,created_by)
  values (v_grant.document_id,v_grant.organization_id,v_property_id,v_unit_id,v_tenancy_id,v_grant.document_type,v_grant.title,'operator_supplied','active',true,v_actor_id);
  insert into public.document_versions(
    id,organization_id,document_id,version_number,storage_bucket,storage_path,mime_type,size_bytes,
    sha256_hex,original_filename,uploaded_by,upload_status
  ) values (
    v_grant.version_id,v_grant.organization_id,v_grant.document_id,1,v_grant.storage_bucket,v_grant.storage_path,
    v_grant.requested_mime_type,v_grant.requested_size_bytes,lower(p_sha256_hex),v_grant.original_filename,v_actor_id,'quarantined'
  );
  update private.upload_grants set status='finalized' where id=p_grant_id;

  -- Exactly one scan operation per finalized version. `do nothing` makes a replay inert rather than
  -- raising, so the command's own idempotency contract is unaffected.
  insert into private.document_scan_jobs(
    organization_id,document_version_id,storage_bucket,storage_path,expected_sha256_hex
  ) values (
    v_grant.organization_id,v_grant.version_id,v_grant.storage_bucket,v_grant.storage_path,lower(p_sha256_hex)
  ) on conflict (document_version_id) do nothing;

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (v_grant.organization_id,v_actor_id,'user','document.uploaded','document',v_grant.document_id,v_correlation_id,
    jsonb_build_object('versionId',v_grant.version_id,'parentType',v_grant.parent_resource_type,'scanStatus','pending'));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (v_grant.organization_id,'document.uploaded','document',v_grant.document_id,v_correlation_id,
    jsonb_build_object('documentId',v_grant.document_id,'versionId',v_grant.version_id,'storageBucket',v_grant.storage_bucket,'storagePath',v_grant.storage_path));

  v_response := jsonb_build_object('documentId',v_grant.document_id,'versionId',v_grant.version_id,'scanStatus','pending');
  update private.idempotency_records r
  set state='completed',response_status=201,response_body=v_response,resource_type='document',resource_id=v_grant.document_id,completed_at=now()
  where r.organization_id=v_grant.organization_id and r.actor_user_id=v_actor_id
    and r.route='FinalizeDocument' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.finalize_document(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finalize_document(uuid,uuid,text,text) to service_role;

-- ── claim_document_scan_jobs: the queue pop ──────────────────────────────────────────────────────
-- Claims due jobs with FOR UPDATE SKIP LOCKED so N concurrent workers never scan the same object, and
-- advances the version to 'scanning' in the SAME transaction, so the version's visible state and the
-- job's state can never disagree. A version that is no longer scannable (already rejected, cleaned by
-- an earlier run, deleted) is left untouched by the guard on the second update.
create or replace function public.claim_document_scan_jobs(
  p_limit integer,
  p_worker_run_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jobs jsonb;
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode='23514',message='INVALID_SCAN_BATCH_SIZE';
  end if;
  if p_worker_run_id is null or length(trim(p_worker_run_id)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_WORKER_RUN_ID';
  end if;

  with due as (
    select j.id
    from private.document_scan_jobs j
    where j.status = 'queued'
      and j.available_at <= now()
    order by j.available_at, j.created_at
    limit p_limit
    for update skip locked
  ),
  claimed as (
    update private.document_scan_jobs j
    set status = 'scanning',
        attempts = j.attempts + 1,
        claimed_at = now(),
        worker_run_id = p_worker_run_id
    from due d
    where j.id = d.id
    returning j.id, j.organization_id, j.document_version_id, j.storage_bucket, j.storage_path,
              j.expected_sha256_hex, j.attempts, j.max_attempts
  ),
  marked as (
    update public.document_versions dv
    set upload_status = 'scanning'
    from claimed c
    where dv.id = c.document_version_id
      and dv.upload_status = 'quarantined'
    returning dv.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'documentScanJobId', c.id,
    'organizationId', c.organization_id,
    'documentVersionId', c.document_version_id,
    'storageBucket', c.storage_bucket,
    'storagePath', c.storage_path,
    'expectedSha256Hex', c.expected_sha256_hex,
    'attempt', c.attempts,
    'maxAttempts', c.max_attempts
  ) order by c.id), '[]'::jsonb)
  into v_jobs
  from claimed c;

  return jsonb_build_object(
    'workerRunId', p_worker_run_id,
    'claimed', jsonb_array_length(v_jobs),
    'jobs', v_jobs
  );
end;
$$;
revoke all on function public.claim_document_scan_jobs(integer,text) from public,anon,authenticated;
grant execute on function public.claim_document_scan_jobs(integer,text) to service_role;

-- ── complete_document_scan: apply a provider verdict ─────────────────────────────────────────────
-- The only path that can ever move a version to 'clean'. Before applying anything it re-proves that the
-- bytes the scanner actually read are the bytes this version claims: the observed digest must equal BOTH
-- the digest recorded on the job at enqueue time AND the digest on the live version row, and the object
-- coordinates must still match. A stale verdict, a replayed verdict from another version, or a verdict
-- for an object that was swapped underneath therefore cannot clean anything.
create or replace function public.complete_document_scan(
  p_document_scan_job_id uuid,
  p_verdict text,
  p_observed_sha256_hex text,
  p_provider_code text,
  p_provider_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.document_scan_jobs%rowtype;
  v_version public.document_versions%rowtype;
  v_observed text := lower(coalesce(p_observed_sha256_hex,''));
  v_provider text := nullif(trim(coalesce(p_provider_code,'')),'');
  v_reference text := left(nullif(trim(coalesce(p_provider_reference,'')),''), 200);
  v_upload_status text;
  v_rejected_reason text;
begin
  if p_verdict is null or p_verdict not in ('clean','infected') then
    raise exception using errcode='23514',message='INVALID_SCAN_VERDICT';
  end if;
  if v_observed !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='23514',message='INVALID_CHECKSUM';
  end if;
  if v_provider is null or length(v_provider) not between 2 and 100 then
    raise exception using errcode='23514',message='SCAN_PROVIDER_REQUIRED';
  end if;

  select * into v_job from private.document_scan_jobs j where j.id = p_document_scan_job_id for update;
  if not found then raise exception using errcode='P0002',message='DOCUMENT_SCAN_JOB_NOT_FOUND'; end if;
  -- Idempotent: a worker that retried only its own bookkeeping sees the stored outcome, and a verdict
  -- that disagrees with the recorded one is a conflict rather than a silent overwrite.
  if v_job.status = 'succeeded' then
    if v_job.verdict <> p_verdict then
      raise exception using errcode='23505',message='SCAN_VERDICT_CONFLICT';
    end if;
    return jsonb_build_object(
      'documentScanJobId',v_job.id,'documentVersionId',v_job.document_version_id,
      'verdict',v_job.verdict,'uploadStatus',case when v_job.verdict='clean' then 'clean' else 'rejected' end,
      'duplicate',true
    );
  end if;
  if v_job.status <> 'scanning' then
    raise exception using errcode='23514',message='DOCUMENT_SCAN_JOB_NOT_CLAIMED';
  end if;

  if v_observed <> v_job.expected_sha256_hex then
    raise exception using errcode='23514',message='SCAN_TARGET_MISMATCH';
  end if;

  select * into v_version from public.document_versions dv where dv.id = v_job.document_version_id for update;
  if not found then raise exception using errcode='P0002',message='DOCUMENT_VERSION_NOT_FOUND'; end if;
  if lower(v_version.sha256_hex) <> v_observed
     or v_version.storage_bucket <> v_job.storage_bucket
     or v_version.storage_path <> v_job.storage_path
     or v_version.organization_id <> v_job.organization_id then
    raise exception using errcode='23514',message='SCAN_TARGET_MISMATCH';
  end if;
  -- A version already outside the scan window is never re-decided. In particular a 'rejected' version
  -- can never be talked back into 'clean' by a later verdict.
  if v_version.upload_status not in ('quarantined','scanning') then
    raise exception using errcode='23514',message='DOCUMENT_VERSION_NOT_SCANNABLE';
  end if;

  if p_verdict = 'clean' then
    v_upload_status := 'clean';
    v_rejected_reason := null;
  else
    v_upload_status := 'rejected';
    v_rejected_reason := left('MALWARE_DETECTED:' || coalesce(v_reference,'unreferenced'), 500);
  end if;

  update public.document_versions
  set upload_status = v_upload_status,
      malware_scan_provider = v_provider,
      malware_scan_reference = v_reference,
      malware_scanned_at = now(),
      rejected_reason = v_rejected_reason
  where id = v_job.document_version_id;

  update private.document_scan_jobs
  set status='succeeded', verdict=p_verdict, completed_at=now(),
      provider_code=v_provider, provider_reference=v_reference, last_error=null
  where id = v_job.id;

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
  ) values (
    v_job.organization_id,null,'system','document.scanned','document_version',v_job.document_version_id,gen_random_uuid(),
    jsonb_build_object('documentScanJobId',v_job.id,'verdict',p_verdict,'uploadStatus',v_upload_status,
      'providerCode',v_provider,'providerReference',v_reference,'attempt',v_job.attempts)
  );
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (
    v_job.organization_id,'document.scanned','document_version',v_job.document_version_id,gen_random_uuid(),
    jsonb_build_object('documentVersionId',v_job.document_version_id,'verdict',p_verdict,'uploadStatus',v_upload_status)
  );

  return jsonb_build_object(
    'documentScanJobId',v_job.id,'documentVersionId',v_job.document_version_id,
    'verdict',p_verdict,'uploadStatus',v_upload_status,'duplicate',false
  );
end;
$$;
revoke all on function public.complete_document_scan(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_document_scan(uuid,text,text,text,text) to service_role;

-- ── fail_document_scan: the scan attempt itself failed ───────────────────────────────────────────
-- A transport/provider failure is NOT a verdict. The version always falls back to 'quarantined', so a
-- failing scanner can only ever keep a document unusable — never make one usable.
create or replace function public.fail_document_scan(
  p_document_scan_job_id uuid,
  p_error_code text,
  p_retryable boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.document_scan_jobs%rowtype;
  v_error text := left(coalesce(nullif(trim(coalesce(p_error_code,'')),''),'UNKNOWN_SCAN_ERROR'), 500);
  v_retryable boolean := coalesce(p_retryable, true);
  v_next_status text;
  v_available_at timestamptz;
begin
  select * into v_job from private.document_scan_jobs j where j.id = p_document_scan_job_id for update;
  if not found then raise exception using errcode='P0002',message='DOCUMENT_SCAN_JOB_NOT_FOUND'; end if;
  if v_job.status = 'dead_letter' then
    return jsonb_build_object('documentScanJobId',v_job.id,'status','dead_letter','duplicate',true);
  end if;
  if v_job.status <> 'scanning' then
    raise exception using errcode='23514',message='DOCUMENT_SCAN_JOB_NOT_CLAIMED';
  end if;

  if not v_retryable or v_job.attempts >= v_job.max_attempts then
    v_next_status := 'dead_letter';
    v_available_at := v_job.available_at;
  else
    v_next_status := 'queued';
    v_available_at := now() + private.scan_retry_delay(v_job.attempts);
  end if;

  update private.document_scan_jobs
  set status=v_next_status, last_error=v_error, available_at=v_available_at, claimed_at=null
  where id = v_job.id;

  -- Only unwind the claim's own 'scanning' marker; a version that reached a terminal state by another
  -- path is left alone.
  update public.document_versions
  set upload_status='quarantined'
  where id = v_job.document_version_id and upload_status='scanning';

  if v_next_status = 'dead_letter' then
    insert into audit.audit_events(
      organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
    ) values (
      v_job.organization_id,null,'system','document.scanDeadLettered','document_version',v_job.document_version_id,gen_random_uuid(),
      jsonb_build_object('documentScanJobId',v_job.id,'attempts',v_job.attempts,'errorCode',v_error,'retryable',v_retryable)
    );
  end if;

  return jsonb_build_object(
    'documentScanJobId',v_job.id,'status',v_next_status,'duplicate',false,
    'attempts',v_job.attempts,'availableAt',v_available_at
  );
end;
$$;
revoke all on function public.fail_document_scan(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.fail_document_scan(uuid,text,boolean) to service_role;

-- ── requeue_stalled_document_scans: a worker died mid-scan ───────────────────────────────────────
-- Without this a crashed worker's claims sit in 'scanning' forever and the documents stay unusable.
create or replace function public.requeue_stalled_document_scans(p_stall_minutes integer)
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

  with stalled as (
    select j.id, j.attempts, j.max_attempts
    from private.document_scan_jobs j
    where j.status = 'scanning'
      and j.claimed_at is not null
      and j.claimed_at <= now() - make_interval(mins => p_stall_minutes)
    for update skip locked
  ),
  swept as (
    update private.document_scan_jobs j
    set status = case when s.attempts >= s.max_attempts then 'dead_letter' else 'queued' end,
        last_error = 'WORKER_STALLED',
        claimed_at = null,
        available_at = case when s.attempts >= s.max_attempts then j.available_at
                            else now() + private.scan_retry_delay(s.attempts) end
    from stalled s
    where j.id = s.id
    returning j.id, j.status, j.organization_id, j.document_version_id, j.attempts
  ),
  unmarked as (
    update public.document_versions dv
    set upload_status='quarantined'
    from swept w
    where dv.id = w.document_version_id and dv.upload_status='scanning'
    returning dv.id
  ),
  audited as (
    insert into audit.audit_events(
      organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
    )
    select w.organization_id,null,'system','document.scanDeadLettered','document_version',w.document_version_id,gen_random_uuid(),
      jsonb_build_object('documentScanJobId',w.id,'attempts',w.attempts,'errorCode','WORKER_STALLED')
    from swept w
    where w.status = 'dead_letter'
    returning 1
  )
  select
    count(*) filter (where w.status = 'queued'),
    count(*) filter (where w.status = 'dead_letter')
  into v_requeued, v_dead
  from swept w;

  return jsonb_build_object('requeued',v_requeued,'deadLettered',v_dead,'stallMinutes',p_stall_minutes);
end;
$$;
revoke all on function public.requeue_stalled_document_scans(integer) from public,anon,authenticated;
grant execute on function public.requeue_stalled_document_scans(integer) to service_role;

-- Backfill: versions already parked in quarantined/scanning with no job would otherwise never be
-- scannable, since their finalize ran before this lifecycle existed.
insert into private.document_scan_jobs(organization_id,document_version_id,storage_bucket,storage_path,expected_sha256_hex)
select dv.organization_id, dv.id, dv.storage_bucket, dv.storage_path, lower(dv.sha256_hex)
from public.document_versions dv
where dv.upload_status in ('quarantined','scanning')
on conflict (document_version_id) do nothing;

commit;
