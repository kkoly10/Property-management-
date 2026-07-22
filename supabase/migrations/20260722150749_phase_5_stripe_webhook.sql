begin;

create table private.provider_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null,
  provider_event_id text not null,
  provider_account_id text not null,
  provider_connection_id uuid references public.provider_connections(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  event_type text not null,
  livemode boolean not null,
  provider_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  processing_state text not null default 'received'
    check (processing_state in ('received','processing','processed','ignored','failed','dead_letter')),
  processed_at timestamptz,
  attempts integer not null default 0 check (attempts>=0),
  last_error_code text,
  last_error_detail text,
  unique (provider_code,provider_account_id,provider_event_id),
  check (provider_code='stripe'),
  check (provider_event_id ~ '^evt_[A-Za-z0-9]+$'),
  check (provider_account_id ~ '^acct_[A-Za-z0-9]+$'),
  check (length(event_type) between 3 and 160),
  check (processed_at is null or processed_at>=received_at)
);
create index provider_webhook_pending_idx
  on private.provider_webhook_events(received_at)
  where processing_state in ('received','failed');
create index provider_webhook_connection_created_idx
  on private.provider_webhook_events(provider_connection_id,provider_created_at desc)
  where provider_connection_id is not null;

revoke all on private.provider_webhook_events from public,anon,authenticated,service_role;

create or replace function private.enforce_payment_immutable_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_provider_confirmation boolean :=
    old.payment_source='provider'
    and old.status in ('created','pending','failed')
    and new.status='succeeded'
    and old.received_at is null and new.received_at is not null
    and old.journal_transaction_id is null and new.journal_transaction_id is not null
    and old.receipt_document_id is null and new.receipt_document_id is not null;
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
    or (new.received_at is distinct from old.received_at and not v_provider_confirmation)
    or (new.journal_transaction_id is distinct from old.journal_transaction_id and not v_provider_confirmation)
    or (new.receipt_document_id is distinct from old.receipt_document_id and not v_provider_confirmation)
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception using errcode='55000',message='PAYMENT_FINANCIAL_FIELDS_IMMUTABLE';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_payment_immutable_fields() from public,anon,authenticated,service_role;

