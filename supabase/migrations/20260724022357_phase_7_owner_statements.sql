begin;

create schema if not exists reporting;

insert into public.plan_entitlements(plan_code,feature_code,enabled) values
  ('free','portal.owner.standard',false),
  ('starter','portal.owner.standard',false),
  ('growth','portal.owner.standard',true),
  ('pro','portal.owner.standard',true),
  ('free','portal.owner.advanced',false),
  ('starter','portal.owner.advanced',false),
  ('growth','portal.owner.advanced',false),
  ('pro','portal.owner.advanced',true)
on conflict (plan_code,feature_code) do update set enabled=excluded.enabled;

create or replace function private.has_plan_entitlement(
  target_organization uuid,
  target_feature text,
  allow_restricted boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_subscriptions s
    join public.plan_entitlements e
      on e.plan_code=s.plan_code
     and e.feature_code=target_feature
     and e.enabled
    where s.organization_id=target_organization
      and (
        s.status in ('trialing','active','past_due')
        or (allow_restricted and s.status='restricted')
      )
  );
$$;
revoke all on function private.has_plan_entitlement(uuid,text,boolean)
  from public,anon,authenticated,service_role;
grant execute on function private.has_plan_entitlement(uuid,text,boolean) to authenticated;

alter table public.journal_entries
  add column owner_entity_id uuid references public.owner_entities(id) on delete restrict;
alter table public.journal_entries
  add constraint journal_entries_owner_org_fk
  foreign key (organization_id,owner_entity_id)
  references public.owner_entities(organization_id,id) on delete restrict;
create index journal_entries_owner_idx
  on public.journal_entries(owner_entity_id,accounting_book_id)
  where owner_entity_id is not null;

create table reporting.owner_statement_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  accounting_book_id uuid not null references public.accounting_books(id) on delete restrict,
  owner_entity_id uuid not null references public.owner_entities(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  currency_code char(3) not null check (currency_code in ('USD','CAD','MXN')),
  income_minor bigint not null,
  expense_minor bigint not null,
  management_fee_minor bigint not null default 0,
  net_owner_position_minor bigint not null,
  snapshot_data jsonb not null,
  finalized_at timestamptz not null default now(),
  finalized_by uuid not null references auth.users(id) on delete restrict,
  sha256_hex text not null check (sha256_hex ~ '^[0-9a-f]{64}$'),
  statement_series_id uuid not null default gen_random_uuid(),
  version_number integer not null default 1 check (version_number > 0),
  supersedes_snapshot_id uuid,
  correction_reason text check (correction_reason is null or length(trim(correction_reason)) between 3 and 500),
  pdf_document_version_id uuid,
  csv_document_version_id uuid,
  unique (organization_id,id),
  unique (owner_entity_id,property_id,period_start,period_end,version_number),
  unique (statement_series_id,version_number),
  foreign key (organization_id,accounting_book_id)
    references public.accounting_books(organization_id,id) on delete restrict,
  foreign key (organization_id,owner_entity_id)
    references public.owner_entities(organization_id,id) on delete restrict,
  foreign key (organization_id,property_id)
    references public.properties(organization_id,id) on delete restrict,
  foreign key (organization_id,supersedes_snapshot_id)
    references reporting.owner_statement_snapshots(organization_id,id) on delete restrict,
  foreign key (organization_id,pdf_document_version_id)
    references public.document_versions(organization_id,id) on delete restrict,
  foreign key (organization_id,csv_document_version_id)
    references public.document_versions(organization_id,id) on delete restrict,
  check (period_end >= period_start),
  check (
    (version_number=1 and supersedes_snapshot_id is null and correction_reason is null)
    or
    (version_number>1 and supersedes_snapshot_id is not null and correction_reason is not null)
  )
);
create index owner_statement_owner_period_idx
  on reporting.owner_statement_snapshots(owner_entity_id,period_end desc,finalized_at desc);
create index owner_statement_property_period_idx
  on reporting.owner_statement_snapshots(property_id,period_end desc,finalized_at desc);
create index owner_statement_book_period_idx
  on reporting.owner_statement_snapshots(accounting_book_id,period_start,period_end);
create index owner_statement_supersedes_idx
  on reporting.owner_statement_snapshots(supersedes_snapshot_id)
  where supersedes_snapshot_id is not null;
