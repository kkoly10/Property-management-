begin;

create type public.household_status as enum ('prospect','applicant','resident','former');
create type public.lease_status as enum ('draft','recorded','active','expired','terminated','superseded');
create type public.tenancy_status as enum ('scheduled','active','notice_given','move_out_in_progress','closed');

create table public.people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  first_name text not null check (length(trim(first_name)) between 1 and 100),
  last_name text not null check (length(trim(last_name)) between 1 and 100),
  email citext,
  phone_e164 text,
  locale text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  check (email is null or length(trim(email::text)) between 3 and 254),
  check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);
create index people_org_email_idx on public.people(organization_id,email) where email is not null;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  display_name text not null check (length(trim(display_name)) between 1 and 160),
  status public.household_status not null default 'resident',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id)
);

create table public.household_members (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  household_id uuid not null,
  person_id uuid not null,
  is_primary_contact boolean not null default false,
  is_financially_responsible boolean not null default false,
  starts_on date not null default current_date,
  ends_on date,
  primary key (household_id,person_id,starts_on),
  foreign key (organization_id,household_id) references public.households(organization_id,id) on delete restrict,
  foreign key (organization_id,person_id) references public.people(organization_id,id) on delete restrict,
  check (ends_on is null or ends_on >= starts_on)
);
create unique index household_primary_active_unique on public.household_members(household_id)
  where is_primary_contact and ends_on is null;
create index household_members_person_idx on public.household_members(person_id,ends_on);

create table public.leases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  household_id uuid not null references public.households(id) on delete restrict,
  country_profile_id uuid not null references public.country_profiles(id) on delete restrict,
  source text not null default 'operator_supplied' check (source in ('operator_supplied','imported','platform_generated_future')),
  external_reference text,
  start_date date not null,
  end_date date,
  rent_amount_minor bigint not null check (rent_amount_minor >= 0),
  currency_code char(3) not null check (currency_code in ('USD','CAD','MXN')),
  rent_frequency text not null default 'monthly' check (rent_frequency in ('weekly','biweekly','monthly','quarterly','semiannual','annual','custom')),
  status public.lease_status not null default 'recorded',
  executed_at timestamptz,
  supersedes_lease_id uuid references public.leases(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict,
  foreign key (organization_id,property_id,unit_id) references public.units(organization_id,property_id,id) on delete restrict,
  foreign key (organization_id,household_id) references public.households(organization_id,id) on delete restrict,
  check (end_date is null or end_date >= start_date)
);
create index leases_unit_status_idx on public.leases(unit_id,status,start_date,end_date);
create index leases_property_status_idx on public.leases(property_id,status,start_date);
create index leases_household_idx on public.leases(household_id);

create table public.receivable_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  accounting_book_id uuid not null references public.accounting_books(id) on delete restrict,
  public_reference text not null,
  currency_code char(3) not null check (currency_code in ('USD','CAD','MXN')),
  status text not null default 'active' check (status in ('active','closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  version integer not null default 1 check (version > 0),
  unique (organization_id,id),
  unique (organization_id,public_reference),
  foreign key (organization_id,accounting_book_id) references public.accounting_books(organization_id,id) on delete restrict
);
create index receivable_accounts_book_idx on public.receivable_accounts(accounting_book_id,status);

create table public.tenancies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  household_id uuid not null references public.households(id) on delete restrict,
  lease_id uuid not null references public.leases(id) on delete restrict,
  receivable_account_id uuid not null references public.receivable_accounts(id) on delete restrict,
  possession_start date not null,
  possession_end date,
  status public.tenancy_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (lease_id),
  foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict,
  foreign key (organization_id,property_id,unit_id) references public.units(organization_id,property_id,id) on delete restrict,
  foreign key (organization_id,household_id) references public.households(organization_id,id) on delete restrict,
  foreign key (organization_id,lease_id) references public.leases(organization_id,id) on delete restrict,
  foreign key (organization_id,receivable_account_id) references public.receivable_accounts(organization_id,id) on delete restrict,
  check (possession_end is null or possession_end >= possession_start)
);
create unique index tenancies_unit_active_unique on public.tenancies(unit_id)
  where status in ('scheduled','active','notice_given','move_out_in_progress');
