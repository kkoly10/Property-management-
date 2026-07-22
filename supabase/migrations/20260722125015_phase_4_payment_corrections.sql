begin;

alter table public.payments
  add column version integer not null default 1 check (version > 0);

create index payments_status_version_idx
  on public.payments(status,version)
  where status in ('succeeded','partially_refunded');

create or replace function private.enforce_payment_immutable_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.operating_entity_id is distinct from old.operating_entity_id
    or new.accounting_book_id is distinct from old.accounting_book_id
    or new.receivable_account_id is distinct from old.receivable_account_id
    or new.tenancy_id is distinct from old.tenancy_id
    or new.public_reference is distinct from old.public_reference
    or new.payment_source is distinct from old.payment_source
    or new.amount_minor is distinct from old.amount_minor
    or new.currency_code is distinct from old.currency_code
    or new.received_at is distinct from old.received_at
    or new.journal_transaction_id is distinct from old.journal_transaction_id
    or new.receipt_document_id is distinct from old.receipt_document_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception using errcode='55000',message='PAYMENT_FINANCIAL_FIELDS_IMMUTABLE';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_payment_immutable_fields() from public,anon,authenticated,service_role;
create trigger payments_immutable_fields
before update on public.payments
for each row execute function private.enforce_payment_immutable_fields();

create or replace function private.enforce_payment_allocation_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op='DELETE' then
    raise exception using errcode='55000',message='PAYMENT_ALLOCATION_APPEND_ONLY';
  end if;
  if new.organization_id is distinct from old.organization_id
    or new.payment_id is distinct from old.payment_id
    or new.charge_id is distinct from old.charge_id
    or new.amount_minor is distinct from old.amount_minor
    or new.allocated_at is distinct from old.allocated_at
    or new.allocated_by is distinct from old.allocated_by
    or old.reversed_at is not null
    or new.reversed_at is null
    or length(trim(coalesce(new.reversal_reason,'')))<3 then
    raise exception using errcode='55000',message='PAYMENT_ALLOCATION_APPEND_ONLY';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_payment_allocation_lifecycle() from public,anon,authenticated,service_role;
create trigger payment_allocations_append_only
before update or delete on public.payment_allocations
for each row execute function private.enforce_payment_allocation_lifecycle();

