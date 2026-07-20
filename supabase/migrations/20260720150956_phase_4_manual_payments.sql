begin;

create type public.payment_status as enum ('created','pending','succeeded','failed','returned','reversed','partially_refunded','refunded','disputed');
create type public.reconciliation_status as enum ('unreconciled','partially_reconciled','reconciled','exception');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  operating_entity_id uuid not null references public.operating_entities(id) on delete restrict,
  accounting_book_id uuid not null references public.accounting_books(id) on delete restrict,
  receivable_account_id uuid not null references public.receivable_accounts(id) on delete restrict,
  tenancy_id uuid not null references public.tenancies(id) on delete restrict,
  public_reference text not null,
  payment_source text not null check (payment_source in ('provider','cash','external_bank_transfer','check','other_manual')),
  amount_minor bigint not null check (amount_minor > 0),
  currency_code char(3) not null check (currency_code in ('USD','CAD','MXN')),
  status public.payment_status not null default 'created',
  reconciliation_status public.reconciliation_status not null default 'unreconciled',
  received_at timestamptz,
  journal_transaction_id uuid references public.journal_transactions(id) on delete restrict,
  reversal_payment_id uuid references public.payments(id) on delete restrict,
  manual_reason text,
  manual_evidence_document_id uuid references public.documents(id) on delete restrict,
  manual_external_reference text,
  receipt_document_id uuid references public.documents(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (organization_id,public_reference),
  unique (organization_id,id),
  foreign key (organization_id,operating_entity_id) references public.operating_entities(organization_id,id) on delete restrict,
  foreign key (organization_id,accounting_book_id) references public.accounting_books(organization_id,id) on delete restrict,
  foreign key (organization_id,receivable_account_id) references public.receivable_accounts(organization_id,id) on delete restrict,
  foreign key (organization_id,tenancy_id) references public.tenancies(organization_id,id) on delete restrict,
  foreign key (organization_id,manual_evidence_document_id) references public.documents(organization_id,id) on delete restrict,
  foreign key (organization_id,receipt_document_id) references public.documents(organization_id,id) on delete restrict
);
create index payments_receivable_status_idx on public.payments(receivable_account_id,status,received_at desc);
create index payments_tenancy_received_idx on public.payments(tenancy_id,received_at desc);
create index payments_journal_idx on public.payments(journal_transaction_id) where journal_transaction_id is not null;
create unique index payments_manual_external_reference_unique
  on public.payments(organization_id,payment_source,lower(manual_external_reference))
  where manual_external_reference is not null and payment_source<>'provider';

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  charge_id uuid not null references public.charges(id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  allocated_at timestamptz not null default now(),
  allocated_by uuid references auth.users(id) on delete restrict,
  reversed_at timestamptz,
  reversal_reason text,
  unique (organization_id,id),
  unique (payment_id,charge_id,allocated_at),
  foreign key (organization_id,payment_id) references public.payments(organization_id,id) on delete restrict,
  foreign key (organization_id,charge_id) references public.charges(organization_id,id) on delete restrict
);
create index payment_allocations_payment_idx on public.payment_allocations(payment_id) where reversed_at is null;
create index payment_allocations_charge_idx on public.payment_allocations(charge_id) where reversed_at is null;

create trigger payments_touch
before update on public.payments
for each row execute function private.touch_updated_at();

create or replace function private.assert_allocation_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_payment_id uuid := coalesce(new.payment_id,old.payment_id);
  v_charge_id uuid := coalesce(new.charge_id,old.charge_id);
  v_payment_amount bigint;
  v_charge_amount bigint;
  v_allocated_payment bigint;
  v_allocated_charge bigint;
begin
  select p.amount_minor into v_payment_amount from public.payments p where p.id=v_payment_id;
  select c.amount_minor into v_charge_amount from public.charges c where c.id=v_charge_id;
  select coalesce(sum(a.amount_minor),0) into v_allocated_payment
  from public.payment_allocations a where a.payment_id=v_payment_id and a.reversed_at is null;
  select coalesce(sum(a.amount_minor),0) into v_allocated_charge
  from public.payment_allocations a where a.charge_id=v_charge_id and a.reversed_at is null;
  if v_allocated_payment>v_payment_amount then raise exception using errcode='23514',message='PAYMENT_OVERALLOCATED'; end if;
  if v_allocated_charge>v_charge_amount then raise exception using errcode='23514',message='CHARGE_OVERALLOCATED'; end if;
  return null;
