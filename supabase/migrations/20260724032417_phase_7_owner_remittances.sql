begin;

create table public.owner_remittance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  accounting_book_id uuid not null references public.accounting_books(id) on delete restrict,
  owner_entity_id uuid not null references public.owner_entities(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  statement_snapshot_id uuid references reporting.owner_statement_snapshots(id) on delete restrict,
  journal_transaction_id uuid not null references public.journal_transactions(id) on delete restrict,
  evidence_document_id uuid not null references public.documents(id) on delete restrict,
  public_reference text not null unique,
  amount_minor bigint not null check (amount_minor > 0),
  currency_code char(3) not null check (currency_code in ('USD','CAD','MXN')),
  paid_outside_crecy boolean not null default true check (paid_outside_crecy),
  paid_on date not null,
  external_reference text check (
    external_reference is null
    or length(trim(external_reference)) between 1 and 200
  ),
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (journal_transaction_id),
  foreign key (organization_id,accounting_book_id)
    references public.accounting_books(organization_id,id) on delete restrict,
  foreign key (organization_id,owner_entity_id)
    references public.owner_entities(organization_id,id) on delete restrict,
  foreign key (organization_id,property_id)
    references public.properties(organization_id,id) on delete restrict,
  foreign key (organization_id,statement_snapshot_id)
    references reporting.owner_statement_snapshots(organization_id,id) on delete restrict,
  foreign key (organization_id,journal_transaction_id)
    references public.journal_transactions(organization_id,id) on delete restrict,
  foreign key (organization_id,evidence_document_id)
    references public.documents(organization_id,id) on delete restrict
);
create index owner_remittances_owner_paid_idx
  on public.owner_remittance_records(owner_entity_id,property_id,paid_on desc,recorded_at desc);
create index owner_remittances_property_paid_idx
  on public.owner_remittance_records(property_id,paid_on desc,recorded_at desc);
create index owner_remittances_statement_idx
  on public.owner_remittance_records(statement_snapshot_id)
  where statement_snapshot_id is not null;
create index owner_remittances_book_idx
  on public.owner_remittance_records(accounting_book_id,paid_on desc);
create index owner_remittances_evidence_idx
  on public.owner_remittance_records(evidence_document_id);
create unique index owner_remittances_external_reference_unique
  on public.owner_remittance_records(
    organization_id,property_id,lower(external_reference)
  )
  where external_reference is not null;

create trigger owner_remittance_records_append_only
before update or delete on public.owner_remittance_records
for each row execute function private.prevent_financial_mutation();

alter table public.owner_remittance_records enable row level security;
create policy owner_remittance_scoped_read
on public.owner_remittance_records
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
revoke all on table public.owner_remittance_records from public,anon,authenticated;
grant select on table public.owner_remittance_records to authenticated;

