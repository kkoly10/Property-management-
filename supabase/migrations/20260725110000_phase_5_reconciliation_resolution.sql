-- Phase 5: resolve a settlement reconciliation exception (resolve / waive / escalate).
-- Closes the delivery-plan Phase 5 exit criterion "a settlement mismatch cannot be silently
-- closed": exceptions were created by the settlement + webhook paths but had no audited write
-- path to close them. This command mirrors the existing finance commands (record_manual_payment):
-- org-level finance.manage gate, idempotent, one durable audit + outbox trail per resolution.
--
-- Resolve/waive are terminal and require an evidence note; escalate re-prioritizes an open
-- exception (staying in the operator's open queue) and its evidence note is optional. When the
-- last open/escalated exception on a batch is resolved/waived, the batch leaves its 'exception'
-- state; it cannot become 'reconciled' (that requires the settlement journal the webhook posts),
-- so it returns to 'unreconciled'. Payment reconciliation_status is intentionally NOT re-derived
-- here: a payment can also be flagged 'exception' by an open dispute, so clearing it from the
-- reconciliation side alone could hide an active dispute.
begin;

create or replace function public.resolve_reconciliation_exception(
  p_organization_id uuid,
  p_reconciliation_exception_id uuid,
  p_resolution text,
  p_evidence text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_exception public.reconciliation_exceptions%rowtype;
  v_previous_status text;
  v_evidence text := nullif(trim(coalesce(p_evidence,'')),'');
  v_resolved_at timestamptz := case when p_resolution in ('resolved','waived') then now() else null end;
  v_event_type text;
  v_batch_cleared boolean := false;
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_resolution is null or p_resolution not in ('resolved','waived','escalated') then
    raise exception using errcode='23514',message='INVALID_RESOLUTION';
  end if;
  if p_resolution in ('resolved','waived') and v_evidence is null then
    raise exception using errcode='23514',message='RESOLUTION_EVIDENCE_REQUIRED';
  end if;
  if v_evidence is not null and length(v_evidence) not between 8 and 1000 then
    raise exception using errcode='22001',message='RESOLUTION_EVIDENCE_INVALID';
  end if;

  select * into v_exception from public.reconciliation_exceptions e
  where e.id=p_reconciliation_exception_id and e.organization_id=p_organization_id for update;
  if not found then raise exception using errcode='P0002',message='RECONCILIATION_EXCEPTION_NOT_FOUND'; end if;
  v_previous_status := v_exception.status;
  if not private.has_org_permission(p_organization_id,'finance.manage') then
    raise exception using errcode='42501',message='FINANCE_SCOPE_DENIED';
  end if;

  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'organizationId',p_organization_id,'reconciliationExceptionId',p_reconciliation_exception_id,
    'resolution',p_resolution,'evidence',v_evidence
  )::text,'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='ResolveReconciliationException' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  -- State guards run AFTER the idempotency short-circuit so a legitimate replay returns the stored
  -- response instead of tripping the terminal guard on the row this same call already transitioned.
  if v_previous_status in ('resolved','waived') then
    raise exception using errcode='23514',message='EXCEPTION_ALREADY_RESOLVED';
  end if;
  if p_resolution='escalated' and v_previous_status='escalated' then
    raise exception using errcode='23514',message='EXCEPTION_ALREADY_ESCALATED';
  end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (p_organization_id,v_actor_id,'ResolveReconciliationException',p_idempotency_key,v_request_hash,now()+interval '24 hours');

  update public.reconciliation_exceptions set
    status=p_resolution,
    resolved_at=v_resolved_at,
    resolved_by=case when p_resolution in ('resolved','waived') then v_actor_id else null end,
    resolution_evidence=v_evidence
  where id=p_reconciliation_exception_id and organization_id=p_organization_id;

  if p_resolution in ('resolved','waived') then
    -- Lock the batch before the "is this the last open exception?" check so two operators clearing
    -- the final two exceptions of one batch concurrently cannot each miss the other's update and
    -- leave the batch stuck in 'exception' with nothing open. The later committer re-evaluates
    -- against committed rows and clears it.
    perform 1 from public.settlement_batches b
    where b.id=v_exception.settlement_batch_id and b.organization_id=p_organization_id for update;
    if not exists (
      select 1 from public.reconciliation_exceptions e
      where e.settlement_batch_id=v_exception.settlement_batch_id and e.status in ('open','escalated')
    ) then
      update public.settlement_batches set reconciliation_status='unreconciled'
      where id=v_exception.settlement_batch_id and organization_id=p_organization_id and reconciliation_status='exception';
      v_batch_cleared := found;
    end if;
  end if;

  v_event_type := case when p_resolution='escalated' then 'reconciliation.exception_escalated' else 'reconciliation.exception_resolved' end;
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,reason,before_data,after_data)
  values (p_organization_id,v_actor_id,'user',v_event_type,'reconciliation_exception',p_reconciliation_exception_id,v_correlation_id,p_resolution,
    jsonb_build_object('status',v_previous_status),
    jsonb_build_object('status',p_resolution,'resolution',p_resolution,'resolutionEvidence',v_evidence,
      'settlementId',v_exception.settlement_batch_id,'paymentId',v_exception.payment_id,
      'exceptionType',v_exception.exception_type,'batchCleared',v_batch_cleared));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (p_organization_id,v_event_type,'reconciliation_exception',p_reconciliation_exception_id,v_correlation_id,
    jsonb_build_object('reconciliationExceptionId',p_reconciliation_exception_id,'resolution',p_resolution,
      'settlementId',v_exception.settlement_batch_id,'paymentId',v_exception.payment_id,
      'exceptionType',v_exception.exception_type,'batchCleared',v_batch_cleared));

  v_response := jsonb_build_object(
    'reconciliationExceptionId',p_reconciliation_exception_id,'status',p_resolution,'resolution',p_resolution,
    'settlementBatchId',v_exception.settlement_batch_id,'resolvedAt',v_resolved_at,'batchCleared',v_batch_cleared
  );
  update private.idempotency_records r set state='completed',response_status=200,response_body=v_response,
    resource_type='reconciliation_exception',resource_id=p_reconciliation_exception_id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='ResolveReconciliationException' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.resolve_reconciliation_exception(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.resolve_reconciliation_exception(uuid,uuid,text,text,text) to authenticated;

-- Surface the owning organization on each exception so the operator resolve control can target the
-- command. Otherwise identical to the shipped workspace query (still open/escalated only, so
-- resolved and waived exceptions drop off the queue automatically).
create or replace function public.get_settlement_reconciliation_workspace()
returns jsonb
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select jsonb_build_object(
    'batches',coalesce((select jsonb_agg(jsonb_build_object(
      'settlementId',b.id,'publicReference',b.public_reference,'providerStatus',b.provider_status,
      'reconciliationStatus',b.reconciliation_status,'grossMinor',b.gross_minor,'feeMinor',b.fee_minor,
      'netMinor',b.net_minor,'currencyCode',b.currency_code,'expectedArrivalDate',b.expected_arrival_date,
      'receivedAt',b.received_at,'itemCount',(select count(*) from public.settlement_items i where i.settlement_batch_id=b.id),
      'matchedCount',(select count(*) from public.settlement_items i where i.settlement_batch_id=b.id and i.payment_id is not null)
    ) order by coalesce(b.received_at,b.provider_created_at) desc,b.id desc)
    from public.settlement_batches b where private.has_org_permission(b.organization_id,'finance.manage')),'[]'::jsonb),
    'exceptions',coalesce((select jsonb_agg(jsonb_build_object(
      'exceptionId',e.id,'organizationId',e.organization_id,'settlementId',e.settlement_batch_id,'settlementReference',b.public_reference,
      'paymentId',e.payment_id,'paymentReference',p.public_reference,'exceptionType',e.exception_type,
      'status',e.status,'expectedMinor',e.expected_minor,'actualMinor',e.actual_minor,
      'currencyCode',e.currency_code,'detail',e.detail,'detectedAt',e.detected_at
    ) order by e.detected_at desc,e.id desc)
    from public.reconciliation_exceptions e
    join public.settlement_batches b on b.id=e.settlement_batch_id
    left join public.payments p on p.id=e.payment_id
    where private.has_org_permission(e.organization_id,'finance.manage') and e.status in ('open','escalated')),'[]'::jsonb)
  );
$$;
revoke all on function public.get_settlement_reconciliation_workspace() from public,anon;
grant execute on function public.get_settlement_reconciliation_workspace() to authenticated;

commit;