create index owner_statement_pdf_version_idx
  on reporting.owner_statement_snapshots(pdf_document_version_id)
  where pdf_document_version_id is not null;
create index owner_statement_csv_version_idx
  on reporting.owner_statement_snapshots(csv_document_version_id)
  where csv_document_version_id is not null;

create or replace function private.prevent_owner_statement_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode='55000',message='OWNER_STATEMENT_APPEND_ONLY';
end;
$$;
revoke all on function private.prevent_owner_statement_mutation() from public,anon,authenticated,service_role;
create trigger owner_statement_snapshots_append_only
before update or delete on reporting.owner_statement_snapshots
for each row execute function private.prevent_owner_statement_mutation();

alter table reporting.owner_statement_snapshots enable row level security;
grant execute on function private.is_owner_entity(uuid) to authenticated;
create policy owner_statement_scoped_read
on reporting.owner_statement_snapshots
for select to authenticated
using (
  (
    (select private.is_owner_entity(owner_entity_id))
    and (select private.has_plan_entitlement(organization_id,'portal.owner.standard',true))
  )
  or (
    (select private.has_property_access(property_id,'owner.manage'))
    and (select private.has_property_access(property_id,'finance.manage'))
    and (select private.has_plan_entitlement(organization_id,'portal.owner.standard',true))
  )
);

revoke all on schema reporting from public,anon;
grant usage on schema reporting to authenticated,service_role;
revoke all on table reporting.owner_statement_snapshots from anon,authenticated;
grant select on table reporting.owner_statement_snapshots to authenticated;
grant all on table reporting.owner_statement_snapshots to service_role;