create index tenancies_property_status_idx on public.tenancies(property_id,status);
create index tenancies_household_idx on public.tenancies(household_id,status);
create index tenancies_receivable_idx on public.tenancies(receivable_account_id);

create table public.user_relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  relationship_type text not null check (relationship_type in ('resident_person','owner_entity','vendor_contact')),
  relationship_id uuid not null,
  status text not null default 'active' check (status in ('invited','active','revoked')),
  created_at timestamptz not null default now(),
  unique (user_id,organization_id,relationship_type,relationship_id)
);
create index user_relationships_user_idx on public.user_relationships(user_id,status,organization_id);
create index user_relationships_relationship_idx on public.user_relationships(organization_id,relationship_type,relationship_id,status);

create table public.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  accounting_book_id uuid not null references public.accounting_books(id) on delete restrict,
  account_code text not null,
  account_name text not null,
  account_class text not null check (account_class in ('asset','liability','equity','revenue','expense','contra_asset','contra_revenue')),
  normal_balance text not null check (normal_balance in ('debit','credit')),
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  unique (accounting_book_id,account_code),
  unique (organization_id,id),
  foreign key (organization_id,accounting_book_id) references public.accounting_books(organization_id,id) on delete restrict
);

create table public.journal_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  operating_entity_id uuid not null references public.operating_entities(id) on delete restrict,
  accounting_book_id uuid not null references public.accounting_books(id) on delete restrict,
  transaction_type text not null,
  effective_date date not null,
  posted_at timestamptz not null default now(),
  source_type text not null,
  source_id uuid,
  idempotency_key text not null,
  currency_code char(3) not null check (currency_code in ('USD','CAD','MXN')),
  correlation_id uuid not null default gen_random_uuid(),
  reversal_of_transaction_id uuid references public.journal_transactions(id) on delete restrict,
  created_by uuid references auth.users(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  unique (accounting_book_id,idempotency_key),
  unique (organization_id,id),
  foreign key (organization_id,operating_entity_id) references public.operating_entities(organization_id,id) on delete restrict,
  foreign key (organization_id,accounting_book_id) references public.accounting_books(organization_id,id) on delete restrict
);
create index journal_transactions_source_idx on public.journal_transactions(source_type,source_id);
create index journal_transactions_book_date_idx on public.journal_transactions(accounting_book_id,effective_date,posted_at);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  journal_transaction_id uuid not null references public.journal_transactions(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  accounting_book_id uuid not null references public.accounting_books(id) on delete restrict,
  ledger_account_id uuid not null references public.ledger_accounts(id) on delete restrict,
  debit_minor bigint not null default 0 check (debit_minor >= 0),
  credit_minor bigint not null default 0 check (credit_minor >= 0),
  property_id uuid references public.properties(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  tenancy_id uuid references public.tenancies(id) on delete restrict,
  receivable_account_id uuid references public.receivable_accounts(id) on delete restrict,
  memo text,
  created_at timestamptz not null default now(),
  check ((debit_minor > 0 and credit_minor = 0) or (credit_minor > 0 and debit_minor = 0))
);
create index journal_entries_tx_idx on public.journal_entries(journal_transaction_id);
create index journal_entries_account_idx on public.journal_entries(ledger_account_id,created_at);
create index journal_entries_receivable_idx on public.journal_entries(receivable_account_id) where receivable_account_id is not null;
create index journal_entries_property_idx on public.journal_entries(property_id) where property_id is not null;
create index journal_entries_tenancy_idx on public.journal_entries(tenancy_id) where tenancy_id is not null;

create table public.charge_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  accounting_book_id uuid not null references public.accounting_books(id) on delete restrict,
  tenancy_id uuid not null references public.tenancies(id) on delete restrict,
  receivable_account_id uuid not null references public.receivable_accounts(id) on delete restrict,
  charge_type text not null,
  amount_minor bigint not null check (amount_minor >= 0),
  currency_code char(3) not null check (currency_code in ('USD','CAD','MXN')),
  cadence text not null check (cadence in ('weekly','biweekly','monthly','quarterly','semiannual','annual','custom')),
  due_day smallint check (due_day is null or due_day between 1 and 31),
  starts_on date not null,
  ends_on date,
  next_run_on date,
  status text not null default 'active' check (status in ('draft','active','paused','ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,accounting_book_id) references public.accounting_books(organization_id,id) on delete restrict,
  foreign key (organization_id,tenancy_id) references public.tenancies(organization_id,id) on delete restrict,
  foreign key (organization_id,receivable_account_id) references public.receivable_accounts(organization_id,id) on delete restrict,
  check (ends_on is null or ends_on >= starts_on)
);
create index charge_schedules_tenancy_idx on public.charge_schedules(tenancy_id,status);
create index charge_schedules_book_idx on public.charge_schedules(accounting_book_id,status);

alter table public.documents add column tenancy_id uuid;
alter table public.documents add constraint documents_tenancy_org_fk
  foreign key (organization_id,tenancy_id) references public.tenancies(organization_id,id) on delete restrict;
create index documents_tenancy_idx on public.documents(tenancy_id) where tenancy_id is not null;

create trigger people_touch before update on public.people for each row execute function private.touch_updated_at();
create trigger households_touch before update on public.households for each row execute function private.touch_updated_at();
create trigger leases_touch before update on public.leases for each row execute function private.touch_updated_at();
create trigger tenancies_touch before update on public.tenancies for each row execute function private.touch_updated_at();
create trigger schedules_touch before update on public.charge_schedules for each row execute function private.touch_updated_at();

create or replace function private.current_user_person_ids(target_organization uuid)
returns setof uuid
language sql stable
security definer
set search_path = ''
as $$
  select ur.relationship_id
  from public.user_relationships ur
  where ur.user_id=(select auth.uid())
    and ur.organization_id=target_organization
    and ur.relationship_type='resident_person'
    and ur.status='active'
$$;

create or replace function private.is_resident_for_tenancy(target_tenancy uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.tenancies t
    join public.household_members hm on hm.organization_id=t.organization_id and hm.household_id=t.household_id
    join public.user_relationships ur on ur.organization_id=t.organization_id
      and ur.relationship_type='resident_person' and ur.relationship_id=hm.person_id and ur.status='active'
    where t.id=target_tenancy and ur.user_id=(select auth.uid())
      and hm.starts_on<=current_date and (hm.ends_on is null or hm.ends_on>=current_date)
  )
$$;

revoke all on function private.current_user_person_ids(uuid) from public,anon;
revoke all on function private.is_resident_for_tenancy(uuid) from public,anon;
grant execute on function private.current_user_person_ids(uuid) to authenticated;
grant execute on function private.is_resident_for_tenancy(uuid) to authenticated;

create or replace function private.validate_journal_balance()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_transaction_id uuid := coalesce(new.journal_transaction_id,old.journal_transaction_id);
  v_debits bigint;
  v_credits bigint;
begin
  select coalesce(sum(e.debit_minor),0),coalesce(sum(e.credit_minor),0)
    into v_debits,v_credits
  from public.journal_entries e where e.journal_transaction_id=v_transaction_id;
  if v_debits<>v_credits then
    raise exception using errcode='23514',message='JOURNAL_NOT_BALANCED';
  end if;
  return null;
end;
$$;
revoke all on function private.validate_journal_balance() from public,anon,authenticated;
create constraint trigger journal_entries_balanced
after insert or update or delete on public.journal_entries
deferrable initially deferred for each row execute function private.validate_journal_balance();

create or replace function public.activate_existing_lease(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_household jsonb,
  p_lease jsonb,
  p_opening_balance_minor bigint,
  p_first_charge_due_date date,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_property public.properties%rowtype;
  v_unit public.units%rowtype;
  v_book public.accounting_books%rowtype;
  v_member jsonb;
  v_household_id uuid := gen_random_uuid();
  v_person_id uuid;
  v_lease_id uuid := gen_random_uuid();
  v_receivable_account_id uuid := gen_random_uuid();
  v_tenancy_id uuid := gen_random_uuid();
  v_charge_schedule_id uuid := gen_random_uuid();
  v_signed_document_id uuid;
  v_source text;
  v_external_reference text;
  v_start_date date;
  v_end_date date;
  v_due_date date;
  v_rent_amount_minor bigint;
  v_currency_code char(3);
  v_rent_frequency text;
  v_primary_count integer;
  v_member_count integer;
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
  v_ar_account_id uuid;
  v_equity_account_id uuid;
  v_journal_transaction_id uuid;
  v_opening_amount bigint := coalesce(p_opening_balance_minor,0);
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if not private.has_property_access(p_property_id,'lease.manage') then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;

  select p.* into v_property from public.properties p
  where p.id=p_property_id and p.organization_id=p_organization_id;
  if not found then raise exception using errcode='P0002',message='PROPERTY_NOT_FOUND'; end if;
  select u.* into v_unit from public.units u
  where u.id=p_unit_id and u.organization_id=p_organization_id and u.property_id=p_property_id for update;
  if not found then raise exception using errcode='P0002',message='UNIT_NOT_FOUND'; end if;
  if v_unit.operational_status<>'active' then raise exception using errcode='23514',message='UNIT_NOT_ACTIVE'; end if;
  select b.* into v_book from public.accounting_books b
  where b.id=v_property.accounting_book_id and b.organization_id=p_organization_id and b.status='open';
  if not found then raise exception using errcode='23514',message='ACCOUNTING_BOOK_NOT_OPEN'; end if;

  if jsonb_typeof(p_household)<>'object' or jsonb_typeof(p_household->'members')<>'array' then
    raise exception using errcode='23514',message='INVALID_HOUSEHOLD';
  end if;
  if length(trim(coalesce(p_household->>'displayName',''))) not between 1 and 160 then
    raise exception using errcode='23514',message='INVALID_HOUSEHOLD';
  end if;
  v_member_count := jsonb_array_length(p_household->'members');
  if v_member_count not between 1 and 12 then raise exception using errcode='23514',message='INVALID_HOUSEHOLD_MEMBERS'; end if;
  select count(*) into v_primary_count from jsonb_array_elements(p_household->'members') m
  where jsonb_typeof(m->'primaryContact')='boolean' and (m->>'primaryContact')::boolean;
  if v_primary_count<>1 then raise exception using errcode='23514',message='PRIMARY_CONTACT_REQUIRED'; end if;
  if exists(
    select 1 from jsonb_array_elements(p_household->'members') m
    where nullif(trim(coalesce(m->>'email','')),'') is not null
    group by lower(trim(m->>'email')) having count(*)>1
  ) then raise exception using errcode='23505',message='DUPLICATE_HOUSEHOLD_EMAIL'; end if;

  if jsonb_typeof(p_lease)<>'object' then raise exception using errcode='23514',message='INVALID_LEASE'; end if;
  v_source := p_lease->>'source';
  v_external_reference := nullif(trim(coalesce(p_lease->>'externalReference','')),'');
  v_currency_code := p_lease->>'currencyCode';
  v_rent_frequency := p_lease->>'rentFrequency';
  if v_source not in ('operator_supplied','imported') then raise exception using errcode='23514',message='INVALID_LEASE_SOURCE'; end if;
  if coalesce(p_lease->>'rentAmountMinor','') !~ '^[0-9]+$' then raise exception using errcode='23514',message='INVALID_RENT_AMOUNT'; end if;
  v_rent_amount_minor := (p_lease->>'rentAmountMinor')::bigint;
  if v_rent_amount_minor>9007199254740991 then raise exception using errcode='22003',message='RENT_AMOUNT_OUT_OF_RANGE'; end if;
  if v_currency_code not in ('USD','CAD','MXN') then raise exception using errcode='23514',message='INVALID_CURRENCY'; end if;
  if v_currency_code<>v_book.functional_currency_code then raise exception using errcode='23514',message='CURRENCY_MISMATCH'; end if;
  if v_rent_frequency not in ('weekly','biweekly','monthly','quarterly','semiannual','annual','custom') then
    raise exception using errcode='23514',message='INVALID_RENT_FREQUENCY';
  end if;
  begin
    v_start_date := (p_lease->>'startDate')::date;
    v_end_date := nullif(p_lease->>'endDate','')::date;
    v_signed_document_id := (p_lease->>'signedDocumentId')::uuid;
  exception when others then
    raise exception using errcode='22007',message='INVALID_LEASE_DATE_OR_DOCUMENT';
  end;
  if v_end_date is not null and v_end_date<v_start_date then raise exception using errcode='23514',message='INVALID_LEASE_DATES'; end if;
  if v_end_date is not null and v_end_date<current_date then raise exception using errcode='23514',message='LEASE_ALREADY_ENDED'; end if;
  v_due_date := coalesce(p_first_charge_due_date,v_start_date);
  if v_due_date<v_start_date or (v_end_date is not null and v_due_date>v_end_date) then
    raise exception using errcode='23514',message='FIRST_CHARGE_DATE_OUTSIDE_LEASE';
  end if;
  if v_opening_amount<>0 and not private.has_property_access(p_property_id,'finance.manage') then
    raise exception using errcode='42501',message='FINANCE_PERMISSION_REQUIRED';
  end if;
  if v_opening_amount not between -9007199254740991 and 9007199254740991 then
    raise exception using errcode='22003',message='OPENING_BALANCE_OUT_OF_RANGE';
  end if;
  if v_external_reference is not null and length(v_external_reference)>120 then
    raise exception using errcode='22001',message='EXTERNAL_REFERENCE_TOO_LONG';
  end if;

  v_request_hash := encode(sha256(convert_to(concat_ws('|',p_organization_id,p_property_id,p_unit_id,p_household::text,p_lease::text,v_opening_amount,p_first_charge_due_date),'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='ActivateExistingLease' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  perform 1 from public.documents d where d.id=v_signed_document_id for update;
  if not exists(
    select 1 from public.documents d
    where d.id=v_signed_document_id and d.organization_id=p_organization_id
      and d.property_id=p_property_id and (d.unit_id is null or d.unit_id=p_unit_id)
      and d.status='active' and d.tenancy_id is null and d.document_type in ('signed_lease','lease')
      and exists(select 1 from public.document_versions dv where dv.document_id=d.id and dv.organization_id=d.organization_id and dv.upload_status='clean')
  ) then raise exception using errcode='23514',message='SIGNED_DOCUMENT_NOT_READY'; end if;

  if exists(
    select 1 from public.tenancies t
    where t.unit_id=p_unit_id and t.status in ('scheduled','active','notice_given','move_out_in_progress')
      and daterange(t.possession_start,coalesce(t.possession_end,'infinity'::date),'[]')
        && daterange(v_start_date,coalesce(v_end_date,'infinity'::date),'[]')
  ) then raise exception using errcode='23P01',message='TENANCY_OVERLAP'; end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (p_organization_id,v_actor_id,'ActivateExistingLease',p_idempotency_key,v_request_hash,now()+interval '24 hours');

  insert into public.households(id,organization_id,display_name,status)
  values (v_household_id,p_organization_id,trim(p_household->>'displayName'),'resident');
  for v_member in select value from jsonb_array_elements(p_household->'members') loop
    if jsonb_typeof(v_member)<>'object'
      or length(trim(coalesce(v_member->>'firstName',''))) not between 1 and 100
      or length(trim(coalesce(v_member->>'lastName',''))) not between 1 and 100
      or jsonb_typeof(v_member->'primaryContact')<>'boolean'
      or jsonb_typeof(v_member->'financiallyResponsible')<>'boolean'
      or (nullif(trim(coalesce(v_member->>'email','')),'') is not null and trim(v_member->>'email') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
      or (nullif(trim(coalesce(v_member->>'phoneE164','')),'') is not null and trim(v_member->>'phoneE164') !~ '^\+[1-9][0-9]{7,14}$')
    then raise exception using errcode='23514',message='INVALID_HOUSEHOLD_MEMBER'; end if;
    insert into public.people(organization_id,first_name,last_name,email,phone_e164)
    values (
      p_organization_id,trim(v_member->>'firstName'),trim(v_member->>'lastName'),
      nullif(lower(trim(coalesce(v_member->>'email',''))),''),nullif(trim(coalesce(v_member->>'phoneE164','')),'')
    ) returning id into v_person_id;
    insert into public.household_members(organization_id,household_id,person_id,is_primary_contact,is_financially_responsible,starts_on)
    values (p_organization_id,v_household_id,v_person_id,(v_member->>'primaryContact')::boolean,(v_member->>'financiallyResponsible')::boolean,v_start_date);
  end loop;

  insert into public.leases(
    id,organization_id,property_id,unit_id,household_id,country_profile_id,source,external_reference,
    start_date,end_date,rent_amount_minor,currency_code,rent_frequency,status,executed_at,created_by
  ) values (
    v_lease_id,p_organization_id,p_property_id,p_unit_id,v_household_id,v_property.country_profile_id,v_source,v_external_reference,
    v_start_date,v_end_date,v_rent_amount_minor,v_currency_code,v_rent_frequency,'active',now(),v_actor_id
  );
  insert into public.receivable_accounts(id,organization_id,accounting_book_id,public_reference,currency_code)
  values (v_receivable_account_id,p_organization_id,v_property.accounting_book_id,'TEN-'||upper(substr(replace(v_tenancy_id::text,'-',''),1,12)),v_currency_code);
  insert into public.tenancies(
    id,organization_id,property_id,unit_id,household_id,lease_id,receivable_account_id,possession_start,possession_end,status
  ) values (
    v_tenancy_id,p_organization_id,p_property_id,p_unit_id,v_household_id,v_lease_id,v_receivable_account_id,
    v_start_date,v_end_date,case when v_start_date>current_date then 'scheduled'::public.tenancy_status else 'active'::public.tenancy_status end
  );
  insert into public.charge_schedules(
    id,organization_id,accounting_book_id,tenancy_id,receivable_account_id,charge_type,amount_minor,currency_code,
    cadence,due_day,starts_on,ends_on,next_run_on,status
  ) values (
    v_charge_schedule_id,p_organization_id,v_property.accounting_book_id,v_tenancy_id,v_receivable_account_id,'rent',v_rent_amount_minor,v_currency_code,
    v_rent_frequency,extract(day from v_due_date)::smallint,v_due_date,v_end_date,v_due_date,'active'
  );
  update public.documents set tenancy_id=v_tenancy_id,operator_supplied_unverified=true where id=v_signed_document_id;

  if v_opening_amount<>0 then
    insert into public.ledger_accounts(organization_id,accounting_book_id,account_code,account_name,account_class,normal_balance)
    values (p_organization_id,v_property.accounting_book_id,'1100','Accounts receivable','asset','debit')
    on conflict (accounting_book_id,account_code) do update set account_name=excluded.account_name
    returning id into v_ar_account_id;
    insert into public.ledger_accounts(organization_id,accounting_book_id,account_code,account_name,account_class,normal_balance)
    values (p_organization_id,v_property.accounting_book_id,'3900','Opening balance equity','equity','credit')
    on conflict (accounting_book_id,account_code) do update set account_name=excluded.account_name
    returning id into v_equity_account_id;
    insert into public.journal_transactions(
      organization_id,operating_entity_id,accounting_book_id,transaction_type,effective_date,source_type,source_id,
      idempotency_key,currency_code,correlation_id,created_by,metadata
    ) values (
      p_organization_id,v_property.operating_entity_id,v_property.accounting_book_id,'opening_balance',current_date,'tenancy',v_tenancy_id,
      'opening:'||p_idempotency_key,v_currency_code,v_correlation_id,v_actor_id,jsonb_build_object('signedDocumentId',v_signed_document_id)
    ) returning id into v_journal_transaction_id;
    if v_opening_amount>0 then
      insert into public.journal_entries(journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,debit_minor,property_id,unit_id,tenancy_id,receivable_account_id,memo)
      values (v_journal_transaction_id,p_organization_id,v_property.accounting_book_id,v_ar_account_id,v_opening_amount,p_property_id,p_unit_id,v_tenancy_id,v_receivable_account_id,'Opening resident balance');
      insert into public.journal_entries(journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,credit_minor,property_id,unit_id,tenancy_id,receivable_account_id,memo)
      values (v_journal_transaction_id,p_organization_id,v_property.accounting_book_id,v_equity_account_id,v_opening_amount,p_property_id,p_unit_id,v_tenancy_id,v_receivable_account_id,'Opening resident balance offset');
    else
      insert into public.journal_entries(journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,debit_minor,property_id,unit_id,tenancy_id,receivable_account_id,memo)
      values (v_journal_transaction_id,p_organization_id,v_property.accounting_book_id,v_equity_account_id,abs(v_opening_amount),p_property_id,p_unit_id,v_tenancy_id,v_receivable_account_id,'Opening resident credit offset');
      insert into public.journal_entries(journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,credit_minor,property_id,unit_id,tenancy_id,receivable_account_id,memo)
      values (v_journal_transaction_id,p_organization_id,v_property.accounting_book_id,v_ar_account_id,abs(v_opening_amount),p_property_id,p_unit_id,v_tenancy_id,v_receivable_account_id,'Opening resident credit');
    end if;
  end if;

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data) values
    (p_organization_id,v_actor_id,'user','lease.recorded','lease',v_lease_id,v_correlation_id,jsonb_build_object('source',v_source,'signedDocumentId',v_signed_document_id,'operatorSuppliedUnverified',true)),
    (p_organization_id,v_actor_id,'user','tenancy.activated','tenancy',v_tenancy_id,v_correlation_id,jsonb_build_object('householdId',v_household_id,'unitId',p_unit_id,'receivableAccountId',v_receivable_account_id)),
    (p_organization_id,v_actor_id,'user','charge_schedule.created','charge_schedule',v_charge_schedule_id,v_correlation_id,jsonb_build_object('tenancyId',v_tenancy_id,'amountMinor',v_rent_amount_minor,'currencyCode',v_currency_code));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload) values
    (p_organization_id,'lease.recorded','lease',v_lease_id,v_correlation_id,jsonb_build_object('leaseId',v_lease_id,'tenancyId',v_tenancy_id)),
    (p_organization_id,'tenancy.activated','tenancy',v_tenancy_id,v_correlation_id,jsonb_build_object('tenancyId',v_tenancy_id,'householdId',v_household_id,'receivableAccountId',v_receivable_account_id)),
    (p_organization_id,'charge_schedule.created','charge_schedule',v_charge_schedule_id,v_correlation_id,jsonb_build_object('chargeScheduleId',v_charge_schedule_id,'tenancyId',v_tenancy_id));
  if v_opening_amount<>0 then
    insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values (p_organization_id,v_actor_id,'user','opening_balance.posted','journal_transaction',v_journal_transaction_id,v_correlation_id,jsonb_build_object('tenancyId',v_tenancy_id,'amountMinor',v_opening_amount,'currencyCode',v_currency_code));
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (p_organization_id,'opening_balance.posted','journal_transaction',v_journal_transaction_id,v_correlation_id,jsonb_build_object('journalTransactionId',v_journal_transaction_id,'tenancyId',v_tenancy_id));
  end if;

  v_response := jsonb_build_object(
    'householdId',v_household_id,'leaseId',v_lease_id,'tenancyId',v_tenancy_id,
    'receivableAccountId',v_receivable_account_id,'chargeScheduleId',v_charge_schedule_id
  );
  update private.idempotency_records r set state='completed',response_status=201,response_body=v_response,
    resource_type='tenancy',resource_id=v_tenancy_id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='ActivateExistingLease' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;

revoke all on function public.activate_existing_lease(uuid,uuid,uuid,jsonb,jsonb,bigint,date,text) from public,anon;
grant execute on function public.activate_existing_lease(uuid,uuid,uuid,jsonb,jsonb,bigint,date,text) to authenticated;

alter table public.people enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.leases enable row level security;
alter table public.receivable_accounts enable row level security;
alter table public.tenancies enable row level security;
alter table public.user_relationships enable row level security;
alter table public.ledger_accounts enable row level security;
alter table public.journal_transactions enable row level security;
alter table public.journal_entries enable row level security;
alter table public.charge_schedules enable row level security;

drop policy properties_scoped_read on public.properties;
create policy properties_scoped_read on public.properties for select to authenticated using (
  private.has_property_access(id,'property.read') or private.has_property_access(id,'property.manage')
  or exists(select 1 from public.tenancies t where t.property_id=properties.id and private.is_resident_for_tenancy(t.id))
);
drop policy units_scoped_read on public.units;
create policy units_scoped_read on public.units for select to authenticated using (
  private.has_property_access(property_id,'property.read') or private.has_property_access(property_id,'property.manage')
  or exists(select 1 from public.tenancies t where t.unit_id=units.id and private.is_resident_for_tenancy(t.id))
);
drop policy documents_scoped_read on public.documents;
create policy documents_scoped_read on public.documents for select to authenticated using (
  (property_id is not null and (private.has_property_access(property_id,'documents.read') or private.has_property_access(property_id,'documents.manage')))
  or (property_id is null and (private.has_unscoped_org_permission(organization_id,'documents.read') or private.has_unscoped_org_permission(organization_id,'documents.manage')))
  or (tenancy_id is not null and private.is_resident_for_tenancy(tenancy_id))
);

create policy people_operator_or_self_read on public.people for select to authenticated using (
  id in (select private.current_user_person_ids(organization_id))
  or exists(
    select 1 from public.household_members hm join public.tenancies t on t.organization_id=hm.organization_id and t.household_id=hm.household_id
    where hm.person_id=people.id and (private.has_property_access(t.property_id,'resident.read') or private.has_property_access(t.property_id,'resident.manage'))
  )
  or private.has_unscoped_org_permission(organization_id,'resident.read')
  or private.has_unscoped_org_permission(organization_id,'resident.manage')
);
create policy households_operator_or_resident_read on public.households for select to authenticated using (
  exists(select 1 from public.tenancies t where t.household_id=households.id and (
    private.has_property_access(t.property_id,'resident.read') or private.has_property_access(t.property_id,'resident.manage') or private.is_resident_for_tenancy(t.id)
  ))
);
create policy household_members_operator_or_resident_read on public.household_members for select to authenticated using (
  exists(select 1 from public.households h where h.id=household_id and h.organization_id=household_members.organization_id)
);
create policy leases_scoped_read on public.leases for select to authenticated using (
  private.has_property_access(property_id,'lease.read') or private.has_property_access(property_id,'lease.manage')
  or exists(select 1 from public.tenancies t where t.lease_id=leases.id and private.is_resident_for_tenancy(t.id))
);
create policy tenancies_scoped_read on public.tenancies for select to authenticated using (
  private.has_property_access(property_id,'resident.read') or private.has_property_access(property_id,'resident.manage') or private.is_resident_for_tenancy(tenancies.id)
);
create policy receivable_accounts_scoped_read on public.receivable_accounts for select to authenticated using (
  exists(select 1 from public.tenancies t where t.receivable_account_id=receivable_accounts.id and (
    private.has_property_access(t.property_id,'finance.read') or private.has_property_access(t.property_id,'finance.manage') or private.is_resident_for_tenancy(t.id)
  ))
  or private.has_unscoped_org_permission(organization_id,'finance.read') or private.has_unscoped_org_permission(organization_id,'finance.manage')
);
create policy user_relationships_self_or_admin_read on public.user_relationships for select to authenticated using (
  user_id=(select auth.uid()) or private.has_org_permission(organization_id,'organization.manage')
);
create policy ledger_accounts_operator_read on public.ledger_accounts for select to authenticated using (
  private.has_unscoped_org_permission(organization_id,'finance.read') or private.has_unscoped_org_permission(organization_id,'finance.manage')
);
create policy journal_transactions_operator_read on public.journal_transactions for select to authenticated using (
  private.has_unscoped_org_permission(organization_id,'finance.read') or private.has_unscoped_org_permission(organization_id,'finance.manage')
  or exists(select 1 from public.journal_entries e where e.journal_transaction_id=journal_transactions.id and e.property_id is not null and (
    private.has_property_access(e.property_id,'finance.read') or private.has_property_access(e.property_id,'finance.manage')
  ))
);
create policy journal_entries_operator_read on public.journal_entries for select to authenticated using (
  property_id is not null and (private.has_property_access(property_id,'finance.read') or private.has_property_access(property_id,'finance.manage'))
);
create policy charge_schedules_operator_or_resident_read on public.charge_schedules for select to authenticated using (
  exists(select 1 from public.tenancies t where t.id=charge_schedules.tenancy_id and (
    private.has_property_access(t.property_id,'finance.read') or private.has_property_access(t.property_id,'finance.manage')
  )) or private.is_resident_for_tenancy(charge_schedules.tenancy_id)
);

grant select on public.people,public.households,public.household_members,public.leases,public.receivable_accounts,
  public.tenancies,public.user_relationships,public.ledger_accounts,public.journal_transactions,public.journal_entries,
  public.charge_schedules to authenticated;
revoke insert,update,delete on public.people,public.households,public.household_members,public.leases,public.receivable_accounts,
  public.tenancies,public.user_relationships,public.ledger_accounts,public.journal_transactions,public.journal_entries,
  public.charge_schedules from anon,authenticated;

commit;