create or replace function public.reverse_or_correct_payment(
  p_payment_id uuid,
  p_correction_type text,
  p_reason text,
  p_expected_status text,
  p_expected_version integer,
  p_replacement_allocations jsonb,
  p_metadata_correction jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_scope text;
  v_payment public.payments%rowtype;
  v_tenancy public.tenancies%rowtype;
  v_property public.properties%rowtype;
  v_previous private.idempotency_records%rowtype;
  v_request_hash text;
  v_canonical_allocations jsonb;
  v_allocation_count integer;
  v_allocation_sum bigint;
  v_before_allocations jsonb;
  v_after_allocations jsonb;
  v_affected_charge_ids uuid[];
  v_ar_account_id uuid;
  v_cash_account_id uuid;
  v_corrective_journal_id uuid;
  v_correlation_id uuid := gen_random_uuid();
  v_new_status public.payment_status;
  v_new_version integer;
  v_corrected_at timestamptz := now();
  v_response jsonb;
  v_allocation record;
  v_new_manual_reason text;
  v_new_external_reference text;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_correction_type not in ('return','reversal','allocation_correction','metadata_correction') then
    raise exception using errcode='23514',message='INVALID_CORRECTION_TYPE';
  end if;
  if length(trim(coalesce(p_reason,''))) not between 3 and 1000 then
    raise exception using errcode='23514',message='CORRECTION_REASON_REQUIRED';
  end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception using errcode='23514',message='EXPECTED_VERSION_REQUIRED';
  end if;
  if p_expected_status is null or length(trim(p_expected_status)) not between 1 and 40 then
    raise exception using errcode='23514',message='EXPECTED_STATUS_REQUIRED';
  end if;

  select p.* into v_payment from public.payments p where p.id=p_payment_id;
  if not found then raise exception using errcode='P0002',message='PAYMENT_NOT_FOUND'; end if;
  select t.* into v_tenancy from public.tenancies t
  where t.id=v_payment.tenancy_id and t.organization_id=v_payment.organization_id;
  select p.* into v_property from public.properties p
  where p.id=v_tenancy.property_id and p.organization_id=v_payment.organization_id;
  if not private.has_property_access(v_property.id,'finance.manage') then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  if v_payment.payment_source='provider' then
    raise exception using errcode='23514',message='PROVIDER_PAYMENT_REQUIRES_REFUND_WORKFLOW';
  end if;

  if p_correction_type='allocation_correction' then
    if jsonb_typeof(p_replacement_allocations)<>'array'
      or jsonb_array_length(p_replacement_allocations) not between 1 and 100 then
      raise exception using errcode='23514',message='INVALID_REPLACEMENT_ALLOCATIONS';
    end if;
    if exists(
      select 1 from jsonb_array_elements(p_replacement_allocations) a
      where jsonb_typeof(a)<>'object' or coalesce(a->>'chargeId','')=''
        or coalesce(a->>'amountMinor','') !~ '^[1-9][0-9]*$'
        or (a->>'amountMinor')::numeric>9007199254740991
    ) then raise exception using errcode='23514',message='INVALID_REPLACEMENT_ALLOCATIONS'; end if;
    begin
      select jsonb_agg(jsonb_build_object('chargeId',x.charge_id,'amountMinor',x.amount_minor) order by x.charge_id),count(*),sum(x.amount_minor)
      into v_canonical_allocations,v_allocation_count,v_allocation_sum
      from (
        select (a->>'chargeId')::uuid as charge_id,(a->>'amountMinor')::bigint as amount_minor
        from jsonb_array_elements(p_replacement_allocations) a
      ) x;
    exception when invalid_text_representation then
      raise exception using errcode='22P02',message='INVALID_ALLOCATION_CHARGE_ID';
    end;
    if (select count(distinct (a->>'chargeId')::uuid) from jsonb_array_elements(p_replacement_allocations) a)<>v_allocation_count then
      raise exception using errcode='23505',message='DUPLICATE_ALLOCATION_CHARGE';
    end if;
    if v_allocation_sum<>v_payment.amount_minor then
      raise exception using errcode='23514',message='ALLOCATION_TOTAL_MISMATCH';
    end if;
  elsif p_replacement_allocations is not null then
    raise exception using errcode='23514',message='REPLACEMENT_ALLOCATIONS_NOT_ALLOWED';
  end if;

  if p_correction_type='metadata_correction' then
    if jsonb_typeof(p_metadata_correction)<>'object'
      or not (p_metadata_correction ? 'manualReason' or p_metadata_correction ? 'externalReference')
      or exists(select 1 from jsonb_object_keys(p_metadata_correction) k where k not in ('manualReason','externalReference')) then
      raise exception using errcode='23514',message='INVALID_METADATA_CORRECTION';
    end if;
    v_new_manual_reason := case when p_metadata_correction ? 'manualReason' then nullif(trim(p_metadata_correction->>'manualReason'),'') else v_payment.manual_reason end;
    v_new_external_reference := case when p_metadata_correction ? 'externalReference' then nullif(trim(p_metadata_correction->>'externalReference'),'') else v_payment.manual_external_reference end;
    if v_new_manual_reason is null or length(v_new_manual_reason) not between 3 and 1000
      or (v_new_external_reference is not null and length(v_new_external_reference)>160) then
      raise exception using errcode='23514',message='INVALID_METADATA_CORRECTION';
    end if;
    if v_new_external_reference is not null and exists(
      select 1 from public.payments p where p.organization_id=v_payment.organization_id and p.id<>v_payment.id
        and p.payment_source=v_payment.payment_source and lower(p.manual_external_reference)=lower(v_new_external_reference)
    ) then raise exception using errcode='23505',message='DUPLICATE_EXTERNAL_REFERENCE'; end if;
  elsif p_metadata_correction is not null then
    raise exception using errcode='23514',message='METADATA_CORRECTION_NOT_ALLOWED';
  end if;

  v_actor_scope := 'user:'||v_actor_id::text;
  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'paymentId',p_payment_id,'correctionType',p_correction_type,'reason',trim(p_reason),
    'expectedStatus',p_expected_status,'expectedVersion',p_expected_version,
    'replacementAllocations',v_canonical_allocations,'metadataCorrection',p_metadata_correction
  )::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',v_payment.organization_id,v_actor_scope,'ReverseOrCorrectPayment',trim(p_idempotency_key)),0));
  select * into v_previous from private.idempotency_records r
  where r.organization_id=v_payment.organization_id and r.actor_scope=v_actor_scope
    and r.route='ReverseOrCorrectPayment' and r.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  select p.* into v_payment from public.payments p where p.id=p_payment_id for update;
  if v_payment.status::text<>p_expected_status then raise exception using errcode='40001',message='PAYMENT_STATUS_CONFLICT'; end if;
  if v_payment.version<>p_expected_version then raise exception using errcode='40001',message='PAYMENT_VERSION_CONFLICT'; end if;
  if v_payment.status<>'succeeded' then
    raise exception using errcode='23514',message='PAYMENT_NOT_CORRECTABLE';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'allocationId',pa.id,'chargeId',pa.charge_id,'amountMinor',pa.amount_minor
  ) order by pa.charge_id,pa.allocated_at),'[]'::jsonb)
  into v_before_allocations from public.payment_allocations pa
  where pa.payment_id=v_payment.id and pa.reversed_at is null;

  if p_correction_type='allocation_correction' then
    perform c.id from public.charges c
    join jsonb_to_recordset(v_canonical_allocations) a("chargeId" uuid,"amountMinor" bigint) on a."chargeId"=c.id
    order by c.id for update;
    if (
      select count(*) from public.charges c
      join jsonb_to_recordset(v_canonical_allocations) a("chargeId" uuid,"amountMinor" bigint) on a."chargeId"=c.id
      where c.organization_id=v_payment.organization_id and c.tenancy_id=v_payment.tenancy_id
        and c.accounting_book_id=v_payment.accounting_book_id and c.receivable_account_id=v_payment.receivable_account_id
        and c.currency_code=v_payment.currency_code and c.status in ('open','partially_paid','paid')
    )<>v_allocation_count then raise exception using errcode='23514',message='ALLOCATION_CHARGE_NOT_AVAILABLE'; end if;
    if exists(
      select 1 from jsonb_to_recordset(v_canonical_allocations) a("chargeId" uuid,"amountMinor" bigint)
      join public.charges c on c.id=a."chargeId"
      left join lateral (
        select coalesce(sum(pa.amount_minor),0) as allocated_minor
        from public.payment_allocations pa
        where pa.charge_id=c.id and pa.payment_id<>v_payment.id and pa.reversed_at is null
      ) totals on true
      where a."amountMinor">c.amount_minor-totals.allocated_minor
    ) then raise exception using errcode='23514',message='CHARGE_OVERALLOCATED'; end if;
  end if;

  select coalesce(array_agg(distinct charge_id),'{}'::uuid[]) into v_affected_charge_ids
  from (
    select pa.charge_id from public.payment_allocations pa where pa.payment_id=v_payment.id and pa.reversed_at is null
    union all
    select a."chargeId" from jsonb_to_recordset(coalesce(v_canonical_allocations,'[]'::jsonb)) a("chargeId" uuid,"amountMinor" bigint)
  ) affected;

  insert into private.idempotency_records(organization_id,actor_user_id,actor_scope,route,idempotency_key,request_hash,expires_at)
  values (v_payment.organization_id,v_actor_id,v_actor_scope,'ReverseOrCorrectPayment',trim(p_idempotency_key),v_request_hash,now()+interval '24 hours');

  if p_correction_type in ('return','reversal','allocation_correction') then
    update public.payment_allocations pa
    set reversed_at=v_corrected_at,reversal_reason=trim(p_reason)
    where pa.payment_id=v_payment.id and pa.reversed_at is null;
  end if;
  if p_correction_type='allocation_correction' then
    for v_allocation in
      select a."chargeId" as charge_id,a."amountMinor" as amount_minor
      from jsonb_to_recordset(v_canonical_allocations) a("chargeId" uuid,"amountMinor" bigint)
      order by a."chargeId"
    loop
      insert into public.payment_allocations(organization_id,payment_id,charge_id,amount_minor,allocated_by)
      values (v_payment.organization_id,v_payment.id,v_allocation.charge_id,v_allocation.amount_minor,v_actor_id);
    end loop;
  end if;

  if p_correction_type in ('return','reversal','allocation_correction') then
    update public.charges c set status=case
      when totals.allocated_minor=0 then 'open'::public.charge_status
      when totals.allocated_minor=c.amount_minor then 'paid'::public.charge_status
      else 'partially_paid'::public.charge_status end
    from (
      select affected.charge_id,coalesce(sum(pa.amount_minor) filter (where pa.reversed_at is null),0) as allocated_minor
      from unnest(v_affected_charge_ids) affected(charge_id)
      left join public.payment_allocations pa on pa.charge_id=affected.charge_id
      group by affected.charge_id
    ) totals
    where c.id=totals.charge_id and c.status in ('open','partially_paid','paid');
  end if;

  if p_correction_type in ('return','reversal','allocation_correction') then
    select a.id into v_ar_account_id from public.ledger_accounts a
    where a.accounting_book_id=v_payment.accounting_book_id and a.account_code='1100'
      and a.account_class='asset' and a.normal_balance='debit' and a.status='active';
    if not found then raise exception using errcode='23514',message='LEDGER_ACCOUNT_CONFLICT',detail='1100'; end if;
    if p_correction_type in ('return','reversal') then
      select e.ledger_account_id into v_cash_account_id
      from public.journal_entries e join public.ledger_accounts a on a.id=e.ledger_account_id
      where e.journal_transaction_id=v_payment.journal_transaction_id and e.debit_minor>0 and a.account_code<>'1100'
      order by e.id limit 1;
      if not found then raise exception using errcode='23514',message='ORIGINAL_PAYMENT_JOURNAL_INVALID'; end if;
    else
      v_cash_account_id := v_ar_account_id;
    end if;
    v_corrective_journal_id := gen_random_uuid();
    insert into public.journal_transactions(
      id,organization_id,operating_entity_id,accounting_book_id,transaction_type,effective_date,source_type,source_id,
      idempotency_key,currency_code,correlation_id,reversal_of_transaction_id,created_by,metadata
    ) values (
      v_corrective_journal_id,v_payment.organization_id,v_payment.operating_entity_id,v_payment.accounting_book_id,
      p_correction_type,(v_corrected_at at time zone v_property.time_zone)::date,'payment_correction',v_payment.id,
      'payment-correction:'||trim(p_idempotency_key),v_payment.currency_code,v_correlation_id,
      case when p_correction_type in ('return','reversal') then v_payment.journal_transaction_id else null end,
      v_actor_id,jsonb_build_object('correctionType',p_correction_type,'reason',trim(p_reason),'beforeAllocations',v_before_allocations,'replacementAllocations',v_canonical_allocations)
    );
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,debit_minor,
      property_id,unit_id,tenancy_id,receivable_account_id,memo
    ) values (
      v_corrective_journal_id,v_payment.organization_id,v_payment.accounting_book_id,v_ar_account_id,v_payment.amount_minor,
      v_property.id,v_tenancy.unit_id,v_tenancy.id,v_payment.receivable_account_id,
      case when p_correction_type='allocation_correction' then 'Allocation correction control entry' else 'Resident receivable reopened' end
    );
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,credit_minor,
      property_id,unit_id,tenancy_id,receivable_account_id,memo
    ) values (
      v_corrective_journal_id,v_payment.organization_id,v_payment.accounting_book_id,v_cash_account_id,v_payment.amount_minor,
      v_property.id,v_tenancy.unit_id,v_tenancy.id,v_payment.receivable_account_id,
      case when p_correction_type='allocation_correction' then 'Allocation correction control entry' else 'Manual payment economic effect reversed' end
    );
  end if;

  v_new_status := case p_correction_type
    when 'return' then 'returned'::public.payment_status
    when 'reversal' then 'reversed'::public.payment_status
    else v_payment.status end;
  v_new_version := v_payment.version+1;
  update public.payments p set
    status=v_new_status,
    version=v_new_version,
    manual_reason=case when p_correction_type='metadata_correction' then v_new_manual_reason else p.manual_reason end,
    manual_external_reference=case when p_correction_type='metadata_correction' then v_new_external_reference else p.manual_external_reference end
  where p.id=v_payment.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'allocationId',pa.id,'chargeId',pa.charge_id,'amountMinor',pa.amount_minor
  ) order by pa.charge_id,pa.allocated_at),'[]'::jsonb)
  into v_after_allocations from public.payment_allocations pa
  where pa.payment_id=v_payment.id and pa.reversed_at is null;

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,reason,before_data,after_data
  ) values (
    v_payment.organization_id,v_actor_id,'user','payment.corrected','payment',v_payment.id,v_correlation_id,trim(p_reason),
    jsonb_build_object('status',v_payment.status,'version',v_payment.version,'manualReason',v_payment.manual_reason,'externalReference',v_payment.manual_external_reference,'allocations',v_before_allocations),
    jsonb_build_object('correctionType',p_correction_type,'status',v_new_status,'version',v_new_version,'manualReason',case when p_correction_type='metadata_correction' then v_new_manual_reason else v_payment.manual_reason end,'externalReference',case when p_correction_type='metadata_correction' then v_new_external_reference else v_payment.manual_external_reference end,'allocations',v_after_allocations,'correctiveJournalTransactionId',v_corrective_journal_id,'correctedAt',v_corrected_at)
  );
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (v_payment.organization_id,'payment.corrected','payment',v_payment.id,v_correlation_id,jsonb_build_object(
    'paymentId',v_payment.id,'correctionType',p_correction_type,'paymentStatus',v_new_status,'version',v_new_version,
    'correctiveJournalTransactionId',v_corrective_journal_id,'correctedAt',v_corrected_at
  ));

  v_response := jsonb_build_object(
    'paymentId',v_payment.id,'correctionType',p_correction_type,'paymentStatus',v_new_status,'version',v_new_version,
    'correctiveJournalTransactionId',v_corrective_journal_id,'correctedAt',v_corrected_at
  );
  update private.idempotency_records r set state='completed',response_status=200,response_body=v_response,
    resource_type='payment',resource_id=v_payment.id,completed_at=now()
  where r.organization_id=v_payment.organization_id and r.actor_scope=v_actor_scope
    and r.route='ReverseOrCorrectPayment' and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;