create or replace function private.calculate_owner_statement(
  p_organization_id uuid,
  p_accounting_book_id uuid,
  p_owner_entity_id uuid,
  p_property_id uuid,
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_currency_code char(3);
  v_property_name text;
  v_owner_name text;
  v_snapshot_data jsonb;
  v_sha256_hex text;
  v_income_minor bigint;
  v_expense_minor bigint;
  v_management_fee_minor bigint;
  v_net_owner_position_minor bigint;
  v_lines jsonb;
  v_ownership_periods jsonb;
  v_source_entry_count integer;
  v_source_transaction_count integer;
  v_ledger_cutoff_posted_at timestamptz;
begin
  if p_period_start is null or p_period_end is null or p_period_end<p_period_start then
    raise exception using errcode='22023',message='INVALID_STATEMENT_PERIOD';
  end if;
  if p_period_end-p_period_start>370 then
    raise exception using errcode='22023',message='STATEMENT_PERIOD_TOO_LONG';
  end if;

  select b.functional_currency_code,p.name,oe.display_name
    into v_currency_code,v_property_name,v_owner_name
  from public.properties p
  join public.accounting_books b
    on b.organization_id=p.organization_id
   and b.id=p.accounting_book_id
  join public.owner_entities oe
    on oe.organization_id=p.organization_id
   and oe.id=p_owner_entity_id
   and oe.status='active'
  where p.organization_id=p_organization_id
    and p.id=p_property_id
    and p.accounting_book_id=p_accounting_book_id;
  if not found then
    raise exception using errcode='P0002',message='OWNER_STATEMENT_CONTEXT_NOT_FOUND';
  end if;

  if not exists (
    select 1
    from public.ownership_interests oi
    where oi.organization_id=p_organization_id
      and oi.property_id=p_property_id
      and oi.owner_entity_id=p_owner_entity_id
      and oi.effective_from<=p_period_end
      and (oi.effective_to is null or oi.effective_to>=p_period_start)
  ) then
    raise exception using errcode='23514',message='OWNER_INTEREST_NOT_EFFECTIVE';
  end if;

  if exists (
    with ledger_dates as (
      select distinct jt.effective_date
      from public.journal_entries je
      join public.journal_transactions jt
        on jt.organization_id=je.organization_id
       and jt.id=je.journal_transaction_id
       and jt.accounting_book_id=je.accounting_book_id
      join public.ledger_accounts la
        on la.organization_id=je.organization_id
       and la.id=je.ledger_account_id
       and la.accounting_book_id=je.accounting_book_id
      where je.organization_id=p_organization_id
        and je.accounting_book_id=p_accounting_book_id
        and je.property_id=p_property_id
        and jt.effective_date between p_period_start and p_period_end
        and la.account_class in ('revenue','contra_revenue','expense')
    )
    select 1
    from ledger_dates d
    left join public.ownership_interests oi
      on oi.organization_id=p_organization_id
     and oi.property_id=p_property_id
     and oi.effective_from<=d.effective_date
     and (oi.effective_to is null or oi.effective_to>=d.effective_date)
    group by d.effective_date
    having coalesce(sum(oi.ownership_fraction),0)<>1
       or count(oi.id)<>count(distinct oi.owner_entity_id)
  ) then
    raise exception using errcode='23514',message='OWNERSHIP_ALLOCATION_INCOMPLETE';
  end if;

  with source_lines as (
    select
      je.id as entry_id,
      jt.id as transaction_id,
      jt.effective_date,
      jt.posted_at,
      la.account_code,
      la.account_name,
      la.account_class,
      case
        when la.account_class in ('revenue','contra_revenue') then je.credit_minor-je.debit_minor
        else je.debit_minor-je.credit_minor
      end as signed_minor
    from public.journal_entries je
    join public.journal_transactions jt
      on jt.organization_id=je.organization_id
     and jt.id=je.journal_transaction_id
     and jt.accounting_book_id=je.accounting_book_id
    join public.ledger_accounts la
      on la.organization_id=je.organization_id
     and la.id=je.ledger_account_id
     and la.accounting_book_id=je.accounting_book_id
    where je.organization_id=p_organization_id
      and je.accounting_book_id=p_accounting_book_id
      and je.property_id=p_property_id
      and jt.effective_date between p_period_start and p_period_end
      and la.account_class in ('revenue','contra_revenue','expense')
  ),
  allocation_basis as (
    select
      sl.*,
      oi.owner_entity_id,
      floor(abs(sl.signed_minor)::numeric*oi.ownership_fraction)::bigint as base_minor,
      abs(sl.signed_minor)::numeric*oi.ownership_fraction
        - floor(abs(sl.signed_minor)::numeric*oi.ownership_fraction) as fractional_minor
    from source_lines sl
    join public.ownership_interests oi
      on oi.organization_id=p_organization_id
     and oi.property_id=p_property_id
     and oi.effective_from<=sl.effective_date
     and (oi.effective_to is null or oi.effective_to>=sl.effective_date)
  ),
  ranked_allocations as (
    select
      ab.*,
      row_number() over (
        partition by ab.entry_id
        order by ab.fractional_minor desc,ab.owner_entity_id
      ) as remainder_rank,
      abs(ab.signed_minor)-sum(ab.base_minor) over (partition by ab.entry_id) as remainder_minor
    from allocation_basis ab
  ),
  target_allocations as (
    select
      ra.*,
      sign(ra.signed_minor)::bigint*(
        ra.base_minor
        + case when ra.remainder_rank<=ra.remainder_minor then 1 else 0 end
      ) as allocated_minor
    from ranked_allocations ra
    where ra.owner_entity_id=p_owner_entity_id
  ),
  grouped_lines as (
    select
      account_code,
      account_name,
      account_class,
      sum(allocated_minor)::bigint as amount_minor,
      count(distinct transaction_id)::integer as transaction_count
    from target_allocations
    group by account_code,account_name,account_class
  ),
  totals as (
    select
      coalesce(sum(amount_minor) filter (
        where account_class in ('revenue','contra_revenue') and account_code<>'4100'
      ),0)::bigint as income_minor,
      coalesce(sum(amount_minor) filter (where account_class='expense'),0)::bigint as expense_minor,
      coalesce(sum(amount_minor) filter (where account_code='4100'),0)::bigint as management_fee_minor
    from grouped_lines
  )
  select
    t.income_minor,
    t.expense_minor,
    t.management_fee_minor,
    t.income_minor-t.expense_minor-t.management_fee_minor,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'accountCode',gl.account_code,
        'accountName',gl.account_name,
        'category',case
          when gl.account_code='4100' then 'management_fee'
          when gl.account_class='expense' then 'expense'
          else 'income'
        end,
        'amountMinor',gl.amount_minor,
        'transactionCount',gl.transaction_count
      ) order by gl.account_code)
      from grouped_lines gl
    ),'[]'::jsonb),
    (select count(*)::integer from source_lines),
    (select count(distinct transaction_id)::integer from source_lines),
    (select max(posted_at) from source_lines)
  into
    v_income_minor,
    v_expense_minor,
    v_management_fee_minor,
    v_net_owner_position_minor,
    v_lines,
    v_source_entry_count,
    v_source_transaction_count,
    v_ledger_cutoff_posted_at
  from totals t;

  select coalesce(jsonb_agg(jsonb_build_object(
    'effectiveFrom',greatest(oi.effective_from,p_period_start),
    'effectiveTo',least(coalesce(oi.effective_to,p_period_end),p_period_end),
    'ownershipFraction',oi.ownership_fraction
  ) order by oi.effective_from),'[]'::jsonb)
  into v_ownership_periods
  from public.ownership_interests oi
  where oi.organization_id=p_organization_id
    and oi.property_id=p_property_id
    and oi.owner_entity_id=p_owner_entity_id
    and oi.effective_from<=p_period_end
    and (oi.effective_to is null or oi.effective_to>=p_period_start);

  v_snapshot_data := jsonb_build_object(
    'schemaVersion',1,
    'calculationMethod','posted_ledger_effective_ownership_largest_remainder_v1',
    'organizationId',p_organization_id,
    'accountingBookId',p_accounting_book_id,
    'ownerEntityId',p_owner_entity_id,
    'ownerName',v_owner_name,
    'propertyId',p_property_id,
    'propertyName',v_property_name,
    'periodStart',p_period_start,
    'periodEnd',p_period_end,
    'currencyCode',v_currency_code,
    'incomeMinor',v_income_minor,
    'expenseMinor',v_expense_minor,
    'managementFeeMinor',v_management_fee_minor,
    'netOwnerPositionMinor',v_net_owner_position_minor,
    'sourceEntryCount',v_source_entry_count,
    'sourceTransactionCount',v_source_transaction_count,
    'ledgerCutoffPostedAt',v_ledger_cutoff_posted_at,
    'ownershipPeriods',v_ownership_periods,
    'lines',v_lines
  );
  v_sha256_hex := encode(sha256(convert_to(v_snapshot_data::text,'UTF8')),'hex');

  return jsonb_build_object(
    'organizationId',p_organization_id,
    'accountingBookId',p_accounting_book_id,
    'ownerEntityId',p_owner_entity_id,
    'ownerName',v_owner_name,
    'propertyId',p_property_id,
    'propertyName',v_property_name,
    'periodStart',p_period_start,
    'periodEnd',p_period_end,
    'currencyCode',v_currency_code,
    'incomeMinor',v_income_minor,
    'expenseMinor',v_expense_minor,
    'managementFeeMinor',v_management_fee_minor,
    'netOwnerPositionMinor',v_net_owner_position_minor,
    'sourceEntryCount',v_source_entry_count,
    'sourceTransactionCount',v_source_transaction_count,
    'ledgerCutoffPostedAt',v_ledger_cutoff_posted_at,
    'ownershipPeriods',v_ownership_periods,
    'lines',v_lines,
    'sha256Hex',v_sha256_hex,
    'snapshotData',v_snapshot_data
  );