end;
$$;
revoke all on function private.assert_allocation_limits() from public,anon,authenticated,service_role;
create constraint trigger payment_allocations_limits
after insert or update or delete on public.payment_allocations
deferrable initially deferred for each row execute function private.assert_allocation_limits();

create or replace function private.prevent_system_receipt_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.source='system_generated' and old.document_type='payment_receipt' then
    raise exception using errcode='55000',message='APPEND_ONLY_RECORD';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.prevent_system_receipt_mutation() from public,anon,authenticated,service_role;
create trigger system_receipts_append_only
before update or delete on public.documents
for each row execute function private.prevent_system_receipt_mutation();
create trigger audit_events_append_only
before update or delete on audit.audit_events
for each row execute function private.prevent_financial_mutation();

create or replace function public.record_manual_payment(
  p_organization_id uuid,
  p_tenancy_id uuid,
  p_source text,
  p_amount_minor bigint,
  p_currency_code char(3),
  p_received_at timestamptz,
  p_reason text,
  p_evidence_document_id uuid,
  p_allocations jsonb,
  p_external_reference text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_tenancy public.tenancies%rowtype;
  v_property public.properties%rowtype;
  v_book public.accounting_books%rowtype;
  v_receivable public.receivable_accounts%rowtype;
  v_previous private.idempotency_records%rowtype;
  v_canonical_allocations jsonb;
  v_request_hash text;
  v_evidence_threshold bigint;
  v_external_reference text := nullif(trim(coalesce(p_external_reference,'')),'');
  v_payment_id uuid := gen_random_uuid();
  v_receipt_document_id uuid := gen_random_uuid();
  v_journal_transaction_id uuid := gen_random_uuid();
  v_cash_account_id uuid;
  v_ar_account_id uuid;
  v_cash_account_code text;
  v_cash_account_name text;
  v_public_reference text;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
  v_allocation record;
  v_allocation_count integer;
  v_allocation_sum bigint;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_source not in ('cash','external_bank_transfer','check','other_manual') then
    raise exception using errcode='23514',message='INVALID_PAYMENT_SOURCE';
  end if;
  if p_amount_minor is null or p_amount_minor not between 1 and 9007199254740991 then
    raise exception using errcode='22003',message='INVALID_PAYMENT_AMOUNT';
  end if;
  if p_currency_code not in ('USD','CAD','MXN') then raise exception using errcode='23514',message='INVALID_CURRENCY'; end if;
  if p_received_at is null or p_received_at>now()+interval '5 minutes' then raise exception using errcode='22007',message='INVALID_RECEIVED_AT'; end if;
  if length(trim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception using errcode='23514',message='PAYMENT_REASON_REQUIRED'; end if;
  if v_external_reference is not null and length(v_external_reference)>160 then raise exception using errcode='22001',message='EXTERNAL_REFERENCE_TOO_LONG'; end if;
  if jsonb_typeof(p_allocations)<>'array' or jsonb_array_length(p_allocations) not between 1 and 100 then
    raise exception using errcode='23514',message='INVALID_ALLOCATIONS';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_allocations) a
    where jsonb_typeof(a)<>'object' or coalesce(a->>'chargeId','')=''
      or coalesce(a->>'amountMinor','') !~ '^[1-9][0-9]*$'
      or (a->>'amountMinor')::numeric>9007199254740991
  ) then raise exception using errcode='23514',message='INVALID_ALLOCATIONS'; end if;
  begin
    select jsonb_agg(jsonb_build_object('chargeId',x.charge_id,'amountMinor',x.amount_minor) order by x.charge_id),count(*),sum(x.amount_minor)
      into v_canonical_allocations,v_allocation_count,v_allocation_sum
    from (
      select (a->>'chargeId')::uuid as charge_id,(a->>'amountMinor')::bigint as amount_minor
      from jsonb_array_elements(p_allocations) a
    ) x;
  exception when invalid_text_representation then
    raise exception using errcode='22P02',message='INVALID_ALLOCATION_CHARGE_ID';
  end;
  if (select count(distinct (a->>'chargeId')::uuid) from jsonb_array_elements(p_allocations) a)<>v_allocation_count then
    raise exception using errcode='23505',message='DUPLICATE_ALLOCATION_CHARGE';
  end if;
  if v_allocation_sum<>p_amount_minor then raise exception using errcode='23514',message='ALLOCATION_TOTAL_MISMATCH'; end if;

  select t.* into v_tenancy from public.tenancies t
  where t.id=p_tenancy_id and t.organization_id=p_organization_id and t.status in ('active','notice_given','move_out_in_progress');
  if not found then raise exception using errcode='P0002',message='TENANCY_NOT_FOUND'; end if;
  if not private.has_property_access(v_tenancy.property_id,'finance.manage') then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  select p.* into v_property from public.properties p where p.id=v_tenancy.property_id and p.organization_id=p_organization_id;
  select b.* into v_book from public.accounting_books b where b.id=v_property.accounting_book_id and b.organization_id=p_organization_id and b.status='open';
  if not found then raise exception using errcode='23514',message='ACCOUNTING_BOOK_NOT_OPEN'; end if;
  select r.* into v_receivable from public.receivable_accounts r
  where r.id=v_tenancy.receivable_account_id and r.organization_id=p_organization_id and r.status='active';
  if not found then raise exception using errcode='23514',message='RECEIVABLE_ACCOUNT_NOT_ACTIVE'; end if;
  if p_currency_code<>v_book.functional_currency_code or p_currency_code<>v_receivable.currency_code then
    raise exception using errcode='23514',message='PAYMENT_CURRENCY_MISMATCH';
  end if;

  select case
    when coalesce(o.settings->>'manual_payment_evidence_threshold_minor','')~'^[0-9]+$'
      then (o.settings->>'manual_payment_evidence_threshold_minor')::bigint
    else 0 end
  into v_evidence_threshold from public.organizations o where o.id=p_organization_id;
  if p_amount_minor>v_evidence_threshold and p_evidence_document_id is null then
    raise exception using errcode='23514',message='PAYMENT_EVIDENCE_REQUIRED';
  end if;
  if p_evidence_document_id is not null and not exists(
    select 1 from public.documents d
    where d.id=p_evidence_document_id and d.organization_id=p_organization_id and d.status='active'
      and (d.property_id is null or d.property_id=v_property.id)
      and (d.unit_id is null or d.unit_id=v_tenancy.unit_id)
      and (d.tenancy_id is null or d.tenancy_id=v_tenancy.id)
      and exists(select 1 from public.document_versions dv where dv.document_id=d.id and dv.organization_id=d.organization_id and dv.upload_status='clean')
  ) then raise exception using errcode='23514',message='PAYMENT_EVIDENCE_NOT_READY'; end if;

  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'organizationId',p_organization_id,'tenancyId',p_tenancy_id,'source',p_source,'amountMinor',p_amount_minor,
    'currencyCode',p_currency_code,'receivedAt',p_received_at,'reason',trim(p_reason),'evidenceDocumentId',p_evidence_document_id,
    'allocations',v_canonical_allocations,'externalReference',v_external_reference
  )::text,'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='RecordManualPayment' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  perform c.id from public.charges c
  join jsonb_to_recordset(v_canonical_allocations) a("chargeId" uuid,"amountMinor" bigint) on a."chargeId"=c.id
  order by c.id for update;
  if (
    select count(*) from public.charges c
    join jsonb_to_recordset(v_canonical_allocations) a("chargeId" uuid,"amountMinor" bigint) on a."chargeId"=c.id
    where c.organization_id=p_organization_id and c.tenancy_id=p_tenancy_id and c.accounting_book_id=v_book.id
      and c.receivable_account_id=v_receivable.id and c.currency_code=p_currency_code and c.status in ('open','partially_paid')
  )<>v_allocation_count then raise exception using errcode='23514',message='ALLOCATION_CHARGE_NOT_AVAILABLE'; end if;
  if exists(
    select 1 from jsonb_to_recordset(v_canonical_allocations) a("chargeId" uuid,"amountMinor" bigint)
    join public.charges c on c.id=a."chargeId"
    left join lateral (
      select coalesce(sum(pa.amount_minor),0) as allocated_minor from public.payment_allocations pa
      where pa.charge_id=c.id and pa.reversed_at is null
    ) totals on true
    where a."amountMinor">c.amount_minor-totals.allocated_minor
  ) then raise exception using errcode='23514',message='CHARGE_OVERALLOCATED'; end if;
  if v_external_reference is not null and exists(
    select 1 from public.payments p where p.organization_id=p_organization_id and p.payment_source=p_source
      and lower(p.manual_external_reference)=lower(v_external_reference)
  ) then raise exception using errcode='23505',message='DUPLICATE_EXTERNAL_REFERENCE'; end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (p_organization_id,v_actor_id,'RecordManualPayment',p_idempotency_key,v_request_hash,now()+interval '24 hours');
  v_public_reference := 'PAY-'||upper(substr(replace(v_payment_id::text,'-',''),1,12));
  insert into public.documents(id,organization_id,property_id,unit_id,tenancy_id,document_type,title,source,status,operator_supplied_unverified,created_by)
  values (v_receipt_document_id,p_organization_id,v_property.id,v_tenancy.unit_id,v_tenancy.id,'payment_receipt','Receipt '||v_public_reference,'system_generated','active',false,v_actor_id);

  v_cash_account_code := case p_source when 'cash' then '1000' when 'check' then '1010' when 'external_bank_transfer' then '1020' else '1090' end;
  v_cash_account_name := case p_source when 'cash' then 'Cash on hand' when 'check' then 'Undeposited checks' when 'external_bank_transfer' then 'Bank transfer clearing' else 'Manual payment clearing' end;
  insert into public.ledger_accounts(organization_id,accounting_book_id,account_code,account_name,account_class,normal_balance)
  values (p_organization_id,v_book.id,v_cash_account_code,v_cash_account_name,'asset','debit')
  on conflict (accounting_book_id,account_code) do nothing;
  select a.id into v_cash_account_id from public.ledger_accounts a
  where a.accounting_book_id=v_book.id and a.account_code=v_cash_account_code and a.account_class='asset' and a.normal_balance='debit' and a.status='active';
  if not found then raise exception using errcode='23514',message='LEDGER_ACCOUNT_CONFLICT',detail=v_cash_account_code; end if;
  select a.id into v_ar_account_id from public.ledger_accounts a
  where a.accounting_book_id=v_book.id and a.account_code='1100' and a.account_class='asset' and a.normal_balance='debit' and a.status='active';
  if not found then raise exception using errcode='23514',message='LEDGER_ACCOUNT_CONFLICT',detail='1100'; end if;

  insert into public.journal_transactions(
    id,organization_id,operating_entity_id,accounting_book_id,transaction_type,effective_date,source_type,source_id,idempotency_key,
    currency_code,correlation_id,created_by,metadata
  ) values (
    v_journal_transaction_id,p_organization_id,v_property.operating_entity_id,v_book.id,'manual_payment',
    (p_received_at at time zone v_property.time_zone)::date,'payment',v_payment_id,'manual-payment:'||p_idempotency_key,
    p_currency_code,v_correlation_id,v_actor_id,jsonb_build_object('source',p_source,'externalReference',v_external_reference,'evidenceDocumentId',p_evidence_document_id)
  );
  insert into public.journal_entries(
    journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,debit_minor,property_id,unit_id,tenancy_id,receivable_account_id,memo
  ) values (
    v_journal_transaction_id,p_organization_id,v_book.id,v_cash_account_id,p_amount_minor,v_property.id,v_tenancy.unit_id,v_tenancy.id,v_receivable.id,'Manual payment received'
  );
  insert into public.journal_entries(
    journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,credit_minor,property_id,unit_id,tenancy_id,receivable_account_id,memo
  ) values (
    v_journal_transaction_id,p_organization_id,v_book.id,v_ar_account_id,p_amount_minor,v_property.id,v_tenancy.unit_id,v_tenancy.id,v_receivable.id,'Resident receivable payment'
  );
  insert into public.payments(
    id,organization_id,operating_entity_id,accounting_book_id,receivable_account_id,tenancy_id,public_reference,payment_source,
    amount_minor,currency_code,status,reconciliation_status,received_at,journal_transaction_id,manual_reason,manual_evidence_document_id,
    manual_external_reference,receipt_document_id,created_by
  ) values (
    v_payment_id,p_organization_id,v_property.operating_entity_id,v_book.id,v_receivable.id,v_tenancy.id,v_public_reference,p_source,
    p_amount_minor,p_currency_code,'succeeded','unreconciled',p_received_at,v_journal_transaction_id,trim(p_reason),p_evidence_document_id,
    v_external_reference,v_receipt_document_id,v_actor_id
  );
  for v_allocation in
    select a."chargeId" as charge_id,a."amountMinor" as amount_minor
    from jsonb_to_recordset(v_canonical_allocations) a("chargeId" uuid,"amountMinor" bigint)
    order by a."chargeId"
  loop
    insert into public.payment_allocations(organization_id,payment_id,charge_id,amount_minor,allocated_by)
    values (p_organization_id,v_payment_id,v_allocation.charge_id,v_allocation.amount_minor,v_actor_id);
  end loop;
  update public.charges c set status=case
    when totals.allocated_minor=c.amount_minor then 'paid'::public.charge_status
    else 'partially_paid'::public.charge_status end
  from (
    select pa.charge_id,sum(pa.amount_minor) as allocated_minor
    from public.payment_allocations pa where pa.reversed_at is null and pa.charge_id in (
      select a."chargeId" from jsonb_to_recordset(v_canonical_allocations) a("chargeId" uuid,"amountMinor" bigint)
    ) group by pa.charge_id
  ) totals where c.id=totals.charge_id;

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,reason,after_data) values
    (p_organization_id,v_actor_id,'user','manual_payment.recorded','payment',v_payment_id,v_correlation_id,trim(p_reason),jsonb_build_object('publicReference',v_public_reference,'source',p_source,'amountMinor',p_amount_minor,'currencyCode',p_currency_code,'reconciliationStatus','unreconciled')),
    (p_organization_id,v_actor_id,'user','payment.allocated','payment',v_payment_id,v_correlation_id,trim(p_reason),jsonb_build_object('allocations',v_canonical_allocations)),
    (p_organization_id,v_actor_id,'user','receipt.generated','document',v_receipt_document_id,v_correlation_id,null,jsonb_build_object('paymentId',v_payment_id,'documentId',v_receipt_document_id));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload) values
    (p_organization_id,'manual_payment.recorded','payment',v_payment_id,v_correlation_id,jsonb_build_object('paymentId',v_payment_id,'publicReference',v_public_reference,'amountMinor',p_amount_minor,'currencyCode',p_currency_code)),
    (p_organization_id,'payment.allocated','payment',v_payment_id,v_correlation_id,jsonb_build_object('paymentId',v_payment_id,'allocations',v_canonical_allocations)),
    (p_organization_id,'receipt.generated','document',v_receipt_document_id,v_correlation_id,jsonb_build_object('paymentId',v_payment_id,'documentId',v_receipt_document_id)),
    (p_organization_id,'reconciliation_exception.created','payment',v_payment_id,v_correlation_id,jsonb_build_object('paymentId',v_payment_id,'reconciliationStatus','unreconciled','source',p_source));

  v_response := jsonb_build_object('paymentId',v_payment_id,'publicReference',v_public_reference,'receiptDocumentId',v_receipt_document_id,'reconciliationStatus','unreconciled');
  update private.idempotency_records r set state='completed',response_status=201,response_body=v_response,
    resource_type='payment',resource_id=v_payment_id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='RecordManualPayment' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.record_manual_payment(uuid,uuid,text,bigint,char,timestamptz,text,uuid,jsonb,text,text) from public,anon;
