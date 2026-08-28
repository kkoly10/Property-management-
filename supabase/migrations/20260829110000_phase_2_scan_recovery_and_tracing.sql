-- v4.2 Batch A.1 — dead-letter recovery for document scans, and one correlation ID per state change.
--
-- (6) A DEAD-LETTERED SCAN LEFT ITS DOCUMENT QUARANTINED FOREVER.
--     A1 built the retry ladder correctly: a scan that keeps failing backs off, then dead-letters, and
--     the version falls back to 'quarantined' so a broken scanner can never release a document. What
--     it did not build was the way OUT. A relay outage that outlasts five attempts left every document
--     uploaded during it permanently unusable, with a manual SQL edit as the only escape — which is
--     exactly what A1 set out to abolish.
--
--     retry_document_scan returns a dead-lettered job to a claimable state, with a fresh attempt
--     budget, an actor, a reason, and an audit row. What it does NOT do is make the document usable:
--     the version stays quarantined until a real clean verdict arrives through
--     complete_document_scan. Recovery re-opens the question; it never answers it.
--
-- (7) ONE STATE CHANGE WAS WRITING TWO CORRELATION IDS.
--     complete_document_scan called gen_random_uuid() separately for its audit row and its outbox
--     event, so the two halves of a single scan verdict could not be joined in a trace. Every command
--     in this codebase shares one v_correlation_id across its audit and outbox writes; this one had
--     silently broken that convention. Fixed here, and the remaining scan trace sites are given named
--     correlation ids so the next writer inherits the convention rather than the defect.
--
-- Authority: no table, no policy. Counts unchanged.
begin;

-- ── (7) complete_document_scan: one correlation id across the whole state change ─────────────────
-- Identical to the shipped body except that the correlation id is generated ONCE and reused.
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
  v_correlation_id uuid := gen_random_uuid();
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

  -- ONE correlation id for both halves of this state change. Previously these were two independent
  -- gen_random_uuid() calls, so a scan verdict could not be joined across audit and outbox.
  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
  ) values (
    v_job.organization_id,null,'system','document.scanned','document_version',v_job.document_version_id,v_correlation_id,
    jsonb_build_object('documentScanJobId',v_job.id,'verdict',p_verdict,'uploadStatus',v_upload_status,
      'providerCode',v_provider,'providerReference',v_reference,'attempt',v_job.attempts)
  );
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (
    v_job.organization_id,'document.scanned','document_version',v_job.document_version_id,v_correlation_id,
    jsonb_build_object('documentVersionId',v_job.document_version_id,'verdict',p_verdict,'uploadStatus',v_upload_status)
  );

  return jsonb_build_object(
    'documentScanJobId',v_job.id,'documentVersionId',v_job.document_version_id,
    'verdict',p_verdict,'uploadStatus',v_upload_status,'duplicate',false,
    'correlationId',v_correlation_id
  );
