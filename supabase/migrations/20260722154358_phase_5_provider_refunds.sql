begin;

alter table public.payment_refunds
  add constraint payment_refunds_provider_id_format
  check (provider_refund_id is null or provider_refund_id ~ '^re_[A-Za-z0-9]+$');
create index payment_refunds_created_by_idx on public.payment_refunds(created_by) where created_by is not null;

create or replace function public.request_provider_refund(
  p_payment_id uuid,
  p_amount_minor bigint,
  p_reason text,
  p_expected_status text,
  p_expected_version integer,
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
  v_property public.properties%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_previous private.idempotency_records%rowtype;
  v_refundable_minor bigint;
  v_request_hash text;
  v_refund_id uuid := gen_random_uuid();
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_amount_minor is null or p_amount_minor not between 1 and 9007199254740991 then
    raise exception using errcode='22003',message='INVALID_REFUND_AMOUNT';
  end if;
  if length(trim(coalesce(p_reason,''))) not between 3 and 1000 then
    raise exception using errcode='23514',message='REFUND_REASON_REQUIRED';
  end if;
  if p_expected_status is null or length(trim(p_expected_status)) not between 1 and 40 then
    raise exception using errcode='23514',message='EXPECTED_STATUS_REQUIRED';
  end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception using errcode='23514',message='EXPECTED_VERSION_REQUIRED';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;

  select p.* into v_payment from public.payments p where p.id=p_payment_id;
  if not found then raise exception using errcode='P0002',message='PAYMENT_NOT_FOUND'; end if;
  select p.* into strict v_property from public.properties p
  join public.tenancies t on t.property_id=p.id where t.id=v_payment.tenancy_id;
  if not private.has_property_access(v_property.id,'finance.manage') then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  if v_payment.payment_source<>'provider' then
    raise exception using errcode='23514',message='MANUAL_PAYMENT_REQUIRES_CORRECTION';
  end if;

  v_actor_scope := 'user:'||v_actor_id::text;
  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'paymentId',p_payment_id,'amountMinor',p_amount_minor,'reason',trim(p_reason),
    'expectedStatus',p_expected_status,'expectedVersion',p_expected_version
  )::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',v_payment.organization_id,v_actor_scope,'RefundPayment',trim(p_idempotency_key)
  ),0));
  select r.* into v_previous from private.idempotency_records r
  where r.organization_id=v_payment.organization_id and r.actor_scope=v_actor_scope
    and r.route='RefundPayment' and r.idempotency_key=trim(p_idempotency_key)
  for update;
  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    return v_previous.response_body;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('provider-refund-payment|'||v_payment.id::text,0));
  select p.* into strict v_payment from public.payments p where p.id=p_payment_id for update;
  if v_payment.status::text<>p_expected_status then
    raise exception using errcode='40001',message='PAYMENT_STATUS_CONFLICT';
  end if;
  if v_payment.version<>p_expected_version then
    raise exception using errcode='40001',message='PAYMENT_VERSION_CONFLICT';
  end if;
  if v_payment.status not in ('succeeded','partially_refunded') then
    raise exception using errcode='23514',message='PAYMENT_NOT_REFUNDABLE';
  end if;
  select a.* into v_attempt from public.payment_attempts a
  where a.payment_id=v_payment.id and a.organization_id=v_payment.organization_id
    and a.provider_status='succeeded' and a.provider_charge_id is not null
  order by a.confirmed_at desc nulls last,a.initiated_at desc limit 1;
  if not found then raise exception using errcode='23514',message='PROVIDER_PAYMENT_REFERENCE_MISSING'; end if;

  select v_payment.amount_minor-coalesce(sum(r.amount_minor),0) into v_refundable_minor
  from public.payment_refunds r
  where r.payment_id=v_payment.id and r.status not in ('failed','canceled');
  v_refundable_minor := coalesce(v_refundable_minor,v_payment.amount_minor);
  if p_amount_minor>v_refundable_minor then
    raise exception using errcode='23514',message='PAYMENT_OVERREFUNDED';
  end if;

  v_response := jsonb_build_object(
    'paymentId',v_payment.id,'refundId',v_refund_id,'refundStatus','requested',
    'paymentStatus',v_payment.status,'correctiveJournalTransactionId',null
  );
  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,request_hash,response_status,response_body,
    resource_type,resource_id,expires_at
  ) values (
    v_payment.organization_id,v_actor_id,v_actor_scope,'RefundPayment',trim(p_idempotency_key),v_request_hash,202,v_response,
    'payment_refund',v_refund_id,now()+interval '24 hours'
  );
  insert into public.payment_refunds(
    id,organization_id,payment_id,amount_minor,currency_code,reason,status,created_by
  ) values (
    v_refund_id,v_payment.organization_id,v_payment.id,p_amount_minor,v_payment.currency_code,trim(p_reason),'requested',v_actor_id
  );
  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,reason,after_data
  ) values (
    v_payment.organization_id,v_actor_id,'user','payment.refund_requested','payment_refund',v_refund_id,v_correlation_id,trim(p_reason),
    jsonb_build_object('paymentId',v_payment.id,'refundId',v_refund_id,'amountMinor',p_amount_minor,
      'currencyCode',v_payment.currency_code,'status','requested','paymentVersion',v_payment.version)
  );
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (
    v_payment.organization_id,'payment.refund_requested','payment_refund',v_refund_id,v_correlation_id,
    jsonb_build_object('paymentId',v_payment.id,'refundId',v_refund_id,'amountMinor',p_amount_minor,
      'currencyCode',v_payment.currency_code,'status','requested')
  );
  return v_response;
