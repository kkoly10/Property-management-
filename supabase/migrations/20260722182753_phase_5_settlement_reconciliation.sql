begin;

create table public.settlement_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  operating_entity_id uuid not null references public.operating_entities(id) on delete restrict,
  accounting_book_id uuid not null references public.accounting_books(id) on delete restrict,
  provider_connection_id uuid not null references public.provider_connections(id) on delete restrict,
  public_reference text not null,
  provider_settlement_id text not null,
  provider_status text not null check (provider_status in ('pending','in_transit','paid','failed','canceled')),
  payout_amount_minor bigint not null check (payout_amount_minor>0),
  gross_minor bigint not null default 0,
  fee_minor bigint not null default 0,
  net_minor bigint not null default 0,
  currency_code char(3) not null check (currency_code in ('USD','CAD','MXN')),
  automatic boolean not null,
  expected_arrival_date date,
  provider_created_at timestamptz not null,
  received_at timestamptz,
  last_provider_event_created_at timestamptz not null,
  reconciliation_status public.reconciliation_status not null default 'unreconciled',
  journal_transaction_id uuid references public.journal_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,public_reference),
  unique (provider_connection_id,provider_settlement_id),
  foreign key (organization_id,operating_entity_id)
    references public.operating_entities(organization_id,id) on delete restrict,
  foreign key (organization_id,accounting_book_id)
    references public.accounting_books(organization_id,id) on delete restrict,
  foreign key (organization_id,provider_connection_id)
    references public.provider_connections(organization_id,id) on delete restrict,
  check (provider_settlement_id ~ '^po_[A-Za-z0-9]+$'),
  check (gross_minor-fee_minor=net_minor),
  check (received_at is null or received_at>=provider_created_at),
  check ((journal_transaction_id is null)=(reconciliation_status<>'reconciled'))
);
create index settlement_batches_org_status_idx
  on public.settlement_batches(organization_id,reconciliation_status,expected_arrival_date desc);
create index settlement_batches_entity_idx
  on public.settlement_batches(operating_entity_id,provider_created_at desc);
create index settlement_batches_book_idx
  on public.settlement_batches(accounting_book_id,provider_created_at desc);
create index settlement_batches_journal_idx
  on public.settlement_batches(journal_transaction_id) where journal_transaction_id is not null;
create trigger settlement_batches_touch before update on public.settlement_batches
for each row execute function private.touch_updated_at();

create table public.settlement_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  settlement_batch_id uuid not null references public.settlement_batches(id) on delete restrict,
  provider_connection_id uuid not null references public.provider_connections(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  provider_balance_transaction_id text not null,
  provider_source_id text,
  transaction_type text not null,
  reporting_category text,
  gross_minor bigint not null,
  fee_minor bigint not null,
  net_minor bigint not null,
  currency_code char(3) not null check (currency_code in ('USD','CAD','MXN')),
  provider_status text not null check (provider_status in ('available','pending')),
  available_on date not null,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (provider_connection_id,provider_balance_transaction_id),
  foreign key (organization_id,settlement_batch_id)
    references public.settlement_batches(organization_id,id) on delete restrict,
  foreign key (organization_id,provider_connection_id)
    references public.provider_connections(organization_id,id) on delete restrict,
  foreign key (organization_id,payment_id)
    references public.payments(organization_id,id) on delete restrict,
  check (provider_balance_transaction_id ~ '^txn_[A-Za-z0-9]+$'),
  check (provider_source_id is null or provider_source_id ~ '^[A-Za-z]{2,12}_[A-Za-z0-9]+$'),
  check (length(transaction_type) between 2 and 80),
  check (reporting_category is null or length(reporting_category) between 2 and 120),
  check (gross_minor<>0),
  check (gross_minor-fee_minor=net_minor)
);
create index settlement_items_batch_idx on public.settlement_items(settlement_batch_id,available_on,id);
create index settlement_items_payment_idx on public.settlement_items(payment_id) where payment_id is not null;
create trigger settlement_items_append_only before update or delete on public.settlement_items
for each row execute function private.prevent_financial_mutation();