end;
$$;
revoke all on function public.complete_document_scan(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_document_scan(uuid,text,text,text,text) to service_role;

-- ── (6) retry_document_scan: the audited way out of a dead letter ────────────────────────────────
-- Deliberately narrow. It re-opens the scan question and nothing else:
--
--   * only a dead-lettered job can be retried — this is not a way to re-decide a finished scan;
--   * the version must still be quarantined, so a rejected document can never be laundered back
--     into the queue and a clean one is never re-litigated;
--   * the attempt budget is reset explicitly, because the point of a retry is that the CAUSE was
--     external (a relay outage) and the previous attempts told us nothing about the object;
--   * the document stays quarantined. Recovery makes the job claimable; only a real clean verdict
--     through complete_document_scan makes the document usable.
--
-- Authorization is the operator's own document permission on the parent organization, so residents,
-- vendors and unrelated users cannot touch scan state; a reason is required because a human is
-- overriding an automated decision and the next person needs to know why.
create or replace function public.retry_document_scan(
  p_organization_id uuid,
  p_document_scan_job_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_job private.document_scan_jobs%rowtype;
  v_version public.document_versions%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
  v_property_id uuid;
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if v_reason is null or length(v_reason) not between 8 and 500 then
    raise exception using errcode='23514',message='SCAN_RETRY_REASON_REQUIRED';
  end if;

  select * into v_job from private.document_scan_jobs j
  where j.id = p_document_scan_job_id and j.organization_id = p_organization_id
  for update;
  if not found then raise exception using errcode='P0002',message='DOCUMENT_SCAN_JOB_NOT_FOUND'; end if;

  select * into v_version from public.document_versions dv where dv.id = v_job.document_version_id;
  if not found then raise exception using errcode='P0002',message='DOCUMENT_VERSION_NOT_FOUND'; end if;

  -- Authorized against the DOCUMENT'S OWN parent scope, not merely organization membership: a
  -- property-scoped coordinator may recover a scan for a property they hold and no other. An
  -- organization-level document (an import source, say) needs the org-wide documents permission.
  select d.property_id into v_property_id
  from public.documents d
  where d.id = v_version.document_id and d.organization_id = v_job.organization_id;

  if v_property_id is not null then
    if not private.has_property_access(v_property_id, 'documents.manage') then
      raise exception using errcode='42501',message='DOCUMENT_SCOPE_DENIED';
    end if;
  elsif not private.has_unscoped_org_permission(v_job.organization_id, 'documents.manage') then
    raise exception using errcode='42501',message='DOCUMENT_SCOPE_DENIED';
  end if;

  v_request_hash := encode(sha256(convert_to(concat_ws('|',p_document_scan_job_id,v_reason),'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='RetryDocumentScan' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  -- These two guards depend on this command's own side effects, so they run AFTER the idempotency
  -- short-circuit: a successful replay must not fail merely because the first call already requeued.
  if v_job.status <> 'dead_letter' then
    raise exception using errcode='23514',message='DOCUMENT_SCAN_JOB_NOT_DEAD_LETTERED';
  end if;
  if v_version.upload_status <> 'quarantined' then
    raise exception using errcode='23514',message='DOCUMENT_VERSION_NOT_SCANNABLE';
  end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (p_organization_id,v_actor_id,'RetryDocumentScan',p_idempotency_key,v_request_hash,now()+interval '24 hours');

  update private.document_scan_jobs
  set status='queued',
      -- Reset, not incremented: the retry exists because the failures were about the SCANNER, not
      -- about this object, so the object deserves a full budget to be judged on.
      attempts=0,
      available_at=now(),
      claimed_at=null,
      worker_run_id=null,
      last_error=null
  where id = v_job.id;

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,reason,before_data,after_data
  ) values (
    v_job.organization_id,v_actor_id,'user','document.scanRetried','document_version',v_job.document_version_id,v_correlation_id,v_reason,
    jsonb_build_object('status','dead_letter','attempts',v_job.attempts,'lastError',v_job.last_error),
    jsonb_build_object('documentScanJobId',v_job.id,'status','queued','attempts',0)
  );
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (
    v_job.organization_id,'document.scanRetried','document_version',v_job.document_version_id,v_correlation_id,
    jsonb_build_object('documentScanJobId',v_job.id,'documentVersionId',v_job.document_version_id,'reason',v_reason)
  );

  v_response := jsonb_build_object(
    'documentScanJobId',v_job.id,'documentVersionId',v_job.document_version_id,
    'status','queued','uploadStatus',v_version.upload_status,'correlationId',v_correlation_id
  );
  update private.idempotency_records r
  set state='completed',response_status=200,response_body=v_response,resource_type='document_version',resource_id=v_job.document_version_id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='RetryDocumentScan' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.retry_document_scan(uuid,uuid,text,text) from public,anon;
grant execute on function public.retry_document_scan(uuid,uuid,text,text) to authenticated;

commit;