grant execute on function public.record_manual_payment(uuid,uuid,text,bigint,char,timestamptz,text,uuid,jsonb,text,text) to authenticated;

create or replace function public.get_manual_payment_options()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('tenancies',coalesce(jsonb_agg(jsonb_build_object(
    'organizationId',t.organization_id,'tenancyId',t.id,'propertyName',p.name,'unitCode',u.unit_code,'householdName',h.display_name,
    'currencyCode',l.currency_code,
    'evidenceThresholdMinor',case when coalesce(o.settings->>'manual_payment_evidence_threshold_minor','')~'^[0-9]+$' then (o.settings->>'manual_payment_evidence_threshold_minor')::bigint else 0 end,
    'charges',coalesce((select jsonb_agg(jsonb_build_object(
      'chargeId',c.id,'description',c.description,'dueDate',c.due_date,'amountMinor',c.amount_minor,
      'allocatedMinor',coalesce(a.allocated_minor,0),'remainingMinor',c.amount_minor-coalesce(a.allocated_minor,0)
    ) order by c.due_date,c.created_at) from public.charges c left join lateral (
      select sum(pa.amount_minor) as allocated_minor from public.payment_allocations pa where pa.charge_id=c.id and pa.reversed_at is null
    ) a on true where c.tenancy_id=t.id and c.status in ('open','partially_paid')),'[]'::jsonb),
    'evidenceDocuments',coalesce((select jsonb_agg(jsonb_build_object('documentId',d.id,'title',d.title) order by d.created_at desc)
      from public.documents d where d.organization_id=t.organization_id and d.status='active' and d.source<>'system_generated'
        and (d.property_id is null or d.property_id=t.property_id) and (d.unit_id is null or d.unit_id=t.unit_id)
        and (d.tenancy_id is null or d.tenancy_id=t.id)
        and exists(select 1 from public.document_versions dv where dv.document_id=d.id and dv.organization_id=d.organization_id and dv.upload_status='clean')),'[]'::jsonb)
  ) order by p.name,u.unit_code),'[]'::jsonb))
  from public.tenancies t
  join public.organizations o on o.id=t.organization_id
  join public.properties p on p.id=t.property_id
  join public.units u on u.id=t.unit_id
  join public.households h on h.id=t.household_id
  join public.leases l on l.id=t.lease_id
  where t.status in ('active','notice_given','move_out_in_progress')
    and private.has_property_access(t.property_id,'finance.manage')