create or replace function private.post_owner_statement_accrual(
  p_statement_snapshot_id uuid,
  p_organization_id uuid,
  p_accounting_book_id uuid,
  p_owner_entity_id uuid,
  p_property_id uuid,
  p_period_end date,
  p_currency_code char(3),
  p_net_owner_position_minor bigint,
  p_supersedes_snapshot_id uuid,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property public.properties%rowtype;
  v_prior_net bigint := 0;
  v_current_payable bigint := 0;
  v_projected_payable bigint;
  v_payable_account_id uuid;
  v_receivable_account_id uuid;
  v_clearing_account_id uuid;
  v_journal_transaction_id uuid;
  v_correlation_id uuid := gen_random_uuid();
begin
  if exists (
    select 1
    from public.journal_transactions jt
    where jt.accounting_book_id=p_accounting_book_id
      and jt.idempotency_key='owner-statement-accrual:'||p_statement_snapshot_id::text
  ) then
    select jt.id into v_journal_transaction_id
    from public.journal_transactions jt
    where jt.accounting_book_id=p_accounting_book_id
      and jt.idempotency_key='owner-statement-accrual:'||p_statement_snapshot_id::text;
    return v_journal_transaction_id;
  end if;

  select * into v_property
  from public.properties p
  where p.id=p_property_id
    and p.organization_id=p_organization_id
    and p.accounting_book_id=p_accounting_book_id;
  if not found then
    raise exception using errcode='P0002',message='OWNER_STATEMENT_CONTEXT_NOT_FOUND';
  end if;

  if p_supersedes_snapshot_id is not null then
    select s.net_owner_position_minor into v_prior_net
    from reporting.owner_statement_snapshots s
    where s.id=p_supersedes_snapshot_id
      and s.organization_id=p_organization_id
      and s.accounting_book_id=p_accounting_book_id
      and s.owner_entity_id=p_owner_entity_id
      and s.property_id=p_property_id;
    if not found then
      raise exception using errcode='23503',message='OWNER_STATEMENT_SUPERSEDED_VERSION_NOT_FOUND';
    end if;
  end if;

  insert into public.ledger_accounts(
    organization_id,accounting_book_id,account_code,account_name,account_class,normal_balance
  ) values
    (p_organization_id,p_accounting_book_id,'1150','Owner receivable','asset','debit'),
    (p_organization_id,p_accounting_book_id,'2100','Owner payable','liability','credit'),
    (p_organization_id,p_accounting_book_id,'3905','Owner distribution clearing','equity','credit')
  on conflict (accounting_book_id,account_code) do nothing;

  select a.id into v_receivable_account_id
  from public.ledger_accounts a
  where a.accounting_book_id=p_accounting_book_id
    and a.account_code='1150'
    and a.account_class='asset'
    and a.normal_balance='debit'
    and a.status='active';
  if not found then
    raise exception using errcode='23514',message='LEDGER_ACCOUNT_CONFLICT',detail='1150';
  end if;
  select a.id into v_payable_account_id
  from public.ledger_accounts a
  where a.accounting_book_id=p_accounting_book_id
    and a.account_code='2100'
    and a.account_class='liability'
    and a.normal_balance='credit'
    and a.status='active';
  if not found then
    raise exception using errcode='23514',message='LEDGER_ACCOUNT_CONFLICT',detail='2100';
  end if;
  select a.id into v_clearing_account_id
  from public.ledger_accounts a
  where a.accounting_book_id=p_accounting_book_id
    and a.account_code='3905'
    and a.account_class='equity'
    and a.normal_balance='credit'
    and a.status='active';
  if not found then
    raise exception using errcode='23514',message='LEDGER_ACCOUNT_CONFLICT',detail='3905';
  end if;

  select coalesce(sum(je.credit_minor-je.debit_minor),0)::bigint
    into v_current_payable
  from public.journal_entries je
  where je.organization_id=p_organization_id
    and je.accounting_book_id=p_accounting_book_id
    and je.property_id=p_property_id
    and je.owner_entity_id=p_owner_entity_id
    and je.ledger_account_id=v_payable_account_id;
  v_projected_payable := v_current_payable
    - greatest(v_prior_net,0)
    + greatest(p_net_owner_position_minor,0);
  if v_projected_payable<0 then
    raise exception using errcode='23514',message='OWNER_PAYABLE_BELOW_REMITTED';
  end if;

  if v_prior_net=p_net_owner_position_minor then
    return null;
  end if;

  v_journal_transaction_id := gen_random_uuid();
  insert into public.journal_transactions(
    id,organization_id,operating_entity_id,accounting_book_id,transaction_type,
    effective_date,source_type,source_id,idempotency_key,currency_code,
    correlation_id,created_by,metadata
  ) values (
    v_journal_transaction_id,p_organization_id,v_property.operating_entity_id,
    p_accounting_book_id,
    case when p_supersedes_snapshot_id is null
      then 'owner_statement_accrual'
      else 'owner_statement_accrual_correction'
    end,
    p_period_end,'owner_statement_snapshot',p_statement_snapshot_id,
    'owner-statement-accrual:'||p_statement_snapshot_id::text,p_currency_code,
    v_correlation_id,p_created_by,jsonb_build_object(
      'ownerEntityId',p_owner_entity_id,
      'propertyId',p_property_id,
      'priorNetOwnerPositionMinor',v_prior_net,
      'netOwnerPositionMinor',p_net_owner_position_minor,
      'supersedesSnapshotId',p_supersedes_snapshot_id
    )
  );

  if v_prior_net>0 then
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,
      debit_minor,property_id,owner_entity_id,memo
    ) values (
      v_journal_transaction_id,p_organization_id,p_accounting_book_id,
      v_payable_account_id,v_prior_net,p_property_id,p_owner_entity_id,
      'Reverse superseded owner payable'
    );
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,
      credit_minor,property_id,owner_entity_id,memo
    ) values (
      v_journal_transaction_id,p_organization_id,p_accounting_book_id,
      v_clearing_account_id,v_prior_net,p_property_id,p_owner_entity_id,
      'Reverse superseded owner distribution clearing'
    );
  elsif v_prior_net<0 then
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,
      debit_minor,property_id,owner_entity_id,memo
    ) values (
      v_journal_transaction_id,p_organization_id,p_accounting_book_id,
      v_clearing_account_id,abs(v_prior_net),p_property_id,p_owner_entity_id,
      'Reverse superseded owner distribution clearing'
    );
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,
      credit_minor,property_id,owner_entity_id,memo
    ) values (
      v_journal_transaction_id,p_organization_id,p_accounting_book_id,
      v_receivable_account_id,abs(v_prior_net),p_property_id,p_owner_entity_id,
      'Reverse superseded owner receivable'
    );
  end if;

  if p_net_owner_position_minor>0 then
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,
      debit_minor,property_id,owner_entity_id,memo
    ) values (
      v_journal_transaction_id,p_organization_id,p_accounting_book_id,
      v_clearing_account_id,p_net_owner_position_minor,p_property_id,p_owner_entity_id,
      'Accrue owner distribution clearing'
    );
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,
      credit_minor,property_id,owner_entity_id,memo
    ) values (
      v_journal_transaction_id,p_organization_id,p_accounting_book_id,
      v_payable_account_id,p_net_owner_position_minor,p_property_id,p_owner_entity_id,
      'Accrue owner payable'
    );
  elsif p_net_owner_position_minor<0 then
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,
      debit_minor,property_id,owner_entity_id,memo
    ) values (
      v_journal_transaction_id,p_organization_id,p_accounting_book_id,
      v_receivable_account_id,abs(p_net_owner_position_minor),p_property_id,p_owner_entity_id,
      'Accrue owner receivable'
    );
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,
      credit_minor,property_id,owner_entity_id,memo
    ) values (
      v_journal_transaction_id,p_organization_id,p_accounting_book_id,
      v_clearing_account_id,abs(p_net_owner_position_minor),p_property_id,p_owner_entity_id,
      'Accrue owner distribution clearing'
    );
  end if;
  return v_journal_transaction_id;
