begin;

create table public.payment_disputes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  payment_attempt_id uuid not null references public.payment_attempts(id) on delete restrict,
  provider_connection_id uuid not null references public.provider_connections(id) on delete restrict,
  provider_dispute_id text not null,
  dispute_kind text not null check (dispute_kind in ('dispute','return')),
  amount_minor bigint not null check (amount_minor > 0),
  currency_code char(3) not null check (currency_code in ('USD','CAD','MXN')),
  reason_code text not null check (length(reason_code) between 2 and 160),
  provider_status text not null check (provider_status in (
    'warning_needs_response','warning_under_review','warning_closed',
    'needs_response','under_review','won','lost'
  )),
  evidence_due_at timestamptz,
  opened_at timestamptz not null,
  closed_at timestamptz,
  reversal_journal_transaction_id uuid references public.journal_transactions(id) on delete restrict,
  recovery_journal_transaction_id uuid references public.journal_transactions(id) on delete restrict,
  last_provider_event_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (organization_id,id),
  unique (provider_connection_id,provider_dispute_id),
  foreign key (organization_id,payment_id) references public.payments(organization_id,id) on delete restrict,
  foreign key (organization_id,payment_attempt_id) references public.payment_attempts(organization_id,id) on delete restrict,
  foreign key (organization_id,provider_connection_id) references public.provider_connections(organization_id,id) on delete restrict,
  foreign key (organization_id,reversal_journal_transaction_id) references public.journal_transactions(organization_id,id) on delete restrict,
  foreign key (organization_id,recovery_journal_transaction_id) references public.journal_transactions(organization_id,id) on delete restrict,
  check (provider_dispute_id ~ '^du_[A-Za-z0-9]+$'),
  check (closed_at is null or closed_at>=opened_at),
  check (recovery_journal_transaction_id is null or reversal_journal_transaction_id is not null)
);
create index payment_disputes_payment_status_idx
  on public.payment_disputes(payment_id,provider_status,opened_at desc);
create index payment_disputes_attempt_idx on public.payment_disputes(payment_attempt_id);
create index payment_disputes_connection_idx on public.payment_disputes(provider_connection_id,opened_at desc);
create index payment_disputes_reversal_journal_idx on public.payment_disputes(reversal_journal_transaction_id)
  where reversal_journal_transaction_id is not null;
create index payment_disputes_recovery_journal_idx on public.payment_disputes(recovery_journal_transaction_id)
  where recovery_journal_transaction_id is not null;
create trigger payment_disputes_touch
before update on public.payment_disputes
for each row execute function private.touch_updated_at();