create table public.reconciliation_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  settlement_batch_id uuid not null references public.settlement_batches(id) on delete restrict,
  settlement_item_id uuid not null references public.settlement_items(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  match_method text not null check (match_method in ('exact_provider_reference','approved_manual')),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  approval_status text not null check (approval_status in ('auto_approved','proposed','approved','rejected')),
  matched_at timestamptz not null default now(),
  matched_by uuid references auth.users(id) on delete restrict,
  evidence_note text,
  unique (organization_id,id),
  unique (settlement_item_id),
  unique (payment_id),
  foreign key (organization_id,settlement_batch_id)
    references public.settlement_batches(organization_id,id) on delete restrict,
  foreign key (organization_id,settlement_item_id)
    references public.settlement_items(organization_id,id) on delete restrict,
  foreign key (organization_id,payment_id)
    references public.payments(organization_id,id) on delete restrict,
  check ((approval_status='auto_approved' and match_method='exact_provider_reference' and confidence=1)
    or approval_status<>'auto_approved')
);
create index reconciliation_matches_batch_idx on public.reconciliation_matches(settlement_batch_id,matched_at);
create trigger reconciliation_matches_append_only before update or delete on public.reconciliation_matches
for each row execute function private.prevent_financial_mutation();

create table public.reconciliation_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  settlement_batch_id uuid not null references public.settlement_batches(id) on delete restrict,
  settlement_item_id uuid references public.settlement_items(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  exception_type text not null check (exception_type in (
    'missing_settlement','amount_mismatch','duplicate','unidentified_transfer','reversed_payout','chargeback','stale_pending_payment'
  )),
  status text not null default 'open' check (status in ('open','resolved','waived','escalated')),
  expected_minor bigint,
  actual_minor bigint,
  currency_code char(3) not null check (currency_code in ('USD','CAD','MXN')),
  detail text not null check (length(trim(detail)) between 8 and 500),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete restrict,
  resolution_evidence text,
  unique (organization_id,id),
  foreign key (organization_id,settlement_batch_id)
    references public.settlement_batches(organization_id,id) on delete restrict,
  foreign key (organization_id,settlement_item_id)
    references public.settlement_items(organization_id,id) on delete restrict,
  foreign key (organization_id,payment_id)
    references public.payments(organization_id,id) on delete restrict,
  check ((status in ('open','escalated') and resolved_at is null and resolved_by is null)
    or (status in ('resolved','waived') and resolved_at is not null and resolved_by is not null)),
  check (resolution_evidence is null or length(trim(resolution_evidence)) between 8 and 1000)
);
create index reconciliation_exceptions_org_queue_idx
  on public.reconciliation_exceptions(organization_id,status,detected_at desc);
create index reconciliation_exceptions_batch_idx
  on public.reconciliation_exceptions(settlement_batch_id,detected_at desc);
create index reconciliation_exceptions_item_idx
  on public.reconciliation_exceptions(settlement_item_id) where settlement_item_id is not null;
create index reconciliation_exceptions_payment_idx
  on public.reconciliation_exceptions(payment_id) where payment_id is not null;
create unique index reconciliation_exceptions_open_batch_unique
  on public.reconciliation_exceptions(settlement_batch_id,exception_type)
  where settlement_item_id is null and status='open';
create unique index reconciliation_exceptions_open_item_unique
  on public.reconciliation_exceptions(settlement_item_id,exception_type)
  where settlement_item_id is not null and status='open';

alter table public.settlement_batches enable row level security;
alter table public.settlement_items enable row level security;
alter table public.reconciliation_matches enable row level security;
alter table public.reconciliation_exceptions enable row level security;

create policy settlement_batches_finance_read on public.settlement_batches
for select to authenticated using ((select private.has_org_permission(organization_id,'finance.manage')));
create policy settlement_items_finance_read on public.settlement_items
for select to authenticated using ((select private.has_org_permission(organization_id,'finance.manage')));
create policy reconciliation_matches_finance_read on public.reconciliation_matches
for select to authenticated using ((select private.has_org_permission(organization_id,'finance.manage')));
create policy reconciliation_exceptions_finance_read on public.reconciliation_exceptions
for select to authenticated using ((select private.has_org_permission(organization_id,'finance.manage')));

revoke all on public.settlement_batches,public.settlement_items,public.reconciliation_matches,public.reconciliation_exceptions
from public,anon,authenticated,service_role;
grant select on public.settlement_batches,public.settlement_items,public.reconciliation_matches,public.reconciliation_exceptions
to authenticated;