$$;
revoke all on function public.get_manual_payment_options() from public,anon;
grant execute on function public.get_manual_payment_options() to authenticated;

create or replace function public.get_operator_payment_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object(
    'paymentId',pay.id,'publicReference',pay.public_reference,'propertyName',p.name,'unitCode',u.unit_code,'householdName',h.display_name,
    'source',pay.payment_source,'amountMinor',pay.amount_minor,'currencyCode',pay.currency_code,'status',pay.status,
    'reconciliationStatus',pay.reconciliation_status,'receivedAt',pay.received_at,'allocatedMinor',coalesce(a.allocated_minor,0),
    'externalReference',pay.manual_external_reference,'receiptDocumentId',pay.receipt_document_id
  ) order by pay.received_at desc,pay.created_at desc),'[]'::jsonb))
  from public.payments pay
  join public.tenancies t on t.id=pay.tenancy_id
  join public.properties p on p.id=t.property_id
  join public.units u on u.id=t.unit_id
  join public.households h on h.id=t.household_id
  left join lateral (select sum(pa.amount_minor) as allocated_minor from public.payment_allocations pa where pa.payment_id=pay.id and pa.reversed_at is null) a on true
  where private.has_property_access(t.property_id,'finance.read') or private.has_property_access(t.property_id,'finance.manage')