create table public.payment_dispute_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_dispute_id uuid not null references public.payment_disputes(id) on delete restrict,
  original_allocation_id uuid not null references public.payment_allocations(id) on delete restrict,
  charge_id uuid not null references public.charges(id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  restored_amount_minor bigint not null default 0 check (restored_amount_minor>=0 and restored_amount_minor<=amount_minor),
  restored_allocation_id uuid references public.payment_allocations(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (payment_dispute_id,original_allocation_id),
  foreign key (organization_id,payment_dispute_id) references public.payment_disputes(organization_id,id) on delete restrict,
  foreign key (organization_id,charge_id) references public.charges(organization_id,id) on delete restrict,
  check ((restored_amount_minor=0 and restored_allocation_id is null)
    or (restored_amount_minor>0 and restored_allocation_id is not null))
);
create index payment_dispute_allocations_dispute_idx on public.payment_dispute_allocations(payment_dispute_id);
create index payment_dispute_allocations_original_idx on public.payment_dispute_allocations(original_allocation_id);
create index payment_dispute_allocations_charge_idx on public.payment_dispute_allocations(charge_id);
create index payment_dispute_allocations_restored_idx on public.payment_dispute_allocations(restored_allocation_id)
  where restored_allocation_id is not null;

alter table public.payment_disputes enable row level security;
alter table public.payment_dispute_allocations enable row level security;
create policy payment_disputes_scoped_read
on public.payment_disputes for select to authenticated
using (
  exists(
    select 1 from public.payments p join public.tenancies t on t.id=p.tenancy_id
    where p.id=payment_disputes.payment_id and (
      (select private.has_property_access(t.property_id,'finance.read'))
      or (select private.has_property_access(t.property_id,'finance.manage'))
      or (select private.is_resident_for_tenancy(t.id))
    )
  )
);
create policy payment_dispute_allocations_scoped_read
on public.payment_dispute_allocations for select to authenticated
using (
  exists(
    select 1 from public.payment_disputes d
    join public.payments p on p.id=d.payment_id
    join public.tenancies t on t.id=p.tenancy_id
    where d.id=payment_dispute_allocations.payment_dispute_id and (
      (select private.has_property_access(t.property_id,'finance.read'))
      or (select private.has_property_access(t.property_id,'finance.manage'))
      or (select private.is_resident_for_tenancy(t.id))
    )
  )
);
-- New Supabase projects do not expose new public tables automatically. Keep
-- provider identifiers behind a sanitized RPC instead of granting table access.
revoke all on public.payment_disputes,public.payment_dispute_allocations from public,anon,authenticated;

create or replace function private.derive_payment_status_after_dispute(p_payment_id uuid)
returns public.payment_status
language plpgsql
stable
set search_path = ''
as $$
declare
  v_payment_amount bigint;
  v_succeeded_refunds bigint;
begin
  select p.amount_minor into strict v_payment_amount from public.payments p where p.id=p_payment_id;
  if exists(
    select 1 from public.payment_disputes d
    where d.payment_id=p_payment_id and d.reversal_journal_transaction_id is not null
      and d.recovery_journal_transaction_id is null and d.dispute_kind='return'
  ) then return 'returned'::public.payment_status; end if;
  if exists(
    select 1 from public.payment_disputes d
    where d.payment_id=p_payment_id and d.reversal_journal_transaction_id is not null
      and d.recovery_journal_transaction_id is null and d.provider_status='lost'
  ) then return 'reversed'::public.payment_status; end if;
  if exists(
    select 1 from public.payment_disputes d
    where d.payment_id=p_payment_id and d.reversal_journal_transaction_id is not null
      and d.recovery_journal_transaction_id is null
  ) then return 'disputed'::public.payment_status; end if;
  select coalesce(sum(r.amount_minor),0) into v_succeeded_refunds
  from public.payment_refunds r where r.payment_id=p_payment_id and r.status='succeeded';
  if v_succeeded_refunds=v_payment_amount then return 'refunded'::public.payment_status; end if;
  if v_succeeded_refunds>0 then return 'partially_refunded'::public.payment_status; end if;
  return 'succeeded'::public.payment_status;
end;
$$;
revoke all on function private.derive_payment_status_after_dispute(uuid) from public,anon,authenticated,service_role;

create or replace function public.process_stripe_dispute_webhook(
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
set row_security = off
as $$
declare
  v_event private.provider_webhook_events%rowtype;
  v_connection public.provider_connections%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_payment public.payments%rowtype;
  v_tenancy public.tenancies%rowtype;
  v_property public.properties%rowtype;
  v_dispute public.payment_disputes%rowtype;
  v_allocation public.payment_allocations%rowtype;
  v_dispute_allocation public.payment_dispute_allocations%rowtype;
  v_event_insert_count integer := 0;
  v_provider_dispute_id text;
  v_payment_intent_id text;
  v_charge_id text;
  v_provider_status text;
  v_reason_code text;
  v_dispute_kind text;
  v_method_code text;
  v_amount_minor bigint;
  v_currency_code char(3);
  v_evidence_due_at timestamptz;
  v_reversal_remaining bigint;
  v_reversal_slice bigint;
  v_restore_available bigint;
  v_restore_amount bigint;
  v_restored_allocation_id uuid;
  v_affected_charge_ids uuid[] := array[]::uuid[];
  v_clearing_account_id uuid;
  v_ar_account_id uuid;
  v_reversal_journal_id uuid;
  v_recovery_journal_id uuid;
  v_correlation_id uuid := gen_random_uuid();
  v_previous_payment_status public.payment_status;
  v_new_payment_status public.payment_status;
  v_outbox_event_type text;
  v_is_new boolean := false;
begin
  if p_provider_event_id is null or p_provider_event_id !~ '^evt_[A-Za-z0-9]+$'
    or p_provider_account_id is null or p_provider_account_id !~ '^acct_[A-Za-z0-9]+$'
    or p_payload_sha256 is null or p_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_event_type not in ('charge.dispute.created','charge.dispute.updated','charge.dispute.closed')
    or p_provider_created_at is null or p_provider_created_at>now()+interval '5 minutes'
    or p_livemode is null or jsonb_typeof(p_event_data)<>'object' then
    raise exception using errcode='23514',message='INVALID_PROVIDER_DISPUTE_EVENT';
  end if;

  insert into private.provider_webhook_events(
    provider_code,provider_event_id,provider_account_id,payload_sha256,event_type,livemode,provider_created_at
  ) values (
    'stripe',p_provider_event_id,p_provider_account_id,p_payload_sha256,p_event_type,p_livemode,p_provider_created_at
  ) on conflict (provider_code,provider_account_id,provider_event_id) do nothing;
  get diagnostics v_event_insert_count = row_count;
  select e.* into strict v_event from private.provider_webhook_events e
  where e.provider_code='stripe' and e.provider_account_id=p_provider_account_id
    and e.provider_event_id=p_provider_event_id for update;
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
  if v_event.processing_state='dead_letter' then
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode',coalesce(v_event.last_error_code,'EVENT_DEAD_LETTER'));
  end if;
  update private.provider_webhook_events set processing_state='processing',attempts=attempts+1,
    last_error_code=null,last_error_detail=null where id=v_event.id;

  select c.* into v_connection from public.provider_connections c
  where c.provider_code='stripe' and c.provider_account_id=p_provider_account_id;
  if not found then
    update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
      last_error_code='PROVIDER_ACCOUNT_MISMATCH',last_error_detail='The signed connected account is not registered in Crecy.'
    where id=v_event.id;
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','PROVIDER_ACCOUNT_MISMATCH');
  end if;
  update private.provider_webhook_events set provider_connection_id=v_connection.id,
    organization_id=v_connection.organization_id where id=v_event.id;

  v_provider_dispute_id := nullif(p_event_data->>'providerDisputeId','');
  v_payment_intent_id := nullif(p_event_data->>'paymentIntentId','');
  v_charge_id := nullif(p_event_data->>'chargeId','');
  v_provider_status := nullif(p_event_data->>'providerStatus','');
  v_reason_code := left(coalesce(nullif(p_event_data->>'reasonCode',''),'unknown'),160);
  if v_provider_dispute_id is null or v_provider_dispute_id !~ '^du_[A-Za-z0-9]+$'
    or v_charge_id is null or v_charge_id !~ '^ch_[A-Za-z0-9]+$'
    or (v_payment_intent_id is not null and v_payment_intent_id !~ '^pi_[A-Za-z0-9]+$')
    or v_provider_status not in ('warning_needs_response','warning_under_review','warning_closed','needs_response','under_review','won','lost')
    or coalesce(p_event_data->>'amountMinor','') !~ '^[1-9][0-9]*$'
    or coalesce(p_event_data->>'currencyCode','') !~ '^[A-Z]{3}$'
    or v_reason_code !~ '^[a-z0-9_]{2,160}$' then
    update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
      last_error_code='INVALID_PROVIDER_DISPUTE_OBJECT',last_error_detail='The signed dispute is missing canonical identifiers, value, status, or reason.'
    where id=v_event.id;
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','INVALID_PROVIDER_DISPUTE_OBJECT');
  end if;
  begin
    v_amount_minor := (p_event_data->>'amountMinor')::bigint;
    v_currency_code := (p_event_data->>'currencyCode')::char(3);
    v_evidence_due_at := case when nullif(p_event_data->>'evidenceDueAt','') is null then null
      else (p_event_data->>'evidenceDueAt')::timestamptz end;
  exception when numeric_value_out_of_range or invalid_datetime_format then
    update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
      last_error_code='INVALID_PROVIDER_DISPUTE_OBJECT',last_error_detail='The signed dispute value or evidence deadline is malformed.'
    where id=v_event.id;
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','INVALID_PROVIDER_DISPUTE_OBJECT');
  end;

  select a.* into v_attempt from public.payment_attempts a
  where a.provider_connection_id=v_connection.id and a.provider_status='succeeded'
    and (a.provider_charge_id=v_charge_id or (v_payment_intent_id is not null and a.provider_payment_intent_id=v_payment_intent_id))
  order by a.confirmed_at desc nulls last,a.initiated_at desc limit 1;
  if not found then
    update private.provider_webhook_events set processing_state='failed',processed_at=now(),
      last_error_code='PAYMENT_ATTEMPT_NOT_FOUND',last_error_detail='No succeeded Crecy payment attempt matches the connected-account dispute.'
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
    or v_payment.payment_source<>'provider'
    or v_attempt.provider_charge_id<>v_charge_id
    or (v_payment_intent_id is not null and v_attempt.provider_payment_intent_id<>v_payment_intent_id)
    or v_amount_minor>v_payment.amount_minor or v_currency_code<>v_payment.currency_code then
    update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
      last_error_code='PROVIDER_DISPUTE_MISMATCH',last_error_detail='The signed dispute does not match the canonical connected-account payment or value.'
    where id=v_event.id;
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','PROVIDER_DISPUTE_MISMATCH');
  end if;
  if exists(
    select 1 from public.payment_refunds r
    where r.payment_id=v_payment.id and r.status in ('requested','pending')
  ) then
    update private.provider_webhook_events set processing_state='failed',processed_at=now(),
      last_error_code='PAYMENT_REFUND_PENDING',last_error_detail='A provider refund must reach a definitive state before applying the dispute.'
    where id=v_event.id;
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','PAYMENT_REFUND_PENDING');
  end if;

  v_method_code := v_attempt.method_code;
  v_dispute_kind := case
    when v_method_code in ('us_bank_account','acss_debit')
      and v_reason_code in ('bank_cannot_process','incorrect_account_details','insufficient_funds','check_returned')
    then 'return' else 'dispute' end;

  select d.* into v_dispute from public.payment_disputes d
  where d.provider_connection_id=v_connection.id and d.provider_dispute_id=v_provider_dispute_id for update;
  if found then
    if v_dispute.payment_id<>v_payment.id or v_dispute.payment_attempt_id<>v_attempt.id
      or v_dispute.amount_minor<>v_amount_minor or v_dispute.currency_code<>v_currency_code
      or v_dispute.dispute_kind<>v_dispute_kind then
      update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
        last_error_code='PROVIDER_DISPUTE_MISMATCH',last_error_detail='A provider dispute ID was replayed against different canonical payment data.'
      where id=v_event.id;
      return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','PROVIDER_DISPUTE_MISMATCH');
    end if;
    if p_provider_created_at<v_dispute.last_provider_event_created_at
      or (v_dispute.provider_status in ('won','lost','warning_closed') and v_dispute.provider_status<>v_provider_status) then
      update private.provider_webhook_events set processing_state='ignored',processed_at=now() where id=v_event.id;
      return jsonb_build_object('outcome','ignored','eventId',p_provider_event_id,'paymentId',v_payment.id,
        'paymentStatus',v_payment.status,'disputeId',v_dispute.id,'disputeStatus',v_dispute.provider_status);
    end if;
    if v_provider_status in ('needs_response','under_review','lost')
      and v_dispute.reversal_journal_transaction_id is null then
      if v_payment.status not in ('succeeded','partially_refunded','disputed','reversed','returned') then
        update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
          last_error_code='PAYMENT_TERMINAL_STATE',last_error_detail='The dispute cannot reverse a payment in its current terminal state.'
        where id=v_event.id;
        return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','PAYMENT_TERMINAL_STATE');
      end if;
      select coalesce(sum(pa.amount_minor),0) into v_restore_available
      from public.payment_allocations pa where pa.payment_id=v_payment.id and pa.reversed_at is null;
      if v_restore_available<v_amount_minor then
        update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
          last_error_code='DISPUTE_ALLOCATION_MISMATCH',last_error_detail='The disputed amount exceeds the payment value still applied to receivables.'
        where id=v_event.id;
        return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','DISPUTE_ALLOCATION_MISMATCH');
      end if;
    end if;
    update public.payment_disputes set reason_code=v_reason_code,provider_status=v_provider_status,
      evidence_due_at=coalesce(v_evidence_due_at,evidence_due_at),
      closed_at=case when v_provider_status in ('won','lost','warning_closed') then coalesce(closed_at,p_provider_created_at) else closed_at end,
      last_provider_event_created_at=greatest(last_provider_event_created_at,p_provider_created_at),version=version+1
    where id=v_dispute.id returning * into v_dispute;
  else
    if v_provider_status in ('needs_response','under_review','lost') then
      if v_payment.status not in ('succeeded','partially_refunded','disputed','reversed','returned') then
        update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
          last_error_code='PAYMENT_TERMINAL_STATE',last_error_detail='The dispute cannot reverse a payment in its current terminal state.'
        where id=v_event.id;
        return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','PAYMENT_TERMINAL_STATE');
      end if;
      select coalesce(sum(pa.amount_minor),0) into v_restore_available
      from public.payment_allocations pa where pa.payment_id=v_payment.id and pa.reversed_at is null;
      if v_restore_available<v_amount_minor then
        update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
          last_error_code='DISPUTE_ALLOCATION_MISMATCH',last_error_detail='The disputed amount exceeds the payment value still applied to receivables.'
        where id=v_event.id;
        return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','DISPUTE_ALLOCATION_MISMATCH');
      end if;
    end if;
    insert into public.payment_disputes(
      organization_id,payment_id,payment_attempt_id,provider_connection_id,provider_dispute_id,dispute_kind,
      amount_minor,currency_code,reason_code,provider_status,evidence_due_at,opened_at,closed_at,last_provider_event_created_at
    ) values (
      v_payment.organization_id,v_payment.id,v_attempt.id,v_connection.id,v_provider_dispute_id,v_dispute_kind,
      v_amount_minor,v_currency_code,v_reason_code,v_provider_status,v_evidence_due_at,p_provider_created_at,
      case when v_provider_status in ('won','lost','warning_closed') then p_provider_created_at else null end,p_provider_created_at
    ) returning * into v_dispute;
    v_is_new := true;
  end if;

  v_previous_payment_status := v_payment.status;
  if v_provider_status in ('needs_response','under_review','lost')
    and v_dispute.reversal_journal_transaction_id is null then
    v_reversal_remaining := v_dispute.amount_minor;
    for v_allocation in
      select pa.* from public.payment_allocations pa join public.charges c on c.id=pa.charge_id
      where pa.payment_id=v_payment.id and pa.reversed_at is null
      order by c.due_date desc,pa.allocated_at desc,pa.id desc for update of pa
    loop
      exit when v_reversal_remaining=0;
      v_reversal_slice := least(v_reversal_remaining,v_allocation.amount_minor);
      if not v_allocation.charge_id=any(v_affected_charge_ids) then
        v_affected_charge_ids := array_append(v_affected_charge_ids,v_allocation.charge_id);
      end if;
      update public.payment_allocations set reversed_at=p_provider_created_at,
        reversal_reason=case when v_dispute_kind='return' then 'Provider return ' else 'Provider dispute ' end
          ||v_dispute.id::text||': '||v_reason_code where id=v_allocation.id;
      if v_allocation.amount_minor>v_reversal_slice then
        insert into public.payment_allocations(organization_id,payment_id,charge_id,amount_minor,allocated_by)
        values (v_allocation.organization_id,v_allocation.payment_id,v_allocation.charge_id,
          v_allocation.amount_minor-v_reversal_slice,v_allocation.allocated_by);
      end if;
      insert into public.payment_dispute_allocations(
        organization_id,payment_dispute_id,original_allocation_id,charge_id,amount_minor
      ) values (
        v_payment.organization_id,v_dispute.id,v_allocation.id,v_allocation.charge_id,v_reversal_slice
      );
      v_reversal_remaining := v_reversal_remaining-v_reversal_slice;
    end loop;
    if v_reversal_remaining<>0 then
      update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
        last_error_code='DISPUTE_ALLOCATION_MISMATCH',last_error_detail='The disputed amount exceeds the payment value still applied to receivables.'
      where id=v_event.id;
      return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','DISPUTE_ALLOCATION_MISMATCH');
    end if;

    perform c.id from public.charges c where c.id=any(v_affected_charge_ids) order by c.id for update;
    update public.charges c set status=case
      when totals.allocated_minor=0 then 'open'::public.charge_status
      when totals.allocated_minor=c.amount_minor then 'paid'::public.charge_status
      else 'partially_paid'::public.charge_status end
    from (
      select affected.charge_id,coalesce(sum(pa.amount_minor) filter (where pa.reversed_at is null),0) as allocated_minor
      from unnest(v_affected_charge_ids) affected(charge_id)
      left join public.payment_allocations pa on pa.charge_id=affected.charge_id group by affected.charge_id
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

    v_reversal_journal_id := gen_random_uuid();
    insert into public.journal_transactions(
      id,organization_id,operating_entity_id,accounting_book_id,transaction_type,effective_date,source_type,source_id,
      idempotency_key,currency_code,correlation_id,metadata
    ) values (
      v_reversal_journal_id,v_payment.organization_id,v_payment.operating_entity_id,v_payment.accounting_book_id,
      case when v_dispute_kind='return' then 'provider_payment_return' else 'provider_payment_dispute' end,
      (p_provider_created_at at time zone v_property.time_zone)::date,'payment_dispute',v_dispute.id,
      'stripe-dispute-reversal:'||v_dispute.id::text,v_payment.currency_code,v_correlation_id,
      jsonb_build_object('paymentId',v_payment.id,'disputeId',v_dispute.id,'providerDisputeId',v_provider_dispute_id,
        'amountMinor',v_dispute.amount_minor,'reasonCode',v_reason_code,'kind',v_dispute_kind)
    );
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,debit_minor,
      property_id,unit_id,tenancy_id,receivable_account_id,memo
    ) values (
      v_reversal_journal_id,v_payment.organization_id,v_payment.accounting_book_id,v_ar_account_id,v_dispute.amount_minor,
      v_property.id,v_tenancy.unit_id,v_tenancy.id,v_payment.receivable_account_id,
      case when v_dispute_kind='return' then 'Resident receivable reopened for returned debit' else 'Resident receivable reopened for payment dispute' end
    );
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,credit_minor,
      property_id,unit_id,tenancy_id,receivable_account_id,memo
    ) values (
      v_reversal_journal_id,v_payment.organization_id,v_payment.accounting_book_id,v_clearing_account_id,v_dispute.amount_minor,
      v_property.id,v_tenancy.unit_id,v_tenancy.id,v_payment.receivable_account_id,'Stripe direct-charge dispute withdrawal'
    );
    update public.payment_disputes set reversal_journal_transaction_id=v_reversal_journal_id
    where id=v_dispute.id returning * into v_dispute;
    v_new_payment_status := private.derive_payment_status_after_dispute(v_payment.id);
    update public.payments set status=v_new_payment_status,reconciliation_status='exception',version=version+1
    where id=v_payment.id;
    v_outbox_event_type := case when v_dispute_kind='return' then 'payment.returned' else 'payment.disputed' end;
    insert into audit.audit_events(
      organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,reason,after_data
    ) values (
      v_payment.organization_id,'provider',v_outbox_event_type,'payment_dispute',v_dispute.id,v_correlation_id,v_reason_code,
      jsonb_build_object('paymentId',v_payment.id,'disputeId',v_dispute.id,'amountMinor',v_dispute.amount_minor,
        'currencyCode',v_dispute.currency_code,'status',v_provider_status,'paymentStatus',v_new_payment_status,
        'reversalJournalTransactionId',v_reversal_journal_id)
    );
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (
      v_payment.organization_id,v_outbox_event_type,'payment',v_payment.id,v_correlation_id,
      jsonb_build_object('paymentId',v_payment.id,'disputeId',v_dispute.id,'amountMinor',v_dispute.amount_minor,
        'currencyCode',v_dispute.currency_code,'reasonCode',v_reason_code,'paymentStatus',v_new_payment_status,
        'reversalJournalTransactionId',v_reversal_journal_id)
    );
  elsif v_provider_status='won' and v_dispute.reversal_journal_transaction_id is not null
    and v_dispute.recovery_journal_transaction_id is null then
    v_affected_charge_ids := array[]::uuid[];
    for v_dispute_allocation in
      select da.* from public.payment_dispute_allocations da join public.charges c on c.id=da.charge_id
      where da.payment_dispute_id=v_dispute.id order by c.due_date,da.created_at,da.id for update of da
    loop
      if not v_dispute_allocation.charge_id=any(v_affected_charge_ids) then
        v_affected_charge_ids := array_append(v_affected_charge_ids,v_dispute_allocation.charge_id);
      end if;
    end loop;
    perform c.id from public.charges c where c.id=any(v_affected_charge_ids) order by c.id for update;
    for v_dispute_allocation in
      select da.* from public.payment_dispute_allocations da join public.charges c on c.id=da.charge_id
      where da.payment_dispute_id=v_dispute.id order by c.due_date,da.created_at,da.id for update of da
    loop
      select greatest(c.amount_minor-coalesce(sum(pa.amount_minor) filter (where pa.reversed_at is null),0),0)
      into v_restore_available from public.charges c
      left join public.payment_allocations pa on pa.charge_id=c.id where c.id=v_dispute_allocation.charge_id group by c.id;
      v_restore_amount := least(v_dispute_allocation.amount_minor,v_restore_available);
      v_restored_allocation_id := null;
      if v_restore_amount>0 then
        insert into public.payment_allocations(organization_id,payment_id,charge_id,amount_minor)
        values (v_payment.organization_id,v_payment.id,v_dispute_allocation.charge_id,v_restore_amount)
        returning id into v_restored_allocation_id;
      end if;
      update public.payment_dispute_allocations set restored_amount_minor=v_restore_amount,
        restored_allocation_id=v_restored_allocation_id where id=v_dispute_allocation.id;
    end loop;
    update public.charges c set status=case
      when totals.allocated_minor=0 then 'open'::public.charge_status
      when totals.allocated_minor=c.amount_minor then 'paid'::public.charge_status
      else 'partially_paid'::public.charge_status end
    from (
      select affected.charge_id,coalesce(sum(pa.amount_minor) filter (where pa.reversed_at is null),0) as allocated_minor
      from unnest(v_affected_charge_ids) affected(charge_id)
      left join public.payment_allocations pa on pa.charge_id=affected.charge_id group by affected.charge_id
    ) totals where c.id=totals.charge_id;

    select e.ledger_account_id into strict v_clearing_account_id
    from public.journal_entries e join public.ledger_accounts a on a.id=e.ledger_account_id
    where e.journal_transaction_id=v_payment.journal_transaction_id and e.debit_minor>0
      and a.account_code<>'1100' and a.account_class='asset' and a.normal_balance='debit'
    order by e.id limit 1;
    select a.id into strict v_ar_account_id from public.ledger_accounts a
    where a.accounting_book_id=v_payment.accounting_book_id and a.account_code='1100'
      and a.account_class='asset' and a.normal_balance='debit' and a.status='active';
    v_recovery_journal_id := gen_random_uuid();
    insert into public.journal_transactions(
      id,organization_id,operating_entity_id,accounting_book_id,transaction_type,effective_date,source_type,source_id,
      idempotency_key,currency_code,correlation_id,metadata
    ) values (
      v_recovery_journal_id,v_payment.organization_id,v_payment.operating_entity_id,v_payment.accounting_book_id,
      'provider_dispute_recovery',(p_provider_created_at at time zone v_property.time_zone)::date,
      'payment_dispute',v_dispute.id,'stripe-dispute-recovery:'||v_dispute.id::text,
      v_payment.currency_code,v_correlation_id,jsonb_build_object('paymentId',v_payment.id,'disputeId',v_dispute.id,
        'providerDisputeId',v_provider_dispute_id,'amountMinor',v_dispute.amount_minor,'resolution','won')
    );
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,debit_minor,
      property_id,unit_id,tenancy_id,receivable_account_id,memo
    ) values (
      v_recovery_journal_id,v_payment.organization_id,v_payment.accounting_book_id,v_clearing_account_id,v_dispute.amount_minor,
      v_property.id,v_tenancy.unit_id,v_tenancy.id,v_payment.receivable_account_id,'Stripe dispute funds restored'
    );
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,credit_minor,
      property_id,unit_id,tenancy_id,receivable_account_id,memo
    ) values (
      v_recovery_journal_id,v_payment.organization_id,v_payment.accounting_book_id,v_ar_account_id,v_dispute.amount_minor,
      v_property.id,v_tenancy.unit_id,v_tenancy.id,v_payment.receivable_account_id,'Resident receivable credited after dispute win'
    );
    update public.payment_disputes set recovery_journal_transaction_id=v_recovery_journal_id
    where id=v_dispute.id returning * into v_dispute;
    v_new_payment_status := private.derive_payment_status_after_dispute(v_payment.id);
    update public.payments set status=v_new_payment_status,reconciliation_status='exception',version=version+1
    where id=v_payment.id;
    insert into audit.audit_events(
      organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,reason,after_data
    ) values (
      v_payment.organization_id,'provider','payment.dispute_resolved','payment_dispute',v_dispute.id,
      v_correlation_id,'won',jsonb_build_object('paymentId',v_payment.id,'disputeId',v_dispute.id,
        'amountMinor',v_dispute.amount_minor,'paymentStatus',v_new_payment_status,
        'recoveryJournalTransactionId',v_recovery_journal_id)
    );
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (
      v_payment.organization_id,'payment.dispute_resolved','payment',v_payment.id,v_correlation_id,
      jsonb_build_object('paymentId',v_payment.id,'disputeId',v_dispute.id,'resolution','won',
        'amountMinor',v_dispute.amount_minor,'paymentStatus',v_new_payment_status,
        'recoveryJournalTransactionId',v_recovery_journal_id)
    );
  else
    v_new_payment_status := private.derive_payment_status_after_dispute(v_payment.id);
    if v_new_payment_status<>v_previous_payment_status then
      update public.payments set status=v_new_payment_status,reconciliation_status='exception',version=version+1
      where id=v_payment.id;
    end if;
    if v_provider_status='lost' and v_dispute.reversal_journal_transaction_id is not null then
      insert into audit.audit_events(
        organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,reason,after_data
      ) values (
        v_payment.organization_id,'provider','payment.dispute_resolved','payment_dispute',v_dispute.id,
        v_correlation_id,'lost',jsonb_build_object('paymentId',v_payment.id,'disputeId',v_dispute.id,
          'amountMinor',v_dispute.amount_minor,'providerStatus',v_provider_status,'paymentStatus',v_new_payment_status,
          'reversalJournalTransactionId',v_dispute.reversal_journal_transaction_id)
      );
      insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
      values (
        v_payment.organization_id,'payment.dispute_resolved','payment',v_payment.id,v_correlation_id,
        jsonb_build_object('paymentId',v_payment.id,'disputeId',v_dispute.id,'resolution','lost',
          'amountMinor',v_dispute.amount_minor,'paymentStatus',v_new_payment_status,
          'reversalJournalTransactionId',v_dispute.reversal_journal_transaction_id)
      );
    else
      insert into audit.audit_events(
        organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,reason,after_data
      ) values (
        v_payment.organization_id,'provider','payment.dispute_updated','payment_dispute',v_dispute.id,
        v_correlation_id,v_reason_code,jsonb_build_object('paymentId',v_payment.id,'disputeId',v_dispute.id,
          'providerStatus',v_provider_status,'paymentStatus',v_new_payment_status,'newDispute',v_is_new)
      );
    end if;
  end if;

  select p.status into v_new_payment_status from public.payments p where p.id=v_payment.id;
  update private.provider_webhook_events set processing_state='processed',processed_at=now() where id=v_event.id;
  return jsonb_build_object(
    'outcome','processed','eventId',p_provider_event_id,'paymentId',v_payment.id,'paymentStatus',v_new_payment_status,
    'disputeId',v_dispute.id,'disputeKind',v_dispute.dispute_kind,'disputeStatus',v_dispute.provider_status,
    'reversalJournalTransactionId',v_dispute.reversal_journal_transaction_id,
    'recoveryJournalTransactionId',v_dispute.recovery_journal_transaction_id
  );