create or replace function public.process_stripe_settlement_webhook(
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
  v_batch public.settlement_batches%rowtype;
  v_item public.settlement_items%rowtype;
  v_payment public.payments%rowtype;
  v_item_json jsonb;
  v_provider_settlement_id text;
  v_provider_status text;
  v_currency_code char(3);
  v_payout_amount bigint;
  v_automatic boolean;
  v_expected_arrival_date date;
  v_provider_balance_transaction_id text;
  v_provider_source_id text;
  v_matched_payment_id uuid;
  v_transaction_type text;
  v_reporting_category text;
  v_item_gross bigint;
  v_item_fee bigint;
  v_item_net bigint;
  v_item_status text;
  v_available_on date;
  v_batch_id uuid;
  v_public_reference text;
  v_event_insert_count integer := 0;
  v_item_insert_count integer;
  v_item_count integer;
  v_matched_count integer;
  v_exception_count integer;
  v_gross_minor bigint;
  v_fee_minor bigint;
  v_net_minor bigint;
  v_clearing_account_id uuid;
  v_cash_account_id uuid;
  v_fee_account_id uuid;
  v_journal_transaction_id uuid;
  v_exception_id uuid;
  v_correlation_id uuid := gen_random_uuid();
begin
  if p_provider_event_id is null or p_provider_event_id !~ '^evt_[A-Za-z0-9]+$'
    or p_provider_account_id is null or p_provider_account_id !~ '^acct_[A-Za-z0-9]+$'
    or p_payload_sha256 is null or p_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_event_type not in ('payout.created','payout.updated','payout.paid','payout.failed')
    or p_provider_created_at is null or p_provider_created_at>now()+interval '5 minutes'
    or p_livemode is null or jsonb_typeof(p_event_data)<>'object' then
    raise exception using errcode='23514',message='INVALID_PROVIDER_SETTLEMENT_EVENT';
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
  if v_event.processing_state='dead_letter' then
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,
      'errorCode',coalesce(v_event.last_error_code,'EVENT_DEAD_LETTER'));
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
  update private.provider_webhook_events set provider_connection_id=v_connection.id,organization_id=v_connection.organization_id
  where id=v_event.id;

  v_provider_settlement_id := nullif(p_event_data->>'providerSettlementId','');
  v_provider_status := nullif(p_event_data->>'providerStatus','');
  v_currency_code := upper(nullif(p_event_data->>'currencyCode',''))::char(3);
  v_payout_amount := (p_event_data->>'amountMinor')::bigint;
  v_automatic := (p_event_data->>'automatic')::boolean;
  v_expected_arrival_date := nullif(p_event_data->>'expectedArrivalDate','')::date;
  if v_provider_settlement_id is null or v_provider_settlement_id !~ '^po_[A-Za-z0-9]+$'
    or v_provider_status not in ('pending','in_transit','paid','failed','canceled')
    or v_currency_code not in ('USD','CAD','MXN') or v_payout_amount<=0
    or v_automatic is null or jsonb_typeof(p_event_data->'items')<>'array'
    or jsonb_array_length(p_event_data->'items')>5000
    or (p_event_type='payout.paid' and v_provider_status<>'paid')
    or (p_event_type='payout.failed' and v_provider_status<>'failed') then
    update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
      last_error_code='INVALID_PROVIDER_SETTLEMENT_OBJECT',last_error_detail='The signed payout contains invalid canonical settlement fields.'
    where id=v_event.id;
    return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','INVALID_PROVIDER_SETTLEMENT_OBJECT');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stripe-settlement|'||v_connection.id::text||'|'||v_provider_settlement_id,0));
  select b.* into v_batch from public.settlement_batches b
  where b.provider_connection_id=v_connection.id and b.provider_settlement_id=v_provider_settlement_id for update;
  if found then
    if v_batch.organization_id<>v_connection.organization_id or v_batch.payout_amount_minor<>v_payout_amount
      or v_batch.currency_code<>v_currency_code or v_batch.automatic<>v_automatic then
      update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
        last_error_code='SETTLEMENT_REPLAY_MISMATCH',last_error_detail='The payout identity was replayed with different financial fields.'
      where id=v_event.id;
      return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','SETTLEMENT_REPLAY_MISMATCH');
    end if;
    if p_provider_created_at<v_batch.last_provider_event_created_at
      or (v_batch.provider_status='paid' and v_provider_status<>'paid')
      or (v_batch.provider_status in ('failed','canceled') and v_provider_status<>v_batch.provider_status) then
      update private.provider_webhook_events set processing_state='ignored',processed_at=now() where id=v_event.id;
      return jsonb_build_object('outcome','ignored','eventId',p_provider_event_id,'settlementId',v_batch.id,
        'providerStatus',v_batch.provider_status,'reconciliationStatus',v_batch.reconciliation_status);
    end if;
  else
    v_batch_id := gen_random_uuid();
    v_public_reference := 'SET-'||upper(substr(replace(v_batch_id::text,'-',''),1,12));
    insert into public.settlement_batches(
      id,organization_id,operating_entity_id,accounting_book_id,provider_connection_id,public_reference,
      provider_settlement_id,provider_status,payout_amount_minor,currency_code,automatic,expected_arrival_date,
      provider_created_at,received_at,last_provider_event_created_at
    ) values (
      v_batch_id,v_connection.organization_id,v_connection.operating_entity_id,
      (select ab.id from public.accounting_books ab
        where ab.operating_entity_id=v_connection.operating_entity_id and ab.status='open'
        order by ab.created_at,ab.id limit 1),
      v_connection.id,v_public_reference,v_provider_settlement_id,v_provider_status,v_payout_amount,v_currency_code,
      v_automatic,v_expected_arrival_date,p_provider_created_at,
      case when v_provider_status='paid' then p_provider_created_at else null end,p_provider_created_at
    ) returning * into v_batch;
  end if;

  for v_item_json in select value from jsonb_array_elements(p_event_data->'items')
  loop
    v_provider_balance_transaction_id := nullif(v_item_json->>'providerBalanceTransactionId','');
    v_provider_source_id := nullif(v_item_json->>'providerSourceId','');
    v_transaction_type := nullif(v_item_json->>'transactionType','');
    v_reporting_category := nullif(v_item_json->>'reportingCategory','');
    v_item_gross := (v_item_json->>'grossMinor')::bigint;
    v_item_fee := (v_item_json->>'feeMinor')::bigint;
    v_item_net := (v_item_json->>'netMinor')::bigint;
    v_item_status := nullif(v_item_json->>'providerStatus','');
    v_available_on := (v_item_json->>'availableOn')::date;
    if v_provider_balance_transaction_id is null or v_provider_balance_transaction_id !~ '^txn_[A-Za-z0-9]+$'
      or (v_provider_source_id is not null and v_provider_source_id !~ '^[A-Za-z]{2,12}_[A-Za-z0-9]+$')
      or v_transaction_type is null or length(v_transaction_type) not between 2 and 80
      or (v_reporting_category is not null and length(v_reporting_category) not between 2 and 120)
      or v_item_gross=0 or v_item_gross-v_item_fee<>v_item_net
      or upper(nullif(v_item_json->>'currencyCode',''))<>v_currency_code
      or v_item_status not in ('available','pending') or v_available_on is null then
      update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
        last_error_code='INVALID_PROVIDER_SETTLEMENT_ITEM',last_error_detail='A payout balance transaction failed canonical validation.'
      where id=v_event.id;
      return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','INVALID_PROVIDER_SETTLEMENT_ITEM');
    end if;

    v_matched_payment_id := null;
    if v_provider_source_id ~ '^ch_[A-Za-z0-9]+$'
      and v_transaction_type in ('charge','payment') and v_item_fee>=0 and v_item_net>0 then
      select p.* into v_payment from public.payment_attempts a join public.payments p on p.id=a.payment_id
      where a.provider_connection_id=v_connection.id and a.provider_charge_id=v_provider_source_id;
      if found and v_payment.organization_id=v_connection.organization_id
        and v_payment.currency_code=v_currency_code and v_payment.amount_minor=v_item_gross
        and (
          (v_payment.status='succeeded' and not exists (
            select 1 from public.reconciliation_matches rm where rm.payment_id=v_payment.id
          ))
          or exists (
            select 1 from public.reconciliation_matches rm
            join public.settlement_items matched_item on matched_item.id=rm.settlement_item_id
            where rm.payment_id=v_payment.id
              and matched_item.provider_balance_transaction_id=v_provider_balance_transaction_id
          )
        ) then
        v_matched_payment_id := v_payment.id;
      end if;
    end if;

    insert into public.settlement_items(
      organization_id,settlement_batch_id,provider_connection_id,payment_id,provider_balance_transaction_id,provider_source_id,
      transaction_type,reporting_category,gross_minor,fee_minor,net_minor,currency_code,provider_status,available_on
    ) values (
      v_connection.organization_id,v_batch.id,v_connection.id,v_matched_payment_id,v_provider_balance_transaction_id,v_provider_source_id,
      v_transaction_type,v_reporting_category,v_item_gross,v_item_fee,v_item_net,v_currency_code,v_item_status,v_available_on
    ) on conflict (provider_connection_id,provider_balance_transaction_id) do nothing;
    get diagnostics v_item_insert_count = row_count;
    select i.* into strict v_item from public.settlement_items i
    where i.provider_connection_id=v_connection.id and i.provider_balance_transaction_id=v_provider_balance_transaction_id;
    if v_item.settlement_batch_id<>v_batch.id or v_item.provider_source_id is distinct from v_provider_source_id
      or v_item.payment_id is distinct from v_matched_payment_id
      or v_item.transaction_type<>v_transaction_type or v_item.gross_minor<>v_item_gross
      or v_item.fee_minor<>v_item_fee or v_item.net_minor<>v_item_net or v_item.currency_code<>v_currency_code then
      update private.provider_webhook_events set processing_state='dead_letter',processed_at=now(),
        last_error_code='SETTLEMENT_ITEM_REPLAY_MISMATCH',last_error_detail='A provider balance transaction was replayed with different financial fields.'
      where id=v_event.id;
      return jsonb_build_object('outcome','failed','eventId',p_provider_event_id,'errorCode','SETTLEMENT_ITEM_REPLAY_MISMATCH');
    end if;

    if v_item_insert_count=1 and v_matched_payment_id is not null then
      insert into public.reconciliation_matches(
        organization_id,settlement_batch_id,settlement_item_id,payment_id,match_method,confidence,approval_status
      ) values (
        v_connection.organization_id,v_batch.id,v_item.id,v_matched_payment_id,'exact_provider_reference',1,'auto_approved'
      ) on conflict do nothing;
    end if;
  end loop;

  select count(*)::integer,coalesce(sum(i.gross_minor),0),coalesce(sum(i.fee_minor),0),coalesce(sum(i.net_minor),0),
    count(i.payment_id)::integer into v_item_count,v_gross_minor,v_fee_minor,v_net_minor,v_matched_count
  from public.settlement_items i where i.settlement_batch_id=v_batch.id;
  update public.settlement_batches set provider_status=v_provider_status,expected_arrival_date=v_expected_arrival_date,
    gross_minor=v_gross_minor,fee_minor=v_fee_minor,net_minor=v_net_minor,
    received_at=case when v_provider_status='paid' then coalesce(received_at,p_provider_created_at) else received_at end,
    last_provider_event_created_at=greatest(last_provider_event_created_at,p_provider_created_at)
  where id=v_batch.id returning * into v_batch;

  if v_provider_status in ('failed','canceled') then
    insert into public.reconciliation_exceptions(
      organization_id,settlement_batch_id,exception_type,expected_minor,actual_minor,currency_code,detail
    ) values (
      v_connection.organization_id,v_batch.id,'reversed_payout',v_payout_amount,0,v_currency_code,
      'Stripe reported that the payout failed or was canceled before settlement.'
    ) on conflict do nothing returning id into v_exception_id;
  elsif v_provider_status='paid' then
    if v_item_count=0 then
      insert into public.reconciliation_exceptions(
        organization_id,settlement_batch_id,exception_type,expected_minor,actual_minor,currency_code,detail
      ) values (
        v_connection.organization_id,v_batch.id,'missing_settlement',v_payout_amount,0,v_currency_code,
        'The paid payout did not include provider balance transactions for matching.'
      ) on conflict do nothing returning id into v_exception_id;
    end if;
    if v_net_minor<>v_payout_amount then
      insert into public.reconciliation_exceptions(
        organization_id,settlement_batch_id,exception_type,expected_minor,actual_minor,currency_code,detail
      ) values (
        v_connection.organization_id,v_batch.id,'amount_mismatch',v_payout_amount,v_net_minor,v_currency_code,
        'The payout amount does not equal the net of its imported provider balance transactions.'
      ) on conflict do nothing returning id into v_exception_id;
    end if;
    for v_item in select i.* from public.settlement_items i where i.settlement_batch_id=v_batch.id and i.payment_id is null order by i.id
    loop
      select p.* into v_payment from public.payment_attempts a join public.payments p on p.id=a.payment_id
      where a.provider_connection_id=v_connection.id and a.provider_charge_id=v_item.provider_source_id;
      if found and exists (select 1 from public.reconciliation_matches rm where rm.payment_id=v_payment.id) then
        insert into public.reconciliation_exceptions(
          organization_id,settlement_batch_id,settlement_item_id,payment_id,exception_type,
          expected_minor,actual_minor,currency_code,detail
        ) values (
          v_connection.organization_id,v_batch.id,v_item.id,v_payment.id,'duplicate',
          v_payment.amount_minor,v_item.gross_minor,v_currency_code,
          'The provider charge reference is already matched to another settlement item.'
        ) on conflict do nothing returning id into v_exception_id;
      elsif found then
        insert into public.reconciliation_exceptions(
          organization_id,settlement_batch_id,settlement_item_id,payment_id,exception_type,
          expected_minor,actual_minor,currency_code,detail
        ) values (
          v_connection.organization_id,v_batch.id,v_item.id,v_payment.id,'amount_mismatch',
          v_payment.amount_minor,v_item.gross_minor,v_currency_code,
          'The provider settlement item amount does not match the canonical Crecy payment.'
        ) on conflict do nothing returning id into v_exception_id;
      else
        insert into public.reconciliation_exceptions(
          organization_id,settlement_batch_id,settlement_item_id,exception_type,actual_minor,currency_code,detail
        ) values (
          v_connection.organization_id,v_batch.id,v_item.id,'unidentified_transfer',v_item.net_minor,v_currency_code,
          'No canonical Crecy payment matches the provider settlement item reference.'
        ) on conflict do nothing returning id into v_exception_id;
      end if;
    end loop;
  end if;

  select count(*)::integer into v_exception_count from public.reconciliation_exceptions e
  where e.settlement_batch_id=v_batch.id and e.status in ('open','escalated');
  if v_exception_count>0 then
    update public.settlement_batches set reconciliation_status='exception' where id=v_batch.id returning * into v_batch;
    update public.payments p set reconciliation_status='exception',version=version+1
    where p.id in (select e.payment_id from public.reconciliation_exceptions e
      where e.settlement_batch_id=v_batch.id and e.payment_id is not null and e.status in ('open','escalated'))
      and p.reconciliation_status<>'exception';
    insert into audit.audit_events(
      organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,reason,after_data
    ) select e.organization_id,'provider','reconciliation.exception_created','reconciliation_exception',e.id,
      v_correlation_id,e.exception_type,jsonb_build_object(
        'settlementId',e.settlement_batch_id,'paymentId',e.payment_id,'exceptionType',e.exception_type,
        'expectedMinor',e.expected_minor,'actualMinor',e.actual_minor,'currencyCode',e.currency_code
      ) from public.reconciliation_exceptions e where e.settlement_batch_id=v_batch.id
      and not exists (select 1 from audit.audit_events a where a.resource_type='reconciliation_exception' and a.resource_id=e.id);
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    select e.organization_id,'reconciliation.exception_created','reconciliation_exception',e.id,v_correlation_id,
      jsonb_build_object('settlementId',e.settlement_batch_id,'paymentId',e.payment_id,'exceptionType',e.exception_type,
        'expectedMinor',e.expected_minor,'actualMinor',e.actual_minor,'currencyCode',e.currency_code)
    from public.reconciliation_exceptions e where e.settlement_batch_id=v_batch.id
      and not exists (select 1 from private.outbox_events o where o.event_type='reconciliation.exception_created'
        and o.aggregate_type='reconciliation_exception' and o.aggregate_id=e.id);
  elsif v_provider_status='paid' and v_batch.journal_transaction_id is null then
    perform p.id from public.payments p join public.settlement_items i on i.payment_id=p.id
    where i.settlement_batch_id=v_batch.id order by p.id for update of p;
    select count(*)::integer into v_matched_count from public.reconciliation_matches m
    where m.settlement_batch_id=v_batch.id and m.approval_status in ('auto_approved','approved');
    if v_matched_count<>v_item_count then
      raise exception using errcode='23514',message='SETTLEMENT_MATCH_COUNT_MISMATCH';
    end if;

    insert into public.ledger_accounts(organization_id,accounting_book_id,account_code,account_name,account_class,normal_balance)
    values (v_batch.organization_id,v_batch.accounting_book_id,'1030','Stripe payment clearing','asset','debit')
    on conflict (accounting_book_id,account_code) do nothing;
    select a.id into v_clearing_account_id from public.ledger_accounts a
    where a.accounting_book_id=v_batch.accounting_book_id and a.account_code='1030'
      and a.account_class='asset' and a.normal_balance='debit' and a.status='active';
    if not found then raise exception using errcode='23514',message='LEDGER_ACCOUNT_CONFLICT',detail='1030'; end if;
    insert into public.ledger_accounts(organization_id,accounting_book_id,account_code,account_name,account_class,normal_balance)
    values (v_batch.organization_id,v_batch.accounting_book_id,'1040','Operating cash clearing','asset','debit')
    on conflict (accounting_book_id,account_code) do nothing;
    select a.id into v_cash_account_id from public.ledger_accounts a
    where a.accounting_book_id=v_batch.accounting_book_id and a.account_code='1040'
      and a.account_class='asset' and a.normal_balance='debit' and a.status='active';
    if not found then raise exception using errcode='23514',message='LEDGER_ACCOUNT_CONFLICT',detail='1040'; end if;
    insert into public.ledger_accounts(organization_id,accounting_book_id,account_code,account_name,account_class,normal_balance)
    values (v_batch.organization_id,v_batch.accounting_book_id,'6100','Payment processing fees','expense','debit')
    on conflict (accounting_book_id,account_code) do nothing;
    select a.id into v_fee_account_id from public.ledger_accounts a
    where a.accounting_book_id=v_batch.accounting_book_id and a.account_code='6100'
      and a.account_class='expense' and a.normal_balance='debit' and a.status='active';
    if not found then raise exception using errcode='23514',message='LEDGER_ACCOUNT_CONFLICT',detail='6100'; end if;

    v_journal_transaction_id := gen_random_uuid();
    insert into public.journal_transactions(
      id,organization_id,operating_entity_id,accounting_book_id,transaction_type,effective_date,source_type,source_id,
      idempotency_key,currency_code,correlation_id,metadata
    ) values (
      v_journal_transaction_id,v_batch.organization_id,v_batch.operating_entity_id,v_batch.accounting_book_id,
      'provider_settlement',coalesce(v_batch.expected_arrival_date,(p_provider_created_at at time zone 'UTC')::date),
      'settlement_batch',v_batch.id,'stripe-settlement:'||v_batch.id::text,v_batch.currency_code,v_correlation_id,
      jsonb_build_object('settlementId',v_batch.id,'publicReference',v_batch.public_reference,
        'grossMinor',v_batch.gross_minor,'feeMinor',v_batch.fee_minor,'netMinor',v_batch.net_minor)
    );
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,debit_minor,memo
    ) values (
      v_journal_transaction_id,v_batch.organization_id,v_batch.accounting_book_id,v_cash_account_id,v_batch.net_minor,
      'Stripe payout received into operating cash clearing'
    );
    if v_batch.fee_minor>0 then
      insert into public.journal_entries(
        journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,debit_minor,memo
      ) values (
        v_journal_transaction_id,v_batch.organization_id,v_batch.accounting_book_id,v_fee_account_id,v_batch.fee_minor,
        'Stripe processing fees recognized at settlement'
      );
    end if;
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,credit_minor,memo
    ) values (
      v_journal_transaction_id,v_batch.organization_id,v_batch.accounting_book_id,v_clearing_account_id,v_batch.gross_minor,
      'Stripe payment clearing released by provider settlement'
    );
    update public.settlement_batches set reconciliation_status='reconciled',journal_transaction_id=v_journal_transaction_id
    where id=v_batch.id returning * into v_batch;
    update public.payments p set reconciliation_status='reconciled',version=version+1
    where p.id in (select i.payment_id from public.settlement_items i where i.settlement_batch_id=v_batch.id)
      and p.reconciliation_status<>'reconciled';
    insert into audit.audit_events(
      organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,reason,after_data
    ) values (
      v_batch.organization_id,'provider','settlement.received','settlement_batch',v_batch.id,v_correlation_id,
      'Exact provider-reference settlement match',jsonb_build_object(
        'publicReference',v_batch.public_reference,'grossMinor',v_batch.gross_minor,'feeMinor',v_batch.fee_minor,
        'netMinor',v_batch.net_minor,'currencyCode',v_batch.currency_code,'journalTransactionId',v_journal_transaction_id
      )
    );
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (
      v_batch.organization_id,'settlement.received','settlement_batch',v_batch.id,v_correlation_id,
      jsonb_build_object('settlementId',v_batch.id,'publicReference',v_batch.public_reference,
        'grossMinor',v_batch.gross_minor,'feeMinor',v_batch.fee_minor,'netMinor',v_batch.net_minor,
        'currencyCode',v_batch.currency_code,'journalTransactionId',v_journal_transaction_id)
    );
    insert into audit.audit_events(
      organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,reason,after_data
    ) select p.organization_id,'provider','payment.reconciliation_updated','payment',p.id,v_correlation_id,
      'Exact provider settlement match',jsonb_build_object(
        'paymentId',p.id,'settlementId',v_batch.id,'reconciliationStatus','reconciled'
      ) from public.payments p join public.settlement_items i on i.payment_id=p.id where i.settlement_batch_id=v_batch.id;
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    select p.organization_id,'payment.reconciliation_updated','payment',p.id,v_correlation_id,
      jsonb_build_object('paymentId',p.id,'settlementId',v_batch.id,'reconciliationStatus','reconciled')
    from public.payments p join public.settlement_items i on i.payment_id=p.id where i.settlement_batch_id=v_batch.id;
  end if;

  update private.provider_webhook_events set processing_state='processed',processed_at=now() where id=v_event.id;
  return jsonb_build_object(
    'outcome','processed','eventId',p_provider_event_id,'settlementId',v_batch.id,
    'publicReference',v_batch.public_reference,'providerStatus',v_batch.provider_status,
    'reconciliationStatus',v_batch.reconciliation_status,'itemCount',v_item_count,
    'matchedCount',v_matched_count,'exceptionCount',v_exception_count,
    'journalTransactionId',v_batch.journal_transaction_id
  );