end;
$$;
revoke all on function private.post_owner_statement_accrual(
  uuid,uuid,uuid,uuid,uuid,date,char(3),bigint,uuid,uuid
) from public,anon,authenticated,service_role;

create or replace function private.owner_statement_accrual_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.post_owner_statement_accrual(
    new.id,new.organization_id,new.accounting_book_id,new.owner_entity_id,new.property_id,
    new.period_end,new.currency_code,new.net_owner_position_minor,
    new.supersedes_snapshot_id,new.finalized_by
  );
  return new;
end;
$$;
revoke all on function private.owner_statement_accrual_trigger()
  from public,anon,authenticated,service_role;
create trigger owner_statement_accrual_posted
after insert on reporting.owner_statement_snapshots
for each row execute function private.owner_statement_accrual_trigger();

do $$
declare
  v_statement reporting.owner_statement_snapshots%rowtype;
begin
  for v_statement in
    select *
    from reporting.owner_statement_snapshots
    order by finalized_at,id
  loop
    perform private.post_owner_statement_accrual(
      v_statement.id,v_statement.organization_id,v_statement.accounting_book_id,
      v_statement.owner_entity_id,v_statement.property_id,v_statement.period_end,
      v_statement.currency_code,v_statement.net_owner_position_minor,
      v_statement.supersedes_snapshot_id,v_statement.finalized_by
    );
  end loop;