$$;
revoke all on function public.get_operator_payment_summary() from public,anon;
grant execute on function public.get_operator_payment_summary() to authenticated;

create or replace function public.get_resident_payment_history()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object(
    'paymentId',pay.id,'publicReference',pay.public_reference,'propertyName',p.name,'unitCode',u.unit_code,
    'source',pay.payment_source,'amountMinor',pay.amount_minor,'currencyCode',pay.currency_code,'status',pay.status,
    'receivedAt',pay.received_at,'receiptDocumentId',pay.receipt_document_id
  ) order by pay.received_at desc,pay.created_at desc),'[]'::jsonb))
  from public.payments pay join public.tenancies t on t.id=pay.tenancy_id
  join public.properties p on p.id=t.property_id join public.units u on u.id=t.unit_id
  where private.is_resident_for_tenancy(t.id)
$$;
revoke all on function public.get_resident_payment_history() from public,anon;
grant execute on function public.get_resident_payment_history() to authenticated;

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
  where pay.receipt_document_id=p_document_id and pay.status='succeeded'
    and (private.has_property_access(t.property_id,'finance.read') or private.has_property_access(t.property_id,'finance.manage') or private.is_resident_for_tenancy(t.id));
  if v_result is null then raise exception using errcode='P0002',message='RECEIPT_NOT_FOUND'; end if;
  return v_result;