end;
$$;
revoke all on function private.calculate_owner_statement(uuid,uuid,uuid,uuid,date,date)
  from public,anon,authenticated,service_role;

create or replace function public.get_owner_statement_draft(
  p_organization_id uuid,
  p_accounting_book_id uuid,
  p_owner_entity_id uuid,
  p_property_id uuid,
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if not private.has_property_access(p_property_id,'owner.manage')
     or not private.has_property_access(p_property_id,'finance.manage') then
    raise exception using errcode='42501',message='OWNER_STATEMENT_SCOPE_DENIED';
  end if;
  if not private.has_plan_entitlement(p_organization_id,'portal.owner.standard',true) then
    raise exception using errcode='42501',message='OWNER_STATEMENT_PLAN_UNAVAILABLE';
  end if;
  return private.calculate_owner_statement(
    p_organization_id,p_accounting_book_id,p_owner_entity_id,p_property_id,p_period_start,p_period_end
  )-'snapshotData';
end;
$$;
revoke all on function public.get_owner_statement_draft(uuid,uuid,uuid,uuid,date,date)
  from public,anon,authenticated,service_role;
grant execute on function public.get_owner_statement_draft(uuid,uuid,uuid,uuid,date,date)
  to authenticated;

create or replace function public.finalize_owner_statement(
  p_organization_id uuid,
  p_accounting_book_id uuid,
  p_owner_entity_id uuid,
  p_property_id uuid,
  p_period_start date,
  p_period_end date,
  p_expected_calculation_hash text,
  p_idempotency_key text,
  p_correction_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_scope text;
  v_previous private.idempotency_records%rowtype;
  v_request_hash text;
  v_calculation jsonb;
  v_latest reporting.owner_statement_snapshots%rowtype;
  v_snapshot_id uuid := gen_random_uuid();
  v_series_id uuid;
  v_version integer;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_expected_calculation_hash is null
     or p_expected_calculation_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='INVALID_CALCULATION_HASH';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then
    raise exception using errcode='22023',message='IDEMPOTENCY_KEY_REQUIRED';
  end if;
  if not private.has_property_access(p_property_id,'owner.manage')
     or not private.has_property_access(p_property_id,'finance.manage') then
    raise exception using errcode='42501',message='OWNER_STATEMENT_SCOPE_DENIED';
  end if;
  if not private.has_plan_entitlement(p_organization_id,'portal.owner.standard',false) then
    raise exception using errcode='42501',message='OWNER_STATEMENT_PLAN_UNAVAILABLE';
  end if;

  perform 1
  from public.properties p
  where p.id=p_property_id
    and p.organization_id=p_organization_id
    and p.accounting_book_id=p_accounting_book_id;
  if not found then
    raise exception using errcode='P0002',message='OWNER_STATEMENT_CONTEXT_NOT_FOUND';
  end if;

  v_actor_scope := 'user:'||v_actor_id::text;
  v_request_hash := encode(sha256(convert_to(concat_ws(
    '|',p_organization_id,p_accounting_book_id,p_owner_entity_id,p_property_id,
    p_period_start,p_period_end,p_expected_calculation_hash,coalesce(trim(p_correction_reason),'')
  ),'UTF8')),'hex');

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',p_organization_id,v_actor_scope,'FinalizeOwnerStatement',trim(p_idempotency_key)
  ),0));
  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=p_organization_id
    and r.actor_scope=v_actor_scope
    and r.route='FinalizeOwnerStatement'
    and r.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then
      return v_previous.response_body;
    end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  perform 1
  from public.accounting_books b
  where b.id=p_accounting_book_id
    and b.organization_id=p_organization_id
  for update;

  v_calculation := private.calculate_owner_statement(
    p_organization_id,p_accounting_book_id,p_owner_entity_id,p_property_id,p_period_start,p_period_end
  );
  if v_calculation->>'sha256Hex'<>p_expected_calculation_hash then
    raise exception using errcode='40001',message='OWNER_STATEMENT_CALCULATION_CHANGED';
  end if;

  select * into v_latest
  from reporting.owner_statement_snapshots s
  where s.organization_id=p_organization_id
    and s.accounting_book_id=p_accounting_book_id
    and s.owner_entity_id=p_owner_entity_id
    and s.property_id=p_property_id
    and s.period_start=p_period_start
    and s.period_end=p_period_end
  order by s.version_number desc
  limit 1
  for update;

  if found then
    if v_latest.sha256_hex=p_expected_calculation_hash then
      raise exception using errcode='55000',message='OWNER_STATEMENT_ALREADY_FINALIZED';
    end if;
    if p_correction_reason is null
       or length(trim(p_correction_reason))<3
       or length(trim(p_correction_reason))>500 then
      raise exception using errcode='23514',message='OWNER_STATEMENT_CORRECTION_REASON_REQUIRED';
    end if;
    v_series_id := v_latest.statement_series_id;
    v_version := v_latest.version_number+1;
  else
    v_series_id := gen_random_uuid();
    v_version := 1;
    p_correction_reason := null;
  end if;

  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,request_hash,expires_at
  ) values (
    p_organization_id,v_actor_id,v_actor_scope,'FinalizeOwnerStatement',
    trim(p_idempotency_key),v_request_hash,now()+interval '24 hours'
  );

  insert into reporting.owner_statement_snapshots(
    id,organization_id,accounting_book_id,owner_entity_id,property_id,
    period_start,period_end,currency_code,income_minor,expense_minor,
    management_fee_minor,net_owner_position_minor,snapshot_data,
    finalized_by,sha256_hex,statement_series_id,version_number,
    supersedes_snapshot_id,correction_reason
  ) values (
    v_snapshot_id,p_organization_id,p_accounting_book_id,p_owner_entity_id,p_property_id,
    p_period_start,p_period_end,(v_calculation->>'currencyCode')::char(3),
    (v_calculation->>'incomeMinor')::bigint,(v_calculation->>'expenseMinor')::bigint,
    (v_calculation->>'managementFeeMinor')::bigint,(v_calculation->>'netOwnerPositionMinor')::bigint,
    v_calculation->'snapshotData',v_actor_id,p_expected_calculation_hash,
    v_series_id,v_version,v_latest.id,nullif(trim(p_correction_reason),'')
  );

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,
    correlation_id,reason,after_data
  ) values (
    p_organization_id,v_actor_id,'user','owner_statement.finalized','owner_statement_snapshot',
    v_snapshot_id,v_correlation_id,nullif(trim(p_correction_reason),''),
    jsonb_build_object(
      'ownerEntityId',p_owner_entity_id,
      'propertyId',p_property_id,
      'periodStart',p_period_start,
      'periodEnd',p_period_end,
      'versionNumber',v_version,
      'sha256Hex',p_expected_calculation_hash
    )
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values
    (
      p_organization_id,'owner_statement.finalized','owner_statement_snapshot',v_snapshot_id,
      v_correlation_id,jsonb_build_object(
        'snapshotId',v_snapshot_id,
        'ownerId',p_owner_entity_id,
        'propertyId',p_property_id,
        'period',jsonb_build_object('start',p_period_start,'end',p_period_end),
        'hash',p_expected_calculation_hash,
        'versionNumber',v_version
      )
    ),
    (
      p_organization_id,'notification.requested','owner_statement_snapshot',v_snapshot_id,
      v_correlation_id,jsonb_build_object(
        'recipientType','owner_entity',
        'recipientId',p_owner_entity_id,
        'templateCode','owner_statement_finalized',
        'resourceType','owner_statement_snapshot',
        'resourceId',v_snapshot_id
      )
    );

  v_response := jsonb_build_object(
    'statementSnapshotId',v_snapshot_id,
    'statementSeriesId',v_series_id,
    'versionNumber',v_version,
    'currencyCode',v_calculation->>'currencyCode',
    'incomeMinor',(v_calculation->>'incomeMinor')::bigint,
    'expenseMinor',(v_calculation->>'expenseMinor')::bigint,
    'managementFeeMinor',(v_calculation->>'managementFeeMinor')::bigint,
    'netOwnerPositionMinor',(v_calculation->>'netOwnerPositionMinor')::bigint,
    'sha256Hex',p_expected_calculation_hash
  );
  update private.idempotency_records r
  set state='completed',response_status=201,response_body=v_response,
      resource_type='owner_statement_snapshot',resource_id=v_snapshot_id,completed_at=now()
  where r.organization_id=p_organization_id
    and r.actor_scope=v_actor_scope
    and r.route='FinalizeOwnerStatement'
    and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;
revoke all on function public.finalize_owner_statement(uuid,uuid,uuid,uuid,date,date,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.finalize_owner_statement(uuid,uuid,uuid,uuid,date,date,text,text,text)
  to authenticated;

create or replace function public.get_owner_statement_workspace()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'statementSnapshotId',s.id,
      'statementSeriesId',s.statement_series_id,
      'versionNumber',s.version_number,
      'ownerEntityId',s.owner_entity_id,
      'ownerName',s.snapshot_data->>'ownerName',
      'propertyId',s.property_id,
      'propertyName',s.snapshot_data->>'propertyName',
      'periodStart',s.period_start,
      'periodEnd',s.period_end,
      'currencyCode',s.currency_code,
      'incomeMinor',s.income_minor,
      'expenseMinor',s.expense_minor,
      'managementFeeMinor',s.management_fee_minor,
      'netOwnerPositionMinor',s.net_owner_position_minor,
      'finalizedAt',s.finalized_at,
      'sha256Hex',s.sha256_hex
    ) order by s.period_end desc,s.finalized_at desc),'[]'::jsonb)
  )
  from reporting.owner_statement_snapshots s
  where (select auth.uid()) is not null
    and private.is_owner_entity(s.owner_entity_id)
    and private.has_plan_entitlement(s.organization_id,'portal.owner.standard',true);