exception
  when numeric_value_out_of_range or invalid_text_representation then
    raise exception using errcode='23514',message='INVALID_PROVIDER_DISPUTE_EVENT_DATA';
end;
$$;
revoke all on function public.process_stripe_dispute_webhook(text,text,text,text,timestamptz,boolean,jsonb)
  from public,anon,authenticated;
grant execute on function public.process_stripe_dispute_webhook(text,text,text,text,timestamptz,boolean,jsonb)
  to service_role;

create or replace function public.get_payment_dispute_history(p_payment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'disputes',coalesce((select jsonb_agg(jsonb_build_object(
      'disputeId',d.id,'kind',d.dispute_kind,'amountMinor',d.amount_minor,
      'currencyCode',d.currency_code,'reasonCode',d.reason_code,'status',d.provider_status,
      'evidenceDueAt',d.evidence_due_at,'openedAt',d.opened_at,'closedAt',d.closed_at,
      'reversalJournalTransactionId',d.reversal_journal_transaction_id,
      'recoveryJournalTransactionId',d.recovery_journal_transaction_id
    ) order by d.opened_at,d.id) from public.payment_disputes d where d.payment_id=p.id),'[]'::jsonb)
  ) into v_result
  from public.payments p join public.tenancies t on t.id=p.tenancy_id
  where p.id=p_payment_id and (
    private.has_property_access(t.property_id,'finance.read')
    or private.has_property_access(t.property_id,'finance.manage')
    or private.is_resident_for_tenancy(t.id)
  );
  if v_result is null then raise exception using errcode='P0002',message='PAYMENT_NOT_FOUND'; end if;
  return v_result;
end;
$$;
revoke all on function public.get_payment_dispute_history(uuid) from public,anon;
grant execute on function public.get_payment_dispute_history(uuid) to authenticated;

commit;