end;
$$;
revoke all on function public.request_provider_refund(uuid,bigint,text,text,integer,text) from public,anon;
grant execute on function public.request_provider_refund(uuid,bigint,text,text,integer,text) to authenticated;

create or replace function public.get_provider_refund_context(p_refund_id uuid,p_actor_user_id uuid)
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
    'refundId',r.id,'paymentId',p.id,'organizationId',p.organization_id,
    'amountMinor',r.amount_minor,'currencyCode',r.currency_code,'reason',r.reason,
    'providerConnectionId',a.provider_connection_id,'providerAccountId',a.provider_event_account_id,
    'providerChargeId',a.provider_charge_id,'providerRefundId',r.provider_refund_id,
    'idempotencyKey','crecy-provider-refund:'||r.id::text
  ) into v_result
  from public.payment_refunds r
  join public.payments p on p.id=r.payment_id and p.organization_id=r.organization_id
  join public.payment_attempts a on a.payment_id=p.id and a.organization_id=p.organization_id
  join public.provider_connections c on c.id=a.provider_connection_id and c.organization_id=p.organization_id
  where r.id=p_refund_id and r.created_by=p_actor_user_id and r.status in ('requested','pending')
    and p.payment_source='provider' and a.provider_status='succeeded' and a.provider_charge_id is not null
    and c.provider_code='stripe' and c.provider_account_id=a.provider_event_account_id
  order by a.confirmed_at desc nulls last,a.initiated_at desc limit 1;
  if v_result is null then raise exception using errcode='P0002',message='PROVIDER_REFUND_CONTEXT_NOT_FOUND'; end if;
  return v_result;
end;
$$;
revoke all on function public.get_provider_refund_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_provider_refund_context(uuid,uuid) to service_role;