$$;
revoke all on function public.get_owner_statement_workspace()
  from public,anon,authenticated,service_role;
grant execute on function public.get_owner_statement_workspace() to authenticated;

create or replace function public.get_operator_owner_statement_workspace()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select
      oi.organization_id,
      oi.owner_entity_id,
      oe.display_name as owner_name,
      oi.property_id,
      p.name as property_name,
      p.accounting_book_id,
      b.functional_currency_code as currency_code,
      min(oi.effective_from) as effective_from,
      case when bool_or(oi.effective_to is null) then null else max(oi.effective_to) end as effective_to
    from public.ownership_interests oi
    join public.owner_entities oe
      on oe.organization_id=oi.organization_id
     and oe.id=oi.owner_entity_id
     and oe.status='active'
    join public.properties p
      on p.organization_id=oi.organization_id
     and p.id=oi.property_id
    join public.accounting_books b
      on b.organization_id=p.organization_id
     and b.id=p.accounting_book_id
    where (select auth.uid()) is not null
      and private.has_property_access(oi.property_id,'owner.manage')
      and private.has_property_access(oi.property_id,'finance.manage')
      and private.has_plan_entitlement(oi.organization_id,'portal.owner.standard',true)
    group by
      oi.organization_id,oi.owner_entity_id,oe.display_name,oi.property_id,p.name,
      p.accounting_book_id,b.functional_currency_code
  )
  select jsonb_build_object(
    'owners',coalesce(jsonb_agg(jsonb_build_object(
      'organizationId',e.organization_id,
      'ownerEntityId',e.owner_entity_id,
      'ownerName',e.owner_name,
      'propertyId',e.property_id,
      'propertyName',e.property_name,
      'accountingBookId',e.accounting_book_id,
      'currencyCode',e.currency_code,
      'effectiveFrom',e.effective_from,
      'effectiveTo',e.effective_to,
      'latestStatement',case when s.id is null then null else jsonb_build_object(
        'statementSnapshotId',s.id,
        'periodStart',s.period_start,
        'periodEnd',s.period_end,
        'versionNumber',s.version_number,
        'netOwnerPositionMinor',s.net_owner_position_minor,
        'finalizedAt',s.finalized_at
      ) end
    ) order by e.property_name,e.owner_name),'[]'::jsonb)
  )
  from eligible e
  left join lateral (
    select latest.*
    from reporting.owner_statement_snapshots latest
    where latest.organization_id=e.organization_id
      and latest.accounting_book_id=e.accounting_book_id
      and latest.owner_entity_id=e.owner_entity_id
      and latest.property_id=e.property_id
    order by latest.period_end desc,latest.version_number desc
    limit 1
  ) s on true;