end;
$$;
revoke all on function public.get_payment_receipt(uuid) from public,anon;
grant execute on function public.get_payment_receipt(uuid) to authenticated;

create or replace function public.get_operator_receivables_summary()
returns jsonb language sql stable security definer set search_path = '' as $$
  with scoped as (
    select t.id as tenancy_id,p.name as property_name,u.unit_code,l.currency_code,
      coalesce((select sum(e.debit_minor-e.credit_minor) from public.journal_entries e join public.ledger_accounts a on a.id=e.ledger_account_id where e.tenancy_id=t.id and a.account_code='1100'),0) as balance_minor,
      coalesce(open_charge.due_date,schedule.next_run_on) as next_due_date,
      coalesce(open_charge.remaining_minor,schedule.amount_minor) as next_due_amount_minor,
      coalesce(open_charge.status::text,case when schedule.next_run_on is null then null else 'scheduled' end) as next_due_status
    from public.tenancies t join public.properties p on p.id=t.property_id join public.units u on u.id=t.unit_id join public.leases l on l.id=t.lease_id
    left join lateral (select c.due_date,c.amount_minor-coalesce(a.allocated_minor,0) as remaining_minor,c.status,c.created_at from public.charges c
      left join lateral (select sum(pa.amount_minor) as allocated_minor from public.payment_allocations pa where pa.charge_id=c.id and pa.reversed_at is null) a on true
      where c.tenancy_id=t.id and c.status in ('open','partially_paid') order by c.due_date,c.created_at limit 1) open_charge on true
    left join lateral (select s.next_run_on,s.amount_minor from public.charge_schedules s where s.tenancy_id=t.id and s.status='active' and s.next_run_on is not null order by s.next_run_on limit 1) schedule on true
    where t.status in ('scheduled','active','notice_given','move_out_in_progress') and (private.has_property_access(t.property_id,'finance.read') or private.has_property_access(t.property_id,'finance.manage'))
  ) select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('tenancyId',tenancy_id,'propertyName',property_name,'unitCode',unit_code,'currencyCode',currency_code,'balanceMinor',balance_minor,'nextDueDate',next_due_date,'nextDueAmountMinor',next_due_amount_minor,'nextDueStatus',next_due_status) order by property_name,unit_code),'[]'::jsonb)) from scoped