create or replace function public.process_stripe_webhook(
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
  v_attempt public.payment_attempts%rowtype;
  v_payment public.payments%rowtype;
  v_tenancy public.tenancies%rowtype;
  v_property public.properties%rowtype;
  v_receipt_document_id uuid;
  v_journal_transaction_id uuid;
  v_clearing_account_id uuid;
  v_ar_account_id uuid;
  v_correlation_id uuid := gen_random_uuid();
  v_event_insert_count integer := 0;
  v_allocation_count integer;
  v_allocation_sum bigint;
  v_allocation record;
  v_amount_minor bigint;
  v_currency_code char(3);
  v_payment_intent_id text;
  v_checkout_session_id text;
  v_charge_id text;
  v_failure_code text;
  v_result jsonb;
begin
  if p_provider_event_id is null or p_provider_event_id !~ '^evt_[A-Za-z0-9]+$'
    or p_provider_account_id is null or p_provider_account_id !~ '^acct_[A-Za-z0-9]+$'
    or p_payload_sha256 is null or p_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_event_type is null or length(p_event_type) not between 3 and 160
    or p_provider_created_at is null or p_provider_created_at>now()+interval '5 minutes'
    or p_livemode is null or jsonb_typeof(p_event_data)<>'object' then
    raise exception using errcode='23514',message='INVALID_PROVIDER_EVENT';
  end if;

  insert into private.provider_webhook_events(
    provider_code,provider_event_id,provider_account_id,payload_sha256,event_type,livemode,provider_created_at
  ) values (
    'stripe',p_provider_event_id,p_provider_account_id,p_payload_sha256,p_event_type,p_livemode,p_provider_created_at
  ) on conflict (provider_code,provider_account_id,provider_event_id) do nothing;
  get diagnostics v_event_insert_count = row_count;

  select e.* into strict v_event
  from private.provider_webhook_events e
  where e.provider_code='stripe' and e.provider_account_id=p_provider_account_id and e.provider_event_id=p_provider_event_id
  for update;

  if v_event.payload_sha256<>p_payload_sha256 or v_event.event_type<>p_event_type
    or v_event.provider_created_at<>p_provider_created_at or v_event.livemode<>p_livemode then
    update private.provider_webhook_events set
      processing_state='dead_letter',processed_at=now(),attempts=attempts+1,
      last_error_code='EVENT_REPLAY_MISMATCH',last_error_detail='A provider event ID was replayed with different signed content.'
    where id=v_event.id;
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','EVENT_REPLAY_MISMATCH');
  end if;
  if v_event_insert_count=0 and v_event.processing_state in ('processed','ignored') then
    return jsonb_build_object('outcome','duplicate','eventId',p_provider_event_id,'processingState',v_event.processing_state);
  end if;
  if v_event.processing_state='dead_letter' then
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode',coalesce(v_event.last_error_code,'EVENT_DEAD_LETTER'));
  end if;

  update private.provider_webhook_events set
    processing_state='processing',attempts=attempts+1,last_error_code=null,last_error_detail=null
  where id=v_event.id;

  select c.* into v_connection
  from public.provider_connections c
  where c.provider_code='stripe' and c.provider_account_id=p_provider_account_id;
  if not found then
    update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
      last_error_code='PROVIDER_ACCOUNT_MISMATCH',last_error_detail='The signed connected account is not registered in Crecy.'
    where id=v_event.id;
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','PROVIDER_ACCOUNT_MISMATCH');
  end if;
  update private.provider_webhook_events set
    provider_connection_id=v_connection.id,organization_id=v_connection.organization_id
  where id=v_event.id;

  if p_event_type not in (
    'payment_intent.processing','payment_intent.succeeded','payment_intent.payment_failed','checkout.session.expired'
  ) then
    update private.provider_webhook_events set processing_state='ignored',processed_at=now() where id=v_event.id;
    return jsonb_build_object('outcome','ignored','eventId',p_provider_event_id,'eventType',p_event_type);
  end if;

  v_payment_intent_id := nullif(p_event_data->>'paymentIntentId','');
  v_checkout_session_id := nullif(p_event_data->>'checkoutSessionId','');
  v_charge_id := nullif(p_event_data->>'chargeId','');
  v_failure_code := left(nullif(p_event_data->>'failureCode',''),160);
  if (v_payment_intent_id is not null and v_payment_intent_id !~ '^pi_[A-Za-z0-9]+$')
    or (v_checkout_session_id is not null and v_checkout_session_id !~ '^cs_(test_|live_)?[A-Za-z0-9]+$')
    or (v_charge_id is not null and v_charge_id !~ '^ch_[A-Za-z0-9]+$')
    or (p_event_type<>'checkout.session.expired' and v_payment_intent_id is null) then
    update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
      last_error_code='INVALID_PROVIDER_OBJECT',last_error_detail='The signed event contains malformed provider object identifiers.'
    where id=v_event.id;
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','INVALID_PROVIDER_OBJECT');
  end if;

  if p_event_type='checkout.session.expired' then
    select a.* into v_attempt from public.payment_attempts a
    where a.provider_connection_id=v_connection.id and a.provider_checkout_session_id=v_checkout_session_id;
  else
    select a.* into v_attempt from public.payment_attempts a
    where a.provider_connection_id=v_connection.id
      and (
        a.provider_payment_intent_id=v_payment_intent_id
        or (
          a.provider_payment_intent_id is null
          and a.id::text=coalesce(p_event_data->>'paymentAttemptId','')
          and a.payment_id::text=coalesce(p_event_data->>'paymentId','')
          and a.organization_id::text=coalesce(p_event_data->>'organizationId','')
        )
      );
  end if;
  if not found then
    update private.provider_webhook_events set processing_state='failed',processed_at=now(),
      last_error_code='PAYMENT_ATTEMPT_NOT_FOUND',last_error_detail='No Crecy payment attempt matches the connected-account provider object.'
    where id=v_event.id;
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','PAYMENT_ATTEMPT_NOT_FOUND');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stripe-payment|'||v_attempt.payment_id::text,0));
  select p.* into strict v_payment from public.payments p where p.id=v_attempt.payment_id for update;
  select a.* into strict v_attempt from public.payment_attempts a where a.id=v_attempt.id for update;
  select t.* into strict v_tenancy from public.tenancies t where t.id=v_payment.tenancy_id;
  select p.* into strict v_property from public.properties p where p.id=v_tenancy.property_id;

  if v_attempt.organization_id<>v_connection.organization_id
    or v_attempt.provider_event_account_id<>p_provider_account_id
    or v_payment.organization_id<>v_connection.organization_id
    or coalesce(p_event_data->>'organizationId','')<>v_payment.organization_id::text
    or coalesce(p_event_data->>'paymentId','')<>v_payment.id::text
    or coalesce(p_event_data->>'paymentAttemptId','')<>v_attempt.id::text then
    update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
      last_error_code='PROVIDER_METADATA_MISMATCH',last_error_detail='Signed provider metadata does not match the canonical payment scope.'
    where id=v_event.id;
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','PROVIDER_METADATA_MISMATCH');
  end if;
  if p_event_type<>'checkout.session.expired' and v_attempt.provider_payment_intent_id is null then
    update public.payment_attempts set provider_payment_intent_id=v_payment_intent_id where id=v_attempt.id;
    v_attempt.provider_payment_intent_id := v_payment_intent_id;
  end if;

  if p_event_type='payment_intent.processing' then
    if v_payment.status in ('succeeded','failed','returned','reversed','partially_refunded','refunded','disputed') then
      update private.provider_webhook_events set processing_state='ignored',processed_at=now() where id=v_event.id;
      return jsonb_build_object('outcome','ignored','eventId',p_provider_event_id,'paymentId',v_payment.id,'paymentStatus',v_payment.status);
    end if;
    update public.payment_attempts set provider_status='processing',failure_code=null,
      expires_at=greatest(expires_at,now()+interval '14 days') where id=v_attempt.id;
    update public.payments set status='pending' where id=v_payment.id and status in ('created','pending','failed');
    insert into audit.audit_events(
      organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
    ) values (
      v_payment.organization_id,'system','payment.processing','payment',v_payment.id,v_correlation_id,
      jsonb_build_object('providerEventId',p_provider_event_id,'paymentAttemptId',v_attempt.id,'providerStatus','processing')
    );
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (v_payment.organization_id,'payment.processing','payment',v_payment.id,v_correlation_id,jsonb_build_object(
      'paymentId',v_payment.id,'paymentAttemptId',v_attempt.id,'providerEventId',p_provider_event_id,'status','pending'
    ));
    update private.provider_webhook_events set processing_state='processed',processed_at=now() where id=v_event.id;
    return jsonb_build_object('outcome','processed','eventId',p_provider_event_id,'paymentId',v_payment.id,'paymentStatus','pending');
  end if;

  if p_event_type='payment_intent.payment_failed' then
    if v_payment.status in ('succeeded','failed','returned','reversed','partially_refunded','refunded','disputed') then
      update private.provider_webhook_events set processing_state='ignored',processed_at=now() where id=v_event.id;
      return jsonb_build_object('outcome','ignored','eventId',p_provider_event_id,'paymentId',v_payment.id,'paymentStatus',v_payment.status);
    end if;
    -- Checkout can reuse the same PaymentIntent after a failed payment method.
    -- Keep the authorized receivable reservation open until session expiry.
    update public.payment_attempts set provider_status='open',failure_code=coalesce(v_failure_code,'payment_failed')
    where id=v_attempt.id;
    insert into audit.audit_events(
      organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
    ) values (
      v_payment.organization_id,'system','payment_attempt.failed','payment_attempt',v_attempt.id,v_correlation_id,
      jsonb_build_object('providerEventId',p_provider_event_id,'paymentId',v_payment.id,'failureCode',coalesce(v_failure_code,'payment_failed'),'retryableInCheckout',true)
    );
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (v_payment.organization_id,'payment_attempt.failed','payment_attempt',v_attempt.id,v_correlation_id,jsonb_build_object(
      'paymentAttemptId',v_attempt.id,'paymentId',v_payment.id,'providerEventId',p_provider_event_id,
      'failureCode',coalesce(v_failure_code,'payment_failed'),'retryableInCheckout',true
    ));
    update private.provider_webhook_events set processing_state='processed',processed_at=now() where id=v_event.id;
    return jsonb_build_object('outcome','processed','eventId',p_provider_event_id,'paymentId',v_payment.id,'paymentStatus',v_payment.status,'attemptStatus','open');
  end if;

  if p_event_type='checkout.session.expired' then
    if v_payment.status in ('succeeded','failed','returned','reversed','partially_refunded','refunded','disputed') then
      update private.provider_webhook_events set processing_state='ignored',processed_at=now() where id=v_event.id;
      return jsonb_build_object('outcome','ignored','eventId',p_provider_event_id,'paymentId',v_payment.id,'paymentStatus',v_payment.status);
    end if;
    update public.payment_attempts set provider_status='expired',failure_code='checkout_session_expired',expires_at=least(expires_at,now())
    where id=v_attempt.id;
    update public.payments set status='failed',version=version+1 where id=v_payment.id and status in ('created','pending','failed');
    insert into audit.audit_events(
      organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
    ) values (
      v_payment.organization_id,'system','payment.failed','payment',v_payment.id,v_correlation_id,
      jsonb_build_object('providerEventId',p_provider_event_id,'paymentAttemptId',v_attempt.id,'failureCode','checkout_session_expired')
    );
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (v_payment.organization_id,'payment.failed','payment',v_payment.id,v_correlation_id,jsonb_build_object(
      'paymentId',v_payment.id,'paymentAttemptId',v_attempt.id,'providerEventId',p_provider_event_id,'failureCode','checkout_session_expired'
    ));
    update private.provider_webhook_events set processing_state='processed',processed_at=now() where id=v_event.id;
    return jsonb_build_object('outcome','processed','eventId',p_provider_event_id,'paymentId',v_payment.id,'paymentStatus','failed');
  end if;

  -- The remaining supported event is payment_intent.succeeded.
  if coalesce(p_event_data->>'providerStatus','')<>'succeeded'
    or coalesce(p_event_data->>'amountMinor','') !~ '^[1-9][0-9]*$'
    or coalesce(p_event_data->>'currencyCode','') !~ '^[A-Z]{3}$'
    or v_charge_id is null then
    update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
      last_error_code='INVALID_SUCCESS_EVENT',last_error_detail='The success event is missing an authoritative amount, currency, charge, or status.'
    where id=v_event.id;
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','INVALID_SUCCESS_EVENT');
  end if;
  v_amount_minor := (p_event_data->>'amountMinor')::bigint;
  v_currency_code := (p_event_data->>'currencyCode')::char(3);
  if v_amount_minor<>v_payment.amount_minor or v_currency_code<>v_payment.currency_code then
    update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
      last_error_code='PAYMENT_VALUE_MISMATCH',last_error_detail='The signed provider amount or currency does not match the canonical payment.'
    where id=v_event.id;
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','PAYMENT_VALUE_MISMATCH');
  end if;
  if v_payment.status='succeeded' then
    update private.provider_webhook_events set processing_state='ignored',processed_at=now() where id=v_event.id;
    return jsonb_build_object('outcome','ignored','eventId',p_provider_event_id,'paymentId',v_payment.id,'paymentStatus','succeeded');
  end if;
  if v_payment.status in ('returned','reversed','partially_refunded','refunded','disputed') then
    update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
      last_error_code='PAYMENT_TERMINAL_STATE',last_error_detail='A succeeded event cannot overwrite a later terminal correction.'
    where id=v_event.id;
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','PAYMENT_TERMINAL_STATE');
  end if;

  select count(*),sum((a->>'amountMinor')::bigint)
  into v_allocation_count,v_allocation_sum
  from jsonb_array_elements(v_attempt.allocation_preference) a;
  if v_allocation_count not between 1 and 100 or v_allocation_sum<>v_payment.amount_minor then
    update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
      last_error_code='ALLOCATION_TOTAL_MISMATCH',last_error_detail='The authorized allocation preference no longer matches the canonical payment.'
    where id=v_event.id;
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','ALLOCATION_TOTAL_MISMATCH');
  end if;

  perform c.id from public.charges c
  join jsonb_to_recordset(v_attempt.allocation_preference) a("chargeId" uuid,"amountMinor" bigint) on a."chargeId"=c.id
  order by c.id for update;
  if (
    select count(*) from public.charges c
    join jsonb_to_recordset(v_attempt.allocation_preference) a("chargeId" uuid,"amountMinor" bigint) on a."chargeId"=c.id
    where c.organization_id=v_payment.organization_id and c.tenancy_id=v_payment.tenancy_id
      and c.accounting_book_id=v_payment.accounting_book_id and c.receivable_account_id=v_payment.receivable_account_id
      and c.currency_code=v_payment.currency_code and c.status in ('open','partially_paid')
  )<>v_allocation_count or exists(
    select 1 from jsonb_to_recordset(v_attempt.allocation_preference) a("chargeId" uuid,"amountMinor" bigint)
    join public.charges c on c.id=a."chargeId"
    left join lateral (
      select coalesce(sum(pa.amount_minor),0) as allocated_minor from public.payment_allocations pa
      where pa.charge_id=c.id and pa.reversed_at is null
    ) totals on true
    where a."amountMinor">c.amount_minor-totals.allocated_minor
  ) then
    update private.provider_webhook_events set processing_state='failed',processed_at=now(),
      last_error_code='CHARGE_OVERALLOCATED',last_error_detail='The receivable changed before authoritative provider success could be allocated.'
    where id=v_event.id;
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','CHARGE_OVERALLOCATED');
  end if;

  v_receipt_document_id := gen_random_uuid();
  v_journal_transaction_id := gen_random_uuid();
  insert into public.documents(
    id,organization_id,property_id,unit_id,tenancy_id,document_type,title,source,status,operator_supplied_unverified
  ) values (
    v_receipt_document_id,v_payment.organization_id,v_property.id,v_tenancy.unit_id,v_tenancy.id,
    'payment_receipt','Receipt '||v_payment.public_reference,'system_generated','active',false
  );

  insert into public.ledger_accounts(organization_id,accounting_book_id,account_code,account_name,account_class,normal_balance)
  values (v_payment.organization_id,v_payment.accounting_book_id,'1030','Stripe payment clearing','asset','debit')
  on conflict (accounting_book_id,account_code) do nothing;
  select a.id into v_clearing_account_id from public.ledger_accounts a
  where a.accounting_book_id=v_payment.accounting_book_id and a.account_code='1030'
    and a.account_class='asset' and a.normal_balance='debit' and a.status='active';
  if not found then raise exception using errcode='23514',message='LEDGER_ACCOUNT_CONFLICT',detail='1030'; end if;
  select a.id into v_ar_account_id from public.ledger_accounts a
  where a.accounting_book_id=v_payment.accounting_book_id and a.account_code='1100'
    and a.account_class='asset' and a.normal_balance='debit' and a.status='active';
  if not found then raise exception using errcode='23514',message='LEDGER_ACCOUNT_CONFLICT',detail='1100'; end if;

  insert into public.journal_transactions(
    id,organization_id,operating_entity_id,accounting_book_id,transaction_type,effective_date,source_type,source_id,
    idempotency_key,currency_code,correlation_id,metadata
  ) values (
    v_journal_transaction_id,v_payment.organization_id,v_payment.operating_entity_id,v_payment.accounting_book_id,
    'provider_payment',(p_provider_created_at at time zone v_property.time_zone)::date,'payment',v_payment.id,
    'stripe-webhook:'||p_provider_account_id||':'||p_provider_event_id,v_payment.currency_code,v_correlation_id,
    jsonb_build_object('provider','stripe','providerAccountId',p_provider_account_id,'providerEventId',p_provider_event_id,
      'providerPaymentIntentId',v_payment_intent_id,'providerChargeId',v_charge_id)
  );
  insert into public.journal_entries(
    journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,debit_minor,
    property_id,unit_id,tenancy_id,receivable_account_id,memo
  ) values (
    v_journal_transaction_id,v_payment.organization_id,v_payment.accounting_book_id,v_clearing_account_id,v_payment.amount_minor,
    v_property.id,v_tenancy.unit_id,v_tenancy.id,v_payment.receivable_account_id,'Stripe direct charge confirmed'
  );
  insert into public.journal_entries(
    journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,credit_minor,
    property_id,unit_id,tenancy_id,receivable_account_id,memo
  ) values (
    v_journal_transaction_id,v_payment.organization_id,v_payment.accounting_book_id,v_ar_account_id,v_payment.amount_minor,
    v_property.id,v_tenancy.unit_id,v_tenancy.id,v_payment.receivable_account_id,'Resident receivable payment'
  );

  for v_allocation in
    select a."chargeId" as charge_id,a."amountMinor" as amount_minor
    from jsonb_to_recordset(v_attempt.allocation_preference) a("chargeId" uuid,"amountMinor" bigint)
    order by a."chargeId"
  loop
    insert into public.payment_allocations(organization_id,payment_id,charge_id,amount_minor)
    values (v_payment.organization_id,v_payment.id,v_allocation.charge_id,v_allocation.amount_minor);
  end loop;
  update public.charges c set status=case
    when totals.allocated_minor=c.amount_minor then 'paid'::public.charge_status
    else 'partially_paid'::public.charge_status end
  from (
    select pa.charge_id,sum(pa.amount_minor) as allocated_minor
    from public.payment_allocations pa where pa.reversed_at is null and pa.charge_id in (
      select a."chargeId" from jsonb_to_recordset(v_attempt.allocation_preference) a("chargeId" uuid,"amountMinor" bigint)
    ) group by pa.charge_id
  ) totals where c.id=totals.charge_id;

  update public.payment_attempts set
    provider_status='succeeded',provider_charge_id=v_charge_id,failure_code=null,
    confirmed_at=greatest(p_provider_created_at,initiated_at)
  where id=v_attempt.id;
  update public.payments set
    status='succeeded',received_at=p_provider_created_at,journal_transaction_id=v_journal_transaction_id,
    receipt_document_id=v_receipt_document_id,version=version+1
  where id=v_payment.id;

  insert into audit.audit_events(
    organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
  ) values
    (v_payment.organization_id,'system','payment.succeeded','payment',v_payment.id,v_correlation_id,jsonb_build_object(
      'providerEventId',p_provider_event_id,'paymentAttemptId',v_attempt.id,'amountMinor',v_payment.amount_minor,
      'currencyCode',v_payment.currency_code,'journalTransactionId',v_journal_transaction_id,'receiptDocumentId',v_receipt_document_id)),
    (v_payment.organization_id,'system','payment.allocated','payment',v_payment.id,v_correlation_id,jsonb_build_object('allocations',v_attempt.allocation_preference)),
    (v_payment.organization_id,'system','receipt.generated','document',v_receipt_document_id,v_correlation_id,jsonb_build_object('paymentId',v_payment.id,'documentId',v_receipt_document_id));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload) values
    (v_payment.organization_id,'payment.succeeded','payment',v_payment.id,v_correlation_id,jsonb_build_object(
      'paymentId',v_payment.id,'providerEventId',p_provider_event_id,'amountMinor',v_payment.amount_minor,'currencyCode',v_payment.currency_code,
      'journalTransactionId',v_journal_transaction_id,'receiptDocumentId',v_receipt_document_id)),
    (v_payment.organization_id,'payment.allocated','payment',v_payment.id,v_correlation_id,jsonb_build_object('paymentId',v_payment.id,'allocations',v_attempt.allocation_preference)),
    (v_payment.organization_id,'receipt.generated','document',v_receipt_document_id,v_correlation_id,jsonb_build_object('paymentId',v_payment.id,'documentId',v_receipt_document_id)),
    (v_payment.organization_id,'reconciliation_exception.created','payment',v_payment.id,v_correlation_id,jsonb_build_object(
      'paymentId',v_payment.id,'reconciliationStatus','unreconciled','source','stripe_direct_charge'));

  update private.provider_webhook_events set processing_state='processed',processed_at=now() where id=v_event.id;
  v_result := jsonb_build_object(
    'outcome','processed','eventId',p_provider_event_id,'paymentId',v_payment.id,'paymentStatus','succeeded',
    'journalTransactionId',v_journal_transaction_id,'receiptDocumentId',v_receipt_document_id
  );
  return v_result;
exception
  when numeric_value_out_of_range or invalid_text_representation then
    raise exception using errcode='23514',message='INVALID_PROVIDER_EVENT_DATA';
end;
$$;

revoke all on function public.process_stripe_webhook(text,text,text,text,timestamptz,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.process_stripe_webhook(text,text,text,text,timestamptz,boolean,jsonb) to service_role;

commit;