create or replace function public.complete_provider_refund(
  p_refund_id uuid,
  p_provider_refund_id text,
  p_provider_status text,
  p_failure_code text,
  p_failure_detail text,
  p_provider_created_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.payment_refunds%rowtype;
  v_payment public.payments%rowtype;
  v_tenancy public.tenancies%rowtype;
  v_property public.properties%rowtype;
  v_allocation public.payment_allocations%rowtype;
  v_refund_remaining bigint;
  v_refund_slice bigint;
  v_succeeded_refunds bigint;
  v_new_payment_status public.payment_status;
  v_clearing_account_id uuid;
  v_ar_account_id uuid;
  v_corrective_journal_id uuid;
  v_affected_charge_ids uuid[] := '{}'::uuid[];
  v_correlation_id uuid := gen_random_uuid();
  v_completed_at timestamptz := coalesce(p_provider_created_at,now());
  v_response jsonb;
begin
  if p_refund_id is null or p_provider_status not in ('pending','succeeded','failed')
    or (p_provider_refund_id is not null and p_provider_refund_id !~ '^re_[A-Za-z0-9]+$')
    or (p_provider_status in ('pending','succeeded') and p_provider_refund_id is null)
    or (p_provider_status='failed' and length(coalesce(p_failure_code,'')) not between 1 and 160)
    or p_provider_created_at is null or p_provider_created_at>now()+interval '5 minutes' then
    raise exception using errcode='23514',message='INVALID_PROVIDER_REFUND_RESULT';
  end if;

  select r.* into v_refund from public.payment_refunds r where r.id=p_refund_id;
  if not found then raise exception using errcode='P0002',message='PAYMENT_REFUND_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended('provider-refund-payment|'||v_refund.payment_id::text,0));
  select p.* into strict v_payment from public.payments p where p.id=v_refund.payment_id for update;
  select r.* into strict v_refund from public.payment_refunds r where r.id=p_refund_id for update;

  if v_refund.provider_refund_id is not null and p_provider_refund_id is not null
    and v_refund.provider_refund_id<>p_provider_refund_id then
    raise exception using errcode='23505',message='PROVIDER_REFUND_MISMATCH';
  end if;
  if v_refund.status in ('succeeded','failed','canceled') then
    return jsonb_build_object(
      'paymentId',v_payment.id,'refundId',v_refund.id,'refundStatus',v_refund.status,
      'paymentStatus',v_payment.status,'correctiveJournalTransactionId',v_refund.corrective_journal_transaction_id
    );
  end if;
  if v_refund.status='pending' and p_provider_status='pending'
    and v_refund.provider_refund_id=p_provider_refund_id then
    return jsonb_build_object(
      'paymentId',v_payment.id,'refundId',v_refund.id,'refundStatus','pending',
      'paymentStatus',v_payment.status,'correctiveJournalTransactionId',null
    );
  end if;

  if p_provider_status='pending' then
    update public.payment_refunds set provider_refund_id=p_provider_refund_id,status='pending',version=version+1
    where id=v_refund.id;
    v_response := jsonb_build_object(
      'paymentId',v_payment.id,'refundId',v_refund.id,'refundStatus','pending',
      'paymentStatus',v_payment.status,'correctiveJournalTransactionId',null
    );
    update private.idempotency_records set response_status=202,response_body=v_response
    where organization_id=v_payment.organization_id and route='RefundPayment' and resource_id=v_refund.id;
    insert into audit.audit_events(
      organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,reason,after_data
    ) values (
      v_payment.organization_id,v_refund.created_by,'provider','payment.refund_pending','payment_refund',v_refund.id,
      v_correlation_id,v_refund.reason,jsonb_build_object('paymentId',v_payment.id,'refundId',v_refund.id,
        'providerRefundId',p_provider_refund_id,'amountMinor',v_refund.amount_minor,'status','pending')
    );
    return v_response;
  end if;

  if p_provider_status='failed' then
    update public.payment_refunds set
      provider_refund_id=coalesce(p_provider_refund_id,provider_refund_id),status='failed',
      failure_code=left(p_failure_code,160),failure_detail=left(nullif(p_failure_detail,''),1000),
      completed_at=v_completed_at,version=version+1
    where id=v_refund.id;
    v_response := jsonb_build_object(
      'paymentId',v_payment.id,'refundId',v_refund.id,'refundStatus','failed',
      'paymentStatus',v_payment.status,'correctiveJournalTransactionId',null,'failureCode',left(p_failure_code,160)
    );
    update private.idempotency_records set state='completed',response_status=422,response_body=v_response,completed_at=now()
    where organization_id=v_payment.organization_id and route='RefundPayment' and resource_id=v_refund.id;
    insert into audit.audit_events(
      organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,reason,after_data
    ) values (
      v_payment.organization_id,v_refund.created_by,'provider','payment.refund_failed','payment_refund',v_refund.id,
      v_correlation_id,v_refund.reason,jsonb_build_object('paymentId',v_payment.id,'refundId',v_refund.id,
        'providerRefundId',p_provider_refund_id,'amountMinor',v_refund.amount_minor,'status','failed','failureCode',left(p_failure_code,160))
    );
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (
      v_payment.organization_id,'payment.refund_failed','payment_refund',v_refund.id,v_correlation_id,
      jsonb_build_object('paymentId',v_payment.id,'refundId',v_refund.id,'amountMinor',v_refund.amount_minor,
        'status','failed','failureCode',left(p_failure_code,160))
    );
    return v_response;
  end if;

  if v_payment.status not in ('succeeded','partially_refunded') then
    raise exception using errcode='23514',message='PAYMENT_NOT_REFUNDABLE';
  end if;
  select t.* into strict v_tenancy from public.tenancies t where t.id=v_payment.tenancy_id;
  select p.* into strict v_property from public.properties p where p.id=v_tenancy.property_id;

  v_refund_remaining := v_refund.amount_minor;
  for v_allocation in
    select pa.* from public.payment_allocations pa
    join public.charges c on c.id=pa.charge_id
    where pa.payment_id=v_payment.id and pa.reversed_at is null
    order by c.due_date desc,pa.allocated_at desc,pa.id desc
    for update of pa
  loop
    exit when v_refund_remaining=0;
    v_refund_slice := least(v_refund_remaining,v_allocation.amount_minor);
    if not v_allocation.charge_id=any(v_affected_charge_ids) then
      v_affected_charge_ids := array_append(v_affected_charge_ids,v_allocation.charge_id);
    end if;
    update public.payment_allocations set
      reversed_at=v_completed_at,
      reversal_reason='Provider refund '||v_refund.id::text||': '||v_refund.reason
    where id=v_allocation.id;
    if v_allocation.amount_minor>v_refund_slice then
      insert into public.payment_allocations(
        organization_id,payment_id,charge_id,amount_minor,allocated_by
      ) values (
        v_allocation.organization_id,v_allocation.payment_id,v_allocation.charge_id,
        v_allocation.amount_minor-v_refund_slice,v_allocation.allocated_by
      );
    end if;
    v_refund_remaining := v_refund_remaining-v_refund_slice;
  end loop;
  if v_refund_remaining<>0 then
    raise exception using errcode='23514',message='REFUND_ALLOCATION_MISMATCH';
  end if;

  perform c.id from public.charges c where c.id=any(v_affected_charge_ids) order by c.id for update;
  update public.charges c set status=case
    when totals.allocated_minor=0 then 'open'::public.charge_status
    when totals.allocated_minor=c.amount_minor then 'paid'::public.charge_status
    else 'partially_paid'::public.charge_status end
  from (
    select affected.charge_id,coalesce(sum(pa.amount_minor) filter (where pa.reversed_at is null),0) as allocated_minor
    from unnest(v_affected_charge_ids) affected(charge_id)
    left join public.payment_allocations pa on pa.charge_id=affected.charge_id
    group by affected.charge_id
  ) totals where c.id=totals.charge_id;

  select e.ledger_account_id into v_clearing_account_id
  from public.journal_entries e join public.ledger_accounts a on a.id=e.ledger_account_id
  where e.journal_transaction_id=v_payment.journal_transaction_id and e.debit_minor>0
    and a.account_code<>'1100' and a.account_class='asset' and a.normal_balance='debit'
  order by e.id limit 1;
  if not found then raise exception using errcode='23514',message='ORIGINAL_PAYMENT_JOURNAL_INVALID'; end if;
  select a.id into v_ar_account_id from public.ledger_accounts a
  where a.accounting_book_id=v_payment.accounting_book_id and a.account_code='1100'
    and a.account_class='asset' and a.normal_balance='debit' and a.status='active';
  if not found then raise exception using errcode='23514',message='LEDGER_ACCOUNT_CONFLICT',detail='1100'; end if;

  v_corrective_journal_id := gen_random_uuid();
  insert into public.journal_transactions(
    id,organization_id,operating_entity_id,accounting_book_id,transaction_type,effective_date,source_type,source_id,
    idempotency_key,currency_code,correlation_id,created_by,metadata
  ) values (
    v_corrective_journal_id,v_payment.organization_id,v_payment.operating_entity_id,v_payment.accounting_book_id,
    'provider_refund',(v_completed_at at time zone v_property.time_zone)::date,'payment_refund',v_refund.id,
    'provider-refund:'||v_refund.id::text,v_payment.currency_code,v_correlation_id,v_refund.created_by,
    jsonb_build_object('paymentId',v_payment.id,'refundId',v_refund.id,'providerRefundId',p_provider_refund_id,
      'amountMinor',v_refund.amount_minor,'reason',v_refund.reason)
  );
  insert into public.journal_entries(
    journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,debit_minor,
    property_id,unit_id,tenancy_id,receivable_account_id,memo
  ) values (
    v_corrective_journal_id,v_payment.organization_id,v_payment.accounting_book_id,v_ar_account_id,v_refund.amount_minor,
    v_property.id,v_tenancy.unit_id,v_tenancy.id,v_payment.receivable_account_id,'Resident receivable reopened for provider refund'
  );
  insert into public.journal_entries(
    journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,credit_minor,
    property_id,unit_id,tenancy_id,receivable_account_id,memo
  ) values (
    v_corrective_journal_id,v_payment.organization_id,v_payment.accounting_book_id,v_clearing_account_id,v_refund.amount_minor,
    v_property.id,v_tenancy.unit_id,v_tenancy.id,v_payment.receivable_account_id,'Stripe direct-charge refund'
  );

  update public.payment_refunds set
    provider_refund_id=p_provider_refund_id,status='succeeded',corrective_journal_transaction_id=v_corrective_journal_id,
    failure_code=null,failure_detail=null,completed_at=v_completed_at,version=version+1
  where id=v_refund.id;
  select coalesce(sum(r.amount_minor),0) into v_succeeded_refunds
  from public.payment_refunds r where r.payment_id=v_payment.id and r.status='succeeded';
  v_new_payment_status := case when v_succeeded_refunds=v_payment.amount_minor
    then 'refunded'::public.payment_status else 'partially_refunded'::public.payment_status end;
  update public.payments set status=v_new_payment_status,version=version+1 where id=v_payment.id;

  v_response := jsonb_build_object(
    'paymentId',v_payment.id,'refundId',v_refund.id,'refundStatus','succeeded',
    'paymentStatus',v_new_payment_status,'correctiveJournalTransactionId',v_corrective_journal_id
  );
  update private.idempotency_records set
    state='completed',response_status=200,response_body=v_response,completed_at=now()
  where organization_id=v_payment.organization_id and route='RefundPayment' and resource_id=v_refund.id;
  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,reason,after_data
  ) values (
    v_payment.organization_id,v_refund.created_by,'provider','payment.refunded','payment_refund',v_refund.id,
    v_correlation_id,v_refund.reason,jsonb_build_object('paymentId',v_payment.id,'refundId',v_refund.id,
      'providerRefundId',p_provider_refund_id,'amountMinor',v_refund.amount_minor,'status','succeeded',
      'paymentStatus',v_new_payment_status,'paymentVersion',v_payment.version+1,
      'correctiveJournalTransactionId',v_corrective_journal_id)
  );
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (
    v_payment.organization_id,'payment.refunded','payment',v_payment.id,v_correlation_id,
    jsonb_build_object('paymentId',v_payment.id,'refundId',v_refund.id,'providerRefundId',p_provider_refund_id,
      'amountMinor',v_refund.amount_minor,'paymentStatus',v_new_payment_status,
      'correctiveJournalTransactionId',v_corrective_journal_id)
  );
  return v_response;