end;
$$;

create or replace function public.record_owner_remittance(
  p_organization_id uuid,
  p_owner_entity_id uuid,
  p_property_id uuid,
  p_statement_snapshot_id uuid,
  p_amount_minor bigint,
  p_currency_code char(3),
  p_paid_on date,
  p_external_reference text,
  p_evidence_document_id uuid,
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
  v_previous private.idempotency_records%rowtype;
  v_request_hash text;
  v_property public.properties%rowtype;
  v_book public.accounting_books%rowtype;
  v_statement reporting.owner_statement_snapshots%rowtype;
  v_statement_remaining bigint;
  v_owner_payable_minor bigint;
  v_payable_account_id uuid;
  v_cash_account_id uuid;
  v_remittance_id uuid := gen_random_uuid();
  v_journal_transaction_id uuid := gen_random_uuid();
  v_public_reference text;
  v_external_reference text := nullif(trim(p_external_reference),'');
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then
    raise exception using errcode='22023',message='IDEMPOTENCY_KEY_REQUIRED';
  end if;
  if p_amount_minor is null or p_amount_minor<=0 then
    raise exception using errcode='22023',message='INVALID_REMITTANCE_AMOUNT';
  end if;
  if p_paid_on is null or p_paid_on>current_date then
    raise exception using errcode='22023',message='INVALID_REMITTANCE_DATE';
  end if;
  if v_external_reference is not null and length(v_external_reference)>200 then
    raise exception using errcode='22023',message='INVALID_EXTERNAL_REFERENCE';
  end if;
  if not private.has_property_access(p_property_id,'owner.manage')
     or not private.has_property_access(p_property_id,'finance.manage') then
    raise exception using errcode='42501',message='OWNER_REMITTANCE_SCOPE_DENIED';
  end if;
  if not private.has_plan_entitlement(p_organization_id,'portal.owner.standard',false) then
    raise exception using errcode='42501',message='OWNER_REMITTANCE_PLAN_UNAVAILABLE';
  end if;

  select * into v_property
  from public.properties p
  where p.id=p_property_id
    and p.organization_id=p_organization_id;
  if not found then
    raise exception using errcode='P0002',message='OWNER_REMITTANCE_CONTEXT_NOT_FOUND';
  end if;
  select * into v_book
  from public.accounting_books b
  where b.id=v_property.accounting_book_id
    and b.organization_id=p_organization_id;
  if not found or v_book.functional_currency_code<>p_currency_code then
    raise exception using errcode='23514',message='CURRENCY_MISMATCH';
  end if;
  if not exists (
    select 1
    from public.owner_entities oe
    where oe.id=p_owner_entity_id
      and oe.organization_id=p_organization_id
      and oe.status='active'
  ) or not exists (
    select 1
    from public.ownership_interests oi
    where oi.organization_id=p_organization_id
      and oi.owner_entity_id=p_owner_entity_id
      and oi.property_id=p_property_id
      and oi.effective_from<=p_paid_on
      and (oi.effective_to is null or oi.effective_to>=p_paid_on)
  ) then
    raise exception using errcode='23514',message='OWNER_INTEREST_NOT_EFFECTIVE';
  end if;

  v_actor_scope := 'user:'||v_actor_id::text;
  v_request_hash := encode(sha256(convert_to(concat_ws(
    '|',p_organization_id,p_owner_entity_id,p_property_id,p_statement_snapshot_id,
    p_amount_minor,p_currency_code,p_paid_on,coalesce(v_external_reference,''),
    p_evidence_document_id
  ),'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',p_organization_id,v_actor_scope,'RecordOwnerRemittance',trim(p_idempotency_key)
  ),0));
  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=p_organization_id
    and r.actor_scope=v_actor_scope
    and r.route='RecordOwnerRemittance'
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

  if p_statement_snapshot_id is not null then
    select * into v_statement
    from reporting.owner_statement_snapshots s
    where s.id=p_statement_snapshot_id
      and s.organization_id=p_organization_id
      and s.accounting_book_id=v_book.id
      and s.owner_entity_id=p_owner_entity_id
      and s.property_id=p_property_id
      and s.currency_code=p_currency_code;
    if not found then
      raise exception using errcode='P0002',message='OWNER_STATEMENT_NOT_FOUND';
    end if;
    if exists (
      select 1
      from reporting.owner_statement_snapshots newer
      where newer.statement_series_id=v_statement.statement_series_id
        and newer.version_number>v_statement.version_number
    ) then
      raise exception using errcode='40001',message='OWNER_STATEMENT_VERSION_SUPERSEDED';
    end if;
    v_statement_remaining := greatest(
      v_statement.net_owner_position_minor-coalesce((
        select sum(r.amount_minor)
        from public.owner_remittance_records r
        join reporting.owner_statement_snapshots linked
          on linked.id=r.statement_snapshot_id
         and linked.organization_id=r.organization_id
        where r.organization_id=p_organization_id
          and linked.statement_series_id=v_statement.statement_series_id
      ),0),
      0
    );
    if p_amount_minor>v_statement_remaining then
      raise exception using
        errcode='23514',
        message='STATEMENT_REMITTANCE_EXCEEDS_AVAILABLE',
        detail='available_minor='||v_statement_remaining::text;
    end if;
  end if;

  if not exists (
    select 1
    from public.documents d
    where d.id=p_evidence_document_id
      and d.organization_id=p_organization_id
      and d.property_id=p_property_id
      and d.document_type='owner_remittance_evidence'
      and d.status='active'
      and exists (
        select 1
        from public.document_versions dv
        where dv.document_id=d.id
          and dv.organization_id=d.organization_id
          and dv.upload_status='clean'
      )
  ) then
    raise exception using errcode='23514',message='REMITTANCE_EVIDENCE_REQUIRED';
  end if;
  if v_external_reference is not null and exists (
    select 1
    from public.owner_remittance_records r
    where r.organization_id=p_organization_id
      and r.property_id=p_property_id
      and lower(r.external_reference)=lower(v_external_reference)
  ) then
    raise exception using errcode='23505',message='DUPLICATE_EXTERNAL_REFERENCE';
  end if;

  perform 1
  from public.accounting_books b
  where b.id=v_book.id
    and b.organization_id=p_organization_id
  for update;

  select a.id into v_payable_account_id
  from public.ledger_accounts a
  where a.accounting_book_id=v_book.id
    and a.account_code='2100'
    and a.account_class='liability'
    and a.normal_balance='credit'
    and a.status='active';
  if not found then
    raise exception using errcode='23514',message='OWNER_PAYABLE_NOT_ACCRUED';
  end if;
  insert into public.ledger_accounts(
    organization_id,accounting_book_id,account_code,account_name,account_class,normal_balance
  ) values (
    p_organization_id,v_book.id,'1040','Operating cash clearing','asset','debit'
  ) on conflict (accounting_book_id,account_code) do nothing;
  select a.id into v_cash_account_id
  from public.ledger_accounts a
  where a.accounting_book_id=v_book.id
    and a.account_code='1040'
    and a.account_class='asset'
    and a.normal_balance='debit'
    and a.status='active';
  if not found then
    raise exception using errcode='23514',message='LEDGER_ACCOUNT_CONFLICT',detail='1040';
  end if;

  select coalesce(sum(je.credit_minor-je.debit_minor),0)::bigint
    into v_owner_payable_minor
  from public.journal_entries je
  where je.organization_id=p_organization_id
    and je.accounting_book_id=v_book.id
    and je.property_id=p_property_id
    and je.owner_entity_id=p_owner_entity_id
    and je.ledger_account_id=v_payable_account_id;
  if p_amount_minor>v_owner_payable_minor then
    raise exception using errcode='23514',message='OWNER_REMITTANCE_EXCEEDS_PAYABLE';
  end if;

  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,request_hash,expires_at
  ) values (
    p_organization_id,v_actor_id,v_actor_scope,'RecordOwnerRemittance',
    trim(p_idempotency_key),v_request_hash,now()+interval '24 hours'
  );
  v_public_reference := 'REM-'||upper(substr(replace(v_remittance_id::text,'-',''),1,12));

  insert into public.journal_transactions(
    id,organization_id,operating_entity_id,accounting_book_id,transaction_type,
    effective_date,source_type,source_id,idempotency_key,currency_code,
    correlation_id,created_by,metadata
  ) values (
    v_journal_transaction_id,p_organization_id,v_property.operating_entity_id,v_book.id,
    'owner_remittance',p_paid_on,'owner_remittance_record',v_remittance_id,
    'owner-remittance:'||trim(p_idempotency_key),p_currency_code,
    v_correlation_id,v_actor_id,jsonb_build_object(
      'ownerEntityId',p_owner_entity_id,
      'propertyId',p_property_id,
      'statementSnapshotId',p_statement_snapshot_id,
      'externalReference',v_external_reference,
      'evidenceDocumentId',p_evidence_document_id,
      'paidOutsideCrecy',true
    )
  );
  insert into public.journal_entries(
    journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,
    debit_minor,property_id,owner_entity_id,memo
  ) values (
    v_journal_transaction_id,p_organization_id,v_book.id,v_payable_account_id,
    p_amount_minor,p_property_id,p_owner_entity_id,'Owner remittance paid outside Crecy'
  );
  insert into public.journal_entries(
    journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,
    credit_minor,property_id,owner_entity_id,memo
  ) values (
    v_journal_transaction_id,p_organization_id,v_book.id,v_cash_account_id,
    p_amount_minor,p_property_id,p_owner_entity_id,'Operating cash clearing'
  );
  insert into public.owner_remittance_records(
    id,organization_id,accounting_book_id,owner_entity_id,property_id,
    statement_snapshot_id,journal_transaction_id,evidence_document_id,
    public_reference,amount_minor,currency_code,paid_on,external_reference,recorded_by
  ) values (
    v_remittance_id,p_organization_id,v_book.id,p_owner_entity_id,p_property_id,
    p_statement_snapshot_id,v_journal_transaction_id,p_evidence_document_id,
    v_public_reference,p_amount_minor,p_currency_code,p_paid_on,v_external_reference,v_actor_id
  );

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,
    correlation_id,reason,after_data
  ) values (
    p_organization_id,v_actor_id,'user','owner_remittance.recorded',
    'owner_remittance_record',v_remittance_id,v_correlation_id,
    'Funds paid outside Crecy',jsonb_build_object(
      'ownerEntityId',p_owner_entity_id,
      'propertyId',p_property_id,
      'statementSnapshotId',p_statement_snapshot_id,
      'amountMinor',p_amount_minor,
      'currencyCode',p_currency_code,
      'paidOn',p_paid_on,
      'externalReference',v_external_reference,
      'evidenceDocumentId',p_evidence_document_id,
      'journalTransactionId',v_journal_transaction_id
    )
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values
    (
      p_organization_id,'owner_remittance.recorded','owner_remittance_record',
      v_remittance_id,v_correlation_id,jsonb_build_object(
        'remittanceId',v_remittance_id,
        'ownerId',p_owner_entity_id,
        'propertyId',p_property_id,
        'statementSnapshotId',p_statement_snapshot_id,
        'amountMinor',p_amount_minor,
        'currency',p_currency_code
      )
    ),
    (
      p_organization_id,'notification.requested','owner_remittance_record',
      v_remittance_id,v_correlation_id,jsonb_build_object(
        'recipientType','owner_entity',
        'recipientId',p_owner_entity_id,
        'templateCode','owner_remittance_recorded',
        'resourceType','owner_remittance_record',
        'resourceId',v_remittance_id
      )
    );

  v_response := jsonb_build_object(
    'remittanceId',v_remittance_id,
    'publicReference',v_public_reference,
    'statementSnapshotId',p_statement_snapshot_id,
    'journalTransactionId',v_journal_transaction_id,
    'amountMinor',p_amount_minor,
    'currencyCode',p_currency_code,
    'paidOn',p_paid_on,
    'availableOwnerPayableMinor',v_owner_payable_minor-p_amount_minor
  );
  update private.idempotency_records r
  set state='completed',response_status=201,response_body=v_response,
      resource_type='owner_remittance_record',resource_id=v_remittance_id,completed_at=now()
  where r.organization_id=p_organization_id
    and r.actor_scope=v_actor_scope
    and r.route='RecordOwnerRemittance'
    and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;
revoke all on function public.record_owner_remittance(
  uuid,uuid,uuid,uuid,bigint,char(3),date,text,uuid,text
) from public,anon,authenticated,service_role;
grant execute on function public.record_owner_remittance(
  uuid,uuid,uuid,uuid,bigint,char(3),date,text,uuid,text
) to authenticated;

create or replace function private.owner_payable_balance(
  p_organization_id uuid,
  p_accounting_book_id uuid,
  p_owner_entity_id uuid,
  p_property_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(je.credit_minor-je.debit_minor),0)::bigint
  from public.journal_entries je
  join public.ledger_accounts la
    on la.organization_id=je.organization_id
   and la.accounting_book_id=je.accounting_book_id
   and la.id=je.ledger_account_id
   and la.account_code='2100'
  where je.organization_id=p_organization_id
    and je.accounting_book_id=p_accounting_book_id
    and je.owner_entity_id=p_owner_entity_id
    and je.property_id=p_property_id;
$$;
revoke all on function private.owner_payable_balance(uuid,uuid,uuid,uuid)
  from public,anon,authenticated,service_role;

create or replace function public.get_owner_statement_workspace()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
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
        'remittedMinor',coalesce((
          select sum(r.amount_minor)
          from public.owner_remittance_records r
          join reporting.owner_statement_snapshots linked
            on linked.id=r.statement_snapshot_id
           and linked.organization_id=r.organization_id
          where linked.statement_series_id=s.statement_series_id
        ),0),
        'ownerPayableMinor',private.owner_payable_balance(
          s.organization_id,s.accounting_book_id,s.owner_entity_id,s.property_id
        ),
        'finalizedAt',s.finalized_at,
        'sha256Hex',s.sha256_hex
      ) order by s.period_end desc,s.finalized_at desc)
      from reporting.owner_statement_snapshots s
      where (select auth.uid()) is not null
        and private.is_owner_entity(s.owner_entity_id)
        and private.has_plan_entitlement(s.organization_id,'portal.owner.standard',true)
    ),'[]'::jsonb),
    'remittances',coalesce((
      select jsonb_agg(jsonb_build_object(
        'remittanceId',r.id,
        'publicReference',r.public_reference,
        'statementSnapshotId',r.statement_snapshot_id,
        'ownerEntityId',r.owner_entity_id,
        'propertyId',r.property_id,
        'propertyName',p.name,
        'amountMinor',r.amount_minor,
        'currencyCode',r.currency_code,
        'paidOn',r.paid_on,
        'externalReference',r.external_reference,
        'recordedAt',r.recorded_at,
        'evidenceDocumentId',r.evidence_document_id
      ) order by r.paid_on desc,r.recorded_at desc)
      from public.owner_remittance_records r
      join public.properties p
        on p.organization_id=r.organization_id
       and p.id=r.property_id
      where (select auth.uid()) is not null
        and private.is_owner_entity(r.owner_entity_id)
        and private.has_plan_entitlement(r.organization_id,'portal.owner.standard',true)
    ),'[]'::jsonb)
  );
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
      'ownerPayableMinor',private.owner_payable_balance(
        e.organization_id,e.accounting_book_id,e.owner_entity_id,e.property_id
      ),
      'evidenceDocuments',coalesce(docs.items,'[]'::jsonb),
      'remittances',coalesce(remittances.items,'[]'::jsonb),
      'latestStatement',case when s.id is null then null else jsonb_build_object(
        'statementSnapshotId',s.id,
        'statementSeriesId',s.statement_series_id,
        'periodStart',s.period_start,
        'periodEnd',s.period_end,
        'versionNumber',s.version_number,
        'netOwnerPositionMinor',s.net_owner_position_minor,
        'remittedMinor',coalesce(series_remittances.amount_minor,0),
        'availableToRemitMinor',least(
          greatest(s.net_owner_position_minor-coalesce(series_remittances.amount_minor,0),0),
          greatest(private.owner_payable_balance(
            e.organization_id,e.accounting_book_id,e.owner_entity_id,e.property_id
          ),0)
        ),
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
  ) s on true
  left join lateral (
    select coalesce(sum(r.amount_minor),0)::bigint as amount_minor
    from public.owner_remittance_records r
    join reporting.owner_statement_snapshots linked
      on linked.id=r.statement_snapshot_id
     and linked.organization_id=r.organization_id
    where linked.statement_series_id=s.statement_series_id
  ) series_remittances on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'documentId',d.id,
      'title',d.title,
      'originalFilename',latest.original_filename
    ) order by d.created_at desc) as items
    from public.documents d
    join lateral (
      select dv.original_filename
      from public.document_versions dv
      where dv.organization_id=d.organization_id
        and dv.document_id=d.id
        and dv.upload_status='clean'
      order by dv.version_number desc
      limit 1
    ) latest on true
    where d.organization_id=e.organization_id
      and d.property_id=e.property_id
      and d.document_type='owner_remittance_evidence'
      and d.status='active'
  ) docs on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'remittanceId',r.id,
      'publicReference',r.public_reference,
      'statementSnapshotId',r.statement_snapshot_id,
      'amountMinor',r.amount_minor,
      'currencyCode',r.currency_code,
      'paidOn',r.paid_on,
      'externalReference',r.external_reference,
      'recordedAt',r.recorded_at,
      'evidenceDocumentId',r.evidence_document_id
    ) order by r.paid_on desc,r.recorded_at desc) as items
    from public.owner_remittance_records r
    where r.organization_id=e.organization_id
      and r.accounting_book_id=e.accounting_book_id
      and r.owner_entity_id=e.owner_entity_id
      and r.property_id=e.property_id
  ) remittances on true;
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
  v_remittances jsonb;
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
  select coalesce(jsonb_agg(jsonb_build_object(
    'remittanceId',r.id,
    'publicReference',r.public_reference,
    'amountMinor',r.amount_minor,
    'currencyCode',r.currency_code,
    'paidOn',r.paid_on,
    'externalReference',r.external_reference,
    'recordedAt',r.recorded_at,
    'evidenceDocumentId',r.evidence_document_id
  ) order by r.paid_on desc,r.recorded_at desc),'[]'::jsonb)
  into v_remittances
  from public.owner_remittance_records r
  join reporting.owner_statement_snapshots linked
    on linked.id=r.statement_snapshot_id
   and linked.organization_id=r.organization_id
  where linked.statement_series_id=v_statement.statement_series_id;
  return jsonb_build_object(
    'statementSnapshotId',v_statement.id,
    'statementSeriesId',v_statement.statement_series_id,
    'versionNumber',v_statement.version_number,
    'supersedesSnapshotId',v_statement.supersedes_snapshot_id,
    'correctionReason',v_statement.correction_reason,
    'finalizedAt',v_statement.finalized_at,
    'sha256Hex',v_statement.sha256_hex,
    'ownerPayableMinor',private.owner_payable_balance(
      v_statement.organization_id,v_statement.accounting_book_id,
      v_statement.owner_entity_id,v_statement.property_id
    ),
    'remittances',v_remittances,
    'snapshot',v_statement.snapshot_data
  );
end;
$$;
revoke all on function public.get_owner_statement_detail(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_owner_statement_detail(uuid) to authenticated;

commit;