$$;

create or replace function public.get_resident_balance_summary()
returns jsonb language sql stable security definer set search_path = '' as $$
  with scoped as (
    select t.id as tenancy_id,p.name as property_name,u.unit_code,l.currency_code,
      coalesce((select sum(e.debit_minor-e.credit_minor) from public.journal_entries e join public.ledger_accounts a on a.id=e.ledger_account_id where e.tenancy_id=t.id and a.account_code='1100'),0) as balance_minor,
      coalesce(open_charge.due_date,schedule.next_run_on) as next_due_date,
      coalesce(open_charge.remaining_minor,schedule.amount_minor) as next_due_amount_minor,
      coalesce(open_charge.status::text,case when schedule.next_run_on is null then null else 'scheduled' end) as next_due_status
    from public.tenancies t join public.properties p on p.id=t.property_id join public.units u on u.id=t.unit_id join public.leases l on l.id=t.lease_id
    left join lateral (select c.due_date,c.amount_minor-coalesce(a.allocated_minor,0) as remaining_minor,c.status,c.created_at from public.charges c
      left join lateral (select sum(pa.amount_minor) as allocated_minor from public.payment_allocations pa where pa.charge_id=c.id and pa.reversed_at is null) a on true
      where c.tenancy_id=t.id and c.status in ('open','partially_paid') order by c.due_date,c.created_at limit 1) open_charge on true
    left join lateral (select s.next_run_on,s.amount_minor from public.charge_schedules s where s.tenancy_id=t.id and s.status='active' and s.next_run_on is not null order by s.next_run_on limit 1) schedule on true
    where t.status in ('scheduled','active','notice_given','move_out_in_progress') and private.is_resident_for_tenancy(t.id)
  ) select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('tenancyId',tenancy_id,'propertyName',property_name,'unitCode',unit_code,'currencyCode',currency_code,'balanceMinor',balance_minor,'nextDueDate',next_due_date,'nextDueAmountMinor',next_due_amount_minor,'nextDueStatus',next_due_status) order by property_name,unit_code),'[]'::jsonb)) from scoped
$$;

alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
create policy payments_operator_or_resident_read on public.payments for select to authenticated using (
  exists(select 1 from public.tenancies t where t.id=payments.tenancy_id and (
    private.has_property_access(t.property_id,'finance.read') or private.has_property_access(t.property_id,'finance.manage') or private.is_resident_for_tenancy(t.id)
  ))
);
create policy payment_allocations_operator_or_resident_read on public.payment_allocations for select to authenticated using (
  exists(select 1 from public.payments p join public.tenancies t on t.id=p.tenancy_id where p.id=payment_allocations.payment_id and (
    private.has_property_access(t.property_id,'finance.read') or private.has_property_access(t.property_id,'finance.manage') or private.is_resident_for_tenancy(t.id)
  ))
);
grant select on public.payments,public.payment_allocations to authenticated;
revoke insert,update,delete on public.payments,public.payment_allocations from anon,authenticated;

commit;