end;
$$;
revoke all on function public.complete_provider_refund(uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.complete_provider_refund(uuid,text,text,text,text,timestamptz) to service_role;

create or replace function public.process_stripe_refund_webhook(
  p_provider_event_id text,
  p_provider_account_id text,
  p_payload_sha256 text,
  p_event_type text,
  p_provider_created_at timestamptz,
  p_livemode boolean,
  p_event_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event private.provider_webhook_events%rowtype;
  v_connection public.provider_connections%rowtype;
  v_refund public.payment_refunds%rowtype;
  v_payment public.payments%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_event_insert_count integer := 0;
  v_provider_refund_id text;
  v_provider_status text;
  v_amount_minor bigint;
  v_currency_code char(3);
  v_completion jsonb;
begin
  if p_provider_event_id is null or p_provider_event_id !~ '^evt_[A-Za-z0-9]+$'
    or p_provider_account_id is null or p_provider_account_id !~ '^acct_[A-Za-z0-9]+$'
    or p_payload_sha256 is null or p_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_event_type not in ('refund.created','refund.updated','refund.failed')
    or p_provider_created_at is null or p_provider_created_at>now()+interval '5 minutes'
    or p_livemode is null or jsonb_typeof(p_event_data)<>'object' then
    raise exception using errcode='23514',message='INVALID_PROVIDER_REFUND_EVENT';
  end if;

  insert into private.provider_webhook_events(
    provider_code,provider_event_id,provider_account_id,payload_sha256,event_type,livemode,provider_created_at
  ) values (
    'stripe',p_provider_event_id,p_provider_account_id,p_payload_sha256,p_event_type,p_livemode,p_provider_created_at
  ) on conflict (provider_code,provider_account_id,provider_event_id) do nothing;
  get diagnostics v_event_insert_count = row_count;
  select e.* into strict v_event from private.provider_webhook_events e
  where e.provider_code='stripe' and e.provider_account_id=p_provider_account_id and e.provider_event_id=p_provider_event_id
  for update;
  if v_event.payload_sha256<>p_payload_sha256 or v_event.event_type<>p_event_type
    or v_event.provider_created_at<>p_provider_created_at or v_event.livemode<>p_livemode then
    update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),attempts=attempts+1,
      last_error_code='EVENT_REPLAY_MISMATCH',last_error_detail='A provider event ID was replayed with different signed content.'
    where id=v_event.id;
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','EVENT_REPLAY_MISMATCH');
  end if;
  if v_event_insert_count=0 and v_event.processing_state in ('processed','ignored') then
    return jsonb_build_object('outcome','duplicate','eventId',p_provider_event_id,'processingState',v_event.processing_state);
  end if;
  update private.provider_webhook_events set
    processing_state='processing',attempts=attempts+1,last_error_code=null,last_error_detail=null
  where id=v_event.id;

  select c.* into v_connection from public.provider_connections c
  where c.provider_code='stripe' and c.provider_account_id=p_provider_account_id;
  if not found then
    update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
      last_error_code='PROVIDER_ACCOUNT_MISMATCH',last_error_detail='The signed connected account is not registered in Crecy.'
    where id=v_event.id;
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','PROVIDER_ACCOUNT_MISMATCH');
  end if;
  update private.provider_webhook_events set provider_connection_id=v_connection.id,organization_id=v_connection.organization_id
  where id=v_event.id;

  v_provider_refund_id := nullif(p_event_data->>'providerRefundId','');
  v_provider_status := case
    when p_event_type='refund.failed' then 'failed'
    when p_event_data->>'providerStatus' in ('succeeded','failed') then p_event_data->>'providerStatus'
    else 'pending' end;
  if v_provider_refund_id is null or v_provider_refund_id !~ '^re_[A-Za-z0-9]+$'
    or coalesce(p_event_data->>'refundId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(p_event_data->>'amountMinor','') !~ '^[1-9][0-9]*$'
    or coalesce(p_event_data->>'currencyCode','') !~ '^[A-Z]{3}$' then
    update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
      last_error_code='INVALID_PROVIDER_REFUND_OBJECT',last_error_detail='The signed refund event is missing canonical identifiers, amount, or currency.'
    where id=v_event.id;
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','INVALID_PROVIDER_REFUND_OBJECT');
  end if;

  select r.* into v_refund from public.payment_refunds r where r.id=(p_event_data->>'refundId')::uuid;
  if not found then
    update private.provider_webhook_events set processing_state='failed',processed_at=now(),
      last_error_code='PAYMENT_REFUND_NOT_FOUND',last_error_detail='The signed provider refund is not yet registered in Crecy.'
    where id=v_event.id;
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','PAYMENT_REFUND_NOT_FOUND');
  end if;
  select p.* into strict v_payment from public.payments p where p.id=v_refund.payment_id;
  select a.* into v_attempt from public.payment_attempts a
  where a.payment_id=v_payment.id and a.provider_connection_id=v_connection.id and a.provider_status='succeeded'
  order by a.confirmed_at desc nulls last,a.initiated_at desc limit 1;
  v_amount_minor := (p_event_data->>'amountMinor')::bigint;
  v_currency_code := (p_event_data->>'currencyCode')::char(3);
  if not found or v_refund.organization_id<>v_connection.organization_id
    or coalesce(p_event_data->>'organizationId','')<>v_payment.organization_id::text
    or coalesce(p_event_data->>'paymentId','')<>v_payment.id::text
    or v_amount_minor<>v_refund.amount_minor or v_currency_code<>v_refund.currency_code
    or (v_refund.provider_refund_id is not null and v_refund.provider_refund_id<>v_provider_refund_id) then
    update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
      last_error_code='PROVIDER_REFUND_METADATA_MISMATCH',last_error_detail='Signed refund metadata does not match the canonical payment scope or value.'
    where id=v_event.id;
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','PROVIDER_REFUND_METADATA_MISMATCH');
  end if;
  if v_refund.status in ('succeeded','failed','canceled') then
    update private.provider_webhook_events set processing_state='ignored',processed_at=now() where id=v_event.id;
    return jsonb_build_object('outcome','ignored','eventId',p_provider_event_id,'refundId',v_refund.id,'refundStatus',v_refund.status);
  end if;

  v_completion := public.complete_provider_refund(
    v_refund.id,v_provider_refund_id,v_provider_status,
    case when v_provider_status='failed' then coalesce(nullif(p_event_data->>'failureCode',''),'provider_refund_failed') else null end,
    nullif(p_event_data->>'failureDetail',''),p_provider_created_at
  );
  update private.provider_webhook_events set processing_state='processed',processed_at=now() where id=v_event.id;
  return jsonb_build_object('outcome','processed','eventId',p_provider_event_id,'refundId',v_refund.id,
    'refundStatus',v_completion->>'refundStatus','paymentId',v_payment.id,'paymentStatus',v_completion->>'paymentStatus');
exception
  when numeric_value_out_of_range or invalid_text_representation then
    raise exception using errcode='23514',message='INVALID_PROVIDER_REFUND_EVENT_DATA';
end;
$$;
revoke all on function public.process_stripe_refund_webhook(text,text,text,text,timestamptz,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.process_stripe_refund_webhook(text,text,text,text,timestamptz,boolean,jsonb) to service_role;

create or replace function public.get_payment_refund_eligibility(p_payment_id uuid)
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
    'canRefund',private.has_property_access(t.property_id,'finance.manage')
      and p.payment_source='provider' and p.status in ('succeeded','partially_refunded')
      and p.amount_minor-coalesce(refunds.reserved_minor,0)>0
      and exists(select 1 from public.payment_attempts a where a.payment_id=p.id and a.provider_status='succeeded' and a.provider_charge_id is not null),
    'refundableMinor',greatest(p.amount_minor-coalesce(refunds.reserved_minor,0),0),
    'refunds',coalesce((select jsonb_agg(jsonb_build_object(
      'refundId',r.id,'amountMinor',r.amount_minor,'status',r.status,'reason',r.reason,
      'requestedAt',r.requested_at,'completedAt',r.completed_at,
      'correctiveJournalTransactionId',r.corrective_journal_transaction_id,'failureCode',r.failure_code
    ) order by r.requested_at) from public.payment_refunds r where r.payment_id=p.id),'[]'::jsonb)
  ) into v_result
  from public.payments p join public.tenancies t on t.id=p.tenancy_id
  left join lateral (
    select sum(r.amount_minor) as reserved_minor from public.payment_refunds r
    where r.payment_id=p.id and r.status not in ('failed','canceled')
  ) refunds on true
  where p.id=p_payment_id and (
    private.has_property_access(t.property_id,'finance.read')
    or private.has_property_access(t.property_id,'finance.manage')
    or private.is_resident_for_tenancy(t.id)
  );
  if v_result is null then raise exception using errcode='P0002',message='PAYMENT_NOT_FOUND'; end if;
  return v_result;
end;
$$;
revoke all on function public.get_payment_refund_eligibility(uuid) from public,anon;
grant execute on function public.get_payment_refund_eligibility(uuid) to authenticated;

commit;