revoke all on function public.reverse_or_correct_payment(uuid,text,text,text,integer,jsonb,jsonb,text) from public,anon;
grant execute on function public.reverse_or_correct_payment(uuid,text,text,text,integer,jsonb,jsonb,text) to authenticated;

create or replace function public.get_payment_detail(p_payment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'paymentId',pay.id,'organizationId',pay.organization_id,'publicReference',pay.public_reference,
    'propertyName',p.name,'unitCode',u.unit_code,'householdName',h.display_name,
    'source',pay.payment_source,'amountMinor',pay.amount_minor,'currencyCode',pay.currency_code,
    'status',pay.status,'version',pay.version,'reconciliationStatus',pay.reconciliation_status,
    'receivedAt',pay.received_at,'reason',pay.manual_reason,'externalReference',pay.manual_external_reference,
    'receiptDocumentId',pay.receipt_document_id,'journalTransactionId',pay.journal_transaction_id,
    'canCorrect',private.has_property_access(t.property_id,'finance.manage') and pay.payment_source<>'provider' and pay.status='succeeded',
    'allocations',coalesce((select jsonb_agg(jsonb_build_object(
      'allocationId',pa.id,'chargeId',c.id,'description',c.description,'dueDate',c.due_date,
      'amountMinor',pa.amount_minor,'allocatedAt',pa.allocated_at,'reversedAt',pa.reversed_at,'reversalReason',pa.reversal_reason
    ) order by pa.allocated_at,c.due_date) from public.payment_allocations pa join public.charges c on c.id=pa.charge_id
      where pa.payment_id=pay.id),'[]'::jsonb),
    'eligibleCharges',coalesce((select jsonb_agg(jsonb_build_object(
      'chargeId',c.id,'description',c.description,'dueDate',c.due_date,'amountMinor',c.amount_minor,
      'availableMinor',c.amount_minor-coalesce(other_allocations.allocated_minor,0)
    ) order by c.due_date,c.created_at) from public.charges c left join lateral (
      select sum(pa.amount_minor) as allocated_minor from public.payment_allocations pa
      where pa.charge_id=c.id and pa.payment_id<>pay.id and pa.reversed_at is null
    ) other_allocations on true where c.tenancy_id=pay.tenancy_id and c.organization_id=pay.organization_id
      and c.status in ('open','partially_paid','paid')),'[]'::jsonb),
    'refunds',coalesce((select jsonb_agg(jsonb_build_object(
      'refundId',r.id,'amountMinor',r.amount_minor,'status',r.status,'reason',r.reason,'requestedAt',r.requested_at,'completedAt',r.completed_at
    ) order by r.requested_at) from public.payment_refunds r where r.payment_id=pay.id),'[]'::jsonb),
    'corrections',coalesce((select jsonb_agg(jsonb_build_object(
      'correctionId',a.id,'correctionType',a.after_data->>'correctionType','reason',a.reason,
      'paymentStatus',a.after_data->>'status','version',(a.after_data->>'version')::integer,
      'correctiveJournalTransactionId',a.after_data->>'correctiveJournalTransactionId','correctedAt',a.occurred_at
    ) order by a.occurred_at) from audit.audit_events a
      where a.organization_id=pay.organization_id and a.resource_type='payment' and a.resource_id=pay.id and a.action_code='payment.corrected'),'[]'::jsonb)
  ) into v_result
  from public.payments pay join public.tenancies t on t.id=pay.tenancy_id
  join public.properties p on p.id=t.property_id join public.units u on u.id=t.unit_id join public.households h on h.id=t.household_id
  where pay.id=p_payment_id and (
    private.has_property_access(t.property_id,'finance.read')
    or private.has_property_access(t.property_id,'finance.manage')
    or private.is_resident_for_tenancy(t.id)
  );
  if v_result is null then raise exception using errcode='P0002',message='PAYMENT_NOT_FOUND'; end if;
  return v_result;