$$;
revoke all on function public.get_operator_owner_statement_workspace()
  from public,anon,authenticated,service_role;
grant execute on function public.get_operator_owner_statement_workspace() to authenticated;

create or replace function public.get_owner_statement_detail(p_statement_snapshot_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_statement reporting.owner_statement_snapshots%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  select * into v_statement
  from reporting.owner_statement_snapshots s
  where s.id=p_statement_snapshot_id
    and (
      private.is_owner_entity(s.owner_entity_id)
      or (
        private.has_property_access(s.property_id,'owner.manage')
        and private.has_property_access(s.property_id,'finance.manage')
      )
    )
    and private.has_plan_entitlement(s.organization_id,'portal.owner.standard',true);
  if not found then
    raise exception using errcode='P0002',message='OWNER_STATEMENT_NOT_FOUND';
  end if;
  return jsonb_build_object(
    'statementSnapshotId',v_statement.id,
    'statementSeriesId',v_statement.statement_series_id,
    'versionNumber',v_statement.version_number,
    'supersedesSnapshotId',v_statement.supersedes_snapshot_id,
    'correctionReason',v_statement.correction_reason,
    'finalizedAt',v_statement.finalized_at,
    'sha256Hex',v_statement.sha256_hex,
    'snapshot',v_statement.snapshot_data
  );
end;
$$;
revoke all on function public.get_owner_statement_detail(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_owner_statement_detail(uuid) to authenticated;

commit;