exception
  when numeric_value_out_of_range or invalid_text_representation or datetime_field_overflow then
    raise exception using errcode='23514',message='INVALID_PROVIDER_SETTLEMENT_EVENT_DATA';
end;
$$;
revoke all on function public.process_stripe_settlement_webhook(text,text,text,text,timestamptz,boolean,jsonb)
from public,anon,authenticated;
grant execute on function public.process_stripe_settlement_webhook(text,text,text,text,timestamptz,boolean,jsonb)
to service_role;

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
    'reconciliationStatus',pay.reconciliation_status,'receivedAt',pay.received_at,
    'receiptDocumentId',pay.receipt_document_id
  ) order by coalesce(pay.received_at,pay.created_at) desc),'[]'::jsonb))
  from public.payments pay
  join public.tenancies t on t.id=pay.tenancy_id
  join public.properties p on p.id=t.property_id
  join public.units u on u.id=t.unit_id
  where pay.status<>'created' and private.is_resident_for_tenancy(t.id)
$$;
revoke all on function public.get_resident_payment_history() from public,anon;
grant execute on function public.get_resident_payment_history() to authenticated;

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
      'exceptionId',e.id,'settlementId',e.settlement_batch_id,'settlementReference',b.public_reference,
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

create or replace function public.get_payment_settlement_history(p_payment_id uuid)
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
    'settlements',coalesce((select jsonb_agg(jsonb_build_object(
      'settlementId',b.id,'publicReference',b.public_reference,'providerStatus',b.provider_status,
      'reconciliationStatus',b.reconciliation_status,'grossMinor',i.gross_minor,'feeMinor',i.fee_minor,
      'netMinor',i.net_minor,'currencyCode',i.currency_code,'expectedArrivalDate',b.expected_arrival_date,
      'receivedAt',b.received_at
    ) order by coalesce(b.received_at,b.provider_created_at) desc,b.id desc)
    from public.settlement_items i join public.settlement_batches b on b.id=i.settlement_batch_id
    where i.payment_id=p.id),'[]'::jsonb)
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
revoke all on function public.get_payment_settlement_history(uuid) from public,anon;
grant execute on function public.get_payment_settlement_history(uuid) to authenticated;

commit;