end;
$$;
revoke all on function public.get_payment_detail(uuid) from public,anon;
grant execute on function public.get_payment_detail(uuid) to authenticated;

create or replace function public.get_payment_receipt(p_document_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'documentId',pay.receipt_document_id,'paymentId',pay.id,'publicReference',pay.public_reference,
    'organizationName',o.display_name,'propertyName',p.name,'unitCode',u.unit_code,'householdName',h.display_name,
    'source',pay.payment_source,'amountMinor',pay.amount_minor,'currencyCode',pay.currency_code,'status',pay.status,
    'reconciliationStatus',pay.reconciliation_status,'receivedAt',pay.received_at,'reason',pay.manual_reason,
    'externalReference',pay.manual_external_reference,'generatedAt',d.created_at,
    'allocations',coalesce((select jsonb_agg(jsonb_build_object(
      'chargeId',c.id,'description',c.description,'dueDate',c.due_date,'amountMinor',pa.amount_minor
    ) order by c.due_date,c.created_at) from public.payment_allocations pa join public.charges c on c.id=pa.charge_id
      where pa.payment_id=pay.id and pa.reversed_at is null),'[]'::jsonb)
  ) into v_result
  from public.payments pay join public.documents d on d.id=pay.receipt_document_id
  join public.organizations o on o.id=pay.organization_id join public.tenancies t on t.id=pay.tenancy_id
  join public.properties p on p.id=t.property_id join public.units u on u.id=t.unit_id join public.households h on h.id=t.household_id
  where pay.receipt_document_id=p_document_id
    and (private.has_property_access(t.property_id,'finance.read') or private.has_property_access(t.property_id,'finance.manage') or private.is_resident_for_tenancy(t.id));
  if v_result is null then raise exception using errcode='P0002',message='RECEIPT_NOT_FOUND'; end if;
  return v_result;
end;
$$;
revoke all on function public.get_payment_receipt(uuid) from public,anon;
grant execute on function public.get_payment_receipt(uuid) to authenticated;

commit;
