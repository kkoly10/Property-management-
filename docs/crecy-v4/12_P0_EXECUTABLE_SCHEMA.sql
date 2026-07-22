-- Crecy P0 executable schema baseline v4.1.1
-- PostgreSQL 15+ / Supabase. Decompose into reviewed forward-only migrations.
-- This file establishes exact P0 names and invariants. Do not run against production as one unreviewed migration.

begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists private;
create schema if not exists audit;
create schema if not exists reporting;

create type public.organization_status as enum ('trial','active','suspended','closing','closed');
create type public.membership_status as enum ('invited','active','suspended','revoked');
create type public.operating_entity_status as enum ('draft','verification_required','active','restricted','closed');
create type public.accounting_book_status as enum ('open','restricted','closed');
create type public.property_status as enum ('draft','active','inactive','archived');
create type public.unit_operational_status as enum ('active','offline','renovation','retired');
create type public.household_status as enum ('prospect','applicant','resident','former');
create type public.lease_status as enum ('draft','recorded','active','expired','terminated','superseded');
create type public.tenancy_status as enum ('scheduled','active','notice_given','move_out_in_progress','closed');
create type public.charge_status as enum ('open','partially_paid','paid','voided','written_off');
create type public.payment_status as enum ('created','pending','succeeded','failed','returned','reversed','partially_refunded','refunded','disputed');
create type public.reconciliation_status as enum ('unreconciled','partially_reconciled','reconciled','exception');
create type public.document_status as enum ('draft','active','superseded','archived');
create type public.maintenance_status as enum ('new','triaged','scheduled','in_progress','awaiting_approval','completed','closed','canceled');
create type public.maintenance_priority as enum ('low','medium','high','emergency');
create type public.work_order_status as enum ('draft','assigned','accepted','scheduled','in_progress','awaiting_approval','completed','closed','canceled');
create type public.import_status as enum ('uploaded','mapping','validating','ready','committing','completed','failed','canceled');
create type public.subscription_status as enum ('trialing','active','past_due','restricted','canceled');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  display_name text,
  primary_phone_e164 text,
  locale text not null default 'en-US',
  time_zone text,
  status text not null default 'active' check (status in ('active','locked','merged','deleted')),
  merged_into_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'merged') = (merged_into_user_id is not null))
);
create unique index profiles_phone_unique on public.profiles(primary_phone_e164) where primary_phone_e164 is not null;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(trim(display_name)) between 1 and 160),
  slug citext not null unique,
  headquarters_country_code char(2),
  default_locale text not null default 'en-US',
  default_time_zone text not null default 'UTC',
  customer_path text not null default 'self_managing' check (customer_path in ('self_managing','property_manager')),
  status public.organization_status not null default 'trial',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict,
  version integer not null default 1 check (version > 0)
);

create table public.operating_entities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_name text not null,
  display_name text not null,
  country_code char(2) not null,
  entity_type text not null check (entity_type in ('individual','sole_proprietor','company','partnership','trust','other')),
  tax_identifier_last4 text,
  registration_reference text,
  status public.operating_entity_status not null default 'draft',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict,
  unique (organization_id, id),
  unique (organization_id, display_name)
);
create index operating_entities_org_status_idx on public.operating_entities(organization_id,status);

create table public.accounting_books (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  operating_entity_id uuid not null references public.operating_entities(id) on delete restrict,
  name text not null,
  functional_currency_code char(3) not null,
  status public.accounting_book_status not null default 'open',
  first_posted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict,
  unique (organization_id, id),
  unique (organization_id, operating_entity_id, name),
  foreign key (organization_id, operating_entity_id)
    references public.operating_entities(organization_id,id) on delete restrict
);
create index accounting_books_entity_idx on public.accounting_books(operating_entity_id,status);

create table public.role_definitions (
  code text primary key,
  display_name text not null,
  is_system boolean not null default true,
  organization_wide_allowed boolean not null default false
);

create table public.role_permissions (
  role_code text not null references public.role_definitions(code) on delete cascade,
  permission_code text not null,
  primary key (role_code,permission_code)
);

insert into public.role_definitions(code,display_name,organization_wide_allowed) values
('org_owner','Organization owner',true),
('org_admin','Organization administrator',true),
('property_manager','Property manager',true),
('leasing_agent','Leasing agent',false),
('accountant','Accountant',true),
('maintenance_coordinator','Maintenance coordinator',false),
('read_only_auditor','Read-only auditor',true)
on conflict do nothing;

insert into public.role_permissions(role_code,permission_code) values
('org_owner','*'),
('org_admin','organization.manage'),('org_admin','property.manage'),('org_admin','resident.manage'),('org_admin','lease.manage'),('org_admin','finance.manage'),('org_admin','maintenance.manage'),('org_admin','owner.manage'),('org_admin','documents.manage'),
('property_manager','property.manage'),('property_manager','resident.manage'),('property_manager','lease.manage'),('property_manager','finance.read'),('property_manager','maintenance.manage'),('property_manager','owner.read'),('property_manager','documents.manage'),
('leasing_agent','property.read'),('leasing_agent','resident.manage'),('leasing_agent','lease.manage'),('leasing_agent','documents.manage'),
('accountant','property.read'),('accountant','resident.read'),('accountant','lease.read'),('accountant','finance.manage'),('accountant','owner.manage'),('accountant','documents.read'),
('maintenance_coordinator','property.read'),('maintenance_coordinator','resident.read'),('maintenance_coordinator','maintenance.manage'),('maintenance_coordinator','documents.read'),
('read_only_auditor','property.read'),('read_only_auditor','resident.read'),('read_only_auditor','lease.read'),('read_only_auditor','finance.read'),('read_only_auditor','maintenance.read'),('read_only_auditor','owner.read'),('read_only_auditor','documents.read')
on conflict do nothing;

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role_code text not null references public.role_definitions(code) on delete restrict,
  status public.membership_status not null default 'invited',
  mfa_required boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  invited_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (organization_id,id),
  check (ends_at is null or ends_at > starts_at)
);
create unique index organization_memberships_active_unique
  on public.organization_memberships(organization_id,user_id)
  where status in ('invited','active','suspended');
create index organization_memberships_user_idx on public.organization_memberships(user_id,status,organization_id);

create table public.country_profiles (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  version integer not null check (version > 0),
  country_code char(2) not null,
  default_currency_code char(3) not null,
  supported_locales text[] not null,
  payment_method_codes text[] not null default '{}',
  status text not null check (status in ('research','configuration','sandbox','active','restricted','retired')),
  effective_from date not null,
  effective_to date,
  configuration jsonb not null default '{}'::jsonb,
  unique(code,version),
  check (effective_to is null or effective_to >= effective_from)
);

insert into public.country_profiles(code,version,country_code,default_currency_code,supported_locales,payment_method_codes,status,effective_from) values
('US_NATIONAL',1,'US','USD',array['en-US','es-US'],array['ach_debit','card'],'sandbox','2026-07-19'),
('CA_NATIONAL',1,'CA','CAD',array['en-CA','fr-CA'],array['acss_debit','card'],'sandbox','2026-07-19'),
('MX_NATIONAL',1,'MX','MXN',array['es-MX','en-US'],array['mx_bank_transfer','card'],'sandbox','2026-07-19')
on conflict do nothing;

create table public.membership_property_scopes (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  membership_id uuid not null,
  property_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (membership_id,property_id),
  foreign key (organization_id,membership_id) references public.organization_memberships(organization_id,id) on delete cascade
);

create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  operating_entity_id uuid not null references public.operating_entities(id) on delete restrict,
  provider_code text not null,
  provider_account_id text not null,
  account_configuration text not null,
  dashboard_access text not null,
  fees_payer text not null,
  losses_collector text not null,
  status text not null check (status in ('pending','requirements_due','enabled','restricted','disabled')),
  capabilities jsonb not null default '{}'::jsonb,
  requirements jsonb not null default '{}'::jsonb,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_code,provider_account_id),
  foreign key (organization_id,operating_entity_id)
    references public.operating_entities(organization_id,id) on delete restrict
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  operating_entity_id uuid not null references public.operating_entities(id) on delete restrict,
  accounting_book_id uuid not null references public.accounting_books(id) on delete restrict,
  country_profile_id uuid not null references public.country_profiles(id) on delete restrict,
  name text not null,
  property_type text not null check (property_type in ('single_family','multifamily','mixed_use','student_housing','other_residential')),
  country_code char(2) not null,
  subdivision_code text,
  locality text,
  postal_code text,
  address_line1 text not null,
  address_line2 text,
  time_zone text not null,
  status public.property_status not null default 'draft',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  unique(organization_id,id),
  foreign key (organization_id,operating_entity_id)
    references public.operating_entities(organization_id,id) on delete restrict,
  foreign key (organization_id,accounting_book_id)
    references public.accounting_books(organization_id,id) on delete restrict
);
create index properties_org_status_idx on public.properties(organization_id,status);
create index properties_book_idx on public.properties(accounting_book_id,status);
create index properties_name_idx on public.properties(organization_id,lower(name));

alter table public.membership_property_scopes
  add constraint membership_property_scopes_property_fk foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete cascade;

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  code text not null,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(property_id,code),
  unique(organization_id,id),
  foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  building_id uuid references public.buildings(id) on delete restrict,
  unit_code text not null,
  unit_type text,
  bedrooms numeric(4,1) check (bedrooms is null or bedrooms >= 0),
  bathrooms numeric(4,1) check (bathrooms is null or bathrooms >= 0),
  square_feet integer check (square_feet is null or square_feet >= 0),
  operational_status public.unit_operational_status not null default 'active',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(property_id,unit_code),
  unique(organization_id,id),
  unique(organization_id,property_id,id),
  foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict
);
create index units_property_status_idx on public.units(property_id,operational_status);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  first_name text not null,
  last_name text not null,
  email citext,
  phone_e164 text,
  locale text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id)
);
create index people_org_email_idx on public.people(organization_id,email) where email is not null;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  display_name text not null,
  status public.household_status not null default 'resident',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id)
);

create table public.household_members (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  household_id uuid not null,
  person_id uuid not null,
  is_primary_contact boolean not null default false,
  is_financially_responsible boolean not null default false,
  starts_on date not null default current_date,
  ends_on date,
  primary key(household_id,person_id,starts_on),
  foreign key (organization_id,household_id) references public.households(organization_id,id) on delete restrict,
  foreign key (organization_id,person_id) references public.people(organization_id,id) on delete restrict,
  check (ends_on is null or ends_on >= starts_on)
);
create unique index household_primary_active_unique on public.household_members(household_id)
  where is_primary_contact and ends_on is null;

create table public.owner_entities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  display_name text not null,
  entity_type text not null check (entity_type in ('person','company','trust','partnership','other')),
  email citext,
  phone_e164 text,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id)
);

create table public.ownership_interests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  owner_entity_id uuid not null references public.owner_entities(id) on delete restrict,
  ownership_fraction numeric(9,8) not null check (ownership_fraction > 0 and ownership_fraction <= 1),
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  unique(property_id,owner_entity_id,effective_from)
);
create index ownership_interests_owner_idx on public.ownership_interests(owner_entity_id,effective_from,effective_to);

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
  currency_code char(3) not null,
  rent_frequency text not null default 'monthly' check (rent_frequency in ('weekly','biweekly','monthly','quarterly','semiannual','annual','custom')),
  status public.lease_status not null default 'recorded',
  executed_at timestamptz,
  supersedes_lease_id uuid references public.leases(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  check (end_date is null or end_date >= start_date)
);
create index leases_unit_status_idx on public.leases(unit_id,status,start_date,end_date);

create table public.receivable_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  accounting_book_id uuid not null references public.accounting_books(id) on delete restrict,
  public_reference text not null,
  currency_code char(3) not null,
  status text not null default 'active' check (status in ('active','closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  version integer not null default 1 check (version > 0),
  unique(organization_id,id),
  unique(organization_id,public_reference)
);

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
  unique(organization_id,id),
  unique(lease_id),
  check (possession_end is null or possession_end >= possession_start)
);
create unique index tenancies_unit_active_unique on public.tenancies(unit_id)
  where status in ('scheduled','active','notice_given','move_out_in_progress');

create table public.user_relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  relationship_type text not null check (relationship_type in ('resident_person','owner_entity','vendor_contact')),
  relationship_id uuid not null,
  status text not null default 'active' check (status in ('invited','active','revoked')),
  created_at timestamptz not null default now(),
  unique(user_id,organization_id,relationship_type,relationship_id)
);
create index user_relationships_user_idx on public.user_relationships(user_id,status,organization_id);

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
  unique(accounting_book_id,account_code),
  unique(organization_id,id)
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
  currency_code char(3) not null,
  correlation_id uuid not null default gen_random_uuid(),
  reversal_of_transaction_id uuid references public.journal_transactions(id) on delete restrict,
  created_by uuid references auth.users(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  unique(accounting_book_id,idempotency_key),
  unique(organization_id,id)
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
  owner_entity_id uuid references public.owner_entities(id) on delete restrict,
  vendor_id uuid,
  memo text,
  created_at timestamptz not null default now(),
  check ((debit_minor > 0 and credit_minor = 0) or (credit_minor > 0 and debit_minor = 0))
);
create index journal_entries_tx_idx on public.journal_entries(journal_transaction_id);
create index journal_entries_account_idx on public.journal_entries(ledger_account_id,created_at);
create index journal_entries_receivable_idx on public.journal_entries(receivable_account_id) where receivable_account_id is not null;

create table public.charge_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  accounting_book_id uuid not null references public.accounting_books(id) on delete restrict,
  tenancy_id uuid not null references public.tenancies(id) on delete restrict,
  receivable_account_id uuid not null references public.receivable_accounts(id) on delete restrict,
  charge_type text not null,
  amount_minor bigint not null check (amount_minor >= 0),
  currency_code char(3) not null,
  cadence text not null check (cadence in ('weekly','biweekly','monthly','quarterly','semiannual','annual','custom')),
  due_day smallint check (due_day is null or due_day between 1 and 31),
  starts_on date not null,
  ends_on date,
  next_run_on date,
  status text not null default 'active' check (status in ('draft','active','paused','ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  check (ends_on is null or ends_on >= starts_on)
);

create table public.charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  accounting_book_id uuid not null references public.accounting_books(id) on delete restrict,
  receivable_account_id uuid not null references public.receivable_accounts(id) on delete restrict,
  tenancy_id uuid not null references public.tenancies(id) on delete restrict,
  charge_schedule_id uuid references public.charge_schedules(id) on delete restrict,
  charge_type text not null,
  description text not null,
  due_date date not null,
  amount_minor bigint not null check (amount_minor >= 0),
  currency_code char(3) not null,
  status public.charge_status not null default 'open',
  journal_transaction_id uuid not null references public.journal_transactions(id) on delete restrict,
  voided_by_transaction_id uuid references public.journal_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(charge_schedule_id,due_date,charge_type)
);
create index charges_receivable_due_idx on public.charges(receivable_account_id,status,due_date);

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
  currency_code char(3) not null,
  status public.payment_status not null default 'created',
  reconciliation_status public.reconciliation_status not null default 'unreconciled',
  received_at timestamptz,
  journal_transaction_id uuid references public.journal_transactions(id) on delete restrict,
  reversal_payment_id uuid references public.payments(id) on delete restrict,
  manual_reason text,
  manual_evidence_document_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique(organization_id,public_reference),
  unique(organization_id,id)
);
create index payments_receivable_status_idx on public.payments(receivable_account_id,status,received_at);

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  provider_connection_id uuid references public.provider_connections(id) on delete restrict,
  method_code text not null,
  provider_payment_intent_id text,
  provider_charge_id text,
  provider_event_account_id text,
  provider_status text,
  failure_code text,
  idempotency_key text not null,
  initiated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique(organization_id,id),
  unique(provider_connection_id,provider_payment_intent_id),
  unique(organization_id,idempotency_key)
);

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
  unique(organization_id,id),
  unique(payment_id,charge_id,allocated_at)
);
create index payment_allocations_payment_idx on public.payment_allocations(payment_id) where reversed_at is null;
create index payment_allocations_charge_idx on public.payment_allocations(charge_id) where reversed_at is null;

create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  provider_refund_id text,
  amount_minor bigint not null check (amount_minor > 0),
  currency_code char(3) not null,
  reason text not null,
  status text not null default 'requested' check (status in ('requested','pending','succeeded','failed','canceled')),
  corrective_journal_transaction_id uuid references public.journal_transactions(id) on delete restrict,
  failure_code text,
  failure_detail text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique(organization_id,id),
  check (completed_at is null or completed_at >= requested_at)
);
create unique index payment_refunds_provider_unique_idx
  on public.payment_refunds(organization_id,provider_refund_id)
  where provider_refund_id is not null;
create index payment_refunds_payment_status_idx on public.payment_refunds(payment_id,status,requested_at);

create or replace function private.assert_payment_refund_limit(p_payment_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_payment_amount bigint;
  v_payment_currency char(3);
  v_refund_amount bigint;
begin
  select p.amount_minor,p.currency_code into v_payment_amount,v_payment_currency
  from public.payments p where p.id=p_payment_id;
  if not found then return; end if;
  if exists(select 1 from public.payment_refunds r where r.payment_id=p_payment_id and r.currency_code<>v_payment_currency) then
    raise exception using errcode='23514',message='REFUND_CURRENCY_MISMATCH';
  end if;
  select coalesce(sum(r.amount_minor),0) into v_refund_amount
  from public.payment_refunds r where r.payment_id=p_payment_id and r.status not in ('failed','canceled');
  if v_refund_amount>v_payment_amount then raise exception using errcode='23514',message='PAYMENT_OVERREFUNDED'; end if;
end;
$$;
revoke all on function private.assert_payment_refund_limit(uuid) from public,anon,authenticated,service_role;

create or replace function private.enforce_payment_refund_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op='DELETE' then
    perform private.assert_payment_refund_limit(old.payment_id);
  elsif tg_op='UPDATE' then
    perform private.assert_payment_refund_limit(new.payment_id);
    if old.payment_id<>new.payment_id then perform private.assert_payment_refund_limit(old.payment_id); end if;
  else
    perform private.assert_payment_refund_limit(new.payment_id);
  end if;
  return null;
end;
$$;
revoke all on function private.enforce_payment_refund_limit() from public,anon,authenticated,service_role;
create constraint trigger payment_refunds_limit
after insert or update or delete on public.payment_refunds
deferrable initially deferred for each row execute function private.enforce_payment_refund_limit();

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid references public.properties(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  tenancy_id uuid references public.tenancies(id) on delete restrict,
  owner_entity_id uuid references public.owner_entities(id) on delete restrict,
  document_type text not null,
  title text not null,
  source text not null default 'operator_supplied' check (source in ('operator_supplied','imported','system_generated')),
  status public.document_status not null default 'active',
  operator_supplied_unverified boolean not null default true,
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  unique(organization_id,id),
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  storage_bucket text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256_hex text not null check (sha256_hex ~ '^[0-9a-fA-F]{64}$'),
  original_filename text not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id) on delete restrict,
  supersedes_version_id uuid references public.document_versions(id) on delete restrict,
  upload_status text not null default 'quarantined' check (upload_status in ('quarantined','scanning','clean','rejected','deleted')),
  malware_scan_provider text,
  malware_scan_reference text,
  malware_scanned_at timestamptz,
  rejected_reason text,
  unique(organization_id,id),
  unique(document_id,version_number),
  unique(storage_bucket,storage_path)
);

alter table public.payments add constraint payments_evidence_document_fk
  foreign key (manual_evidence_document_id) references public.documents(id) on delete restrict;

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  display_name text not null,
  email citext,
  phone_e164 text,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id)
);

create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  tenancy_id uuid references public.tenancies(id) on delete restrict,
  reported_by_user_id uuid references auth.users(id) on delete restrict,
  public_reference text not null,
  category text not null,
  title text not null,
  description text not null,
  priority public.maintenance_priority not null default 'medium',
  status public.maintenance_status not null default 'new',
  access_permission text,
  preferred_times jsonb not null default '[]'::jsonb,
  target_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  unique(organization_id,id),
  unique(organization_id,property_id,id)
);
create index maintenance_requests_property_status_idx on public.maintenance_requests(property_id,status,priority,created_at);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  maintenance_request_id uuid not null references public.maintenance_requests(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  vendor_id uuid references public.vendors(id) on delete restrict,
  status public.work_order_status not null default 'draft',
  scope text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  completion_summary text,
  estimated_cost_minor bigint check (estimated_cost_minor is null or estimated_cost_minor >= 0),
  actual_cost_minor bigint check (actual_cost_minor is null or actual_cost_minor >= 0),
  currency_code char(3),
  owner_approval_required boolean not null default false,
  owner_approval_status text check (owner_approval_status is null or owner_approval_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique(organization_id,id),
  unique(organization_id,property_id,id),
  check (scheduled_end is null or scheduled_start is null or scheduled_end > scheduled_start),
  check (completed_at is null or started_at is null or completed_at >= started_at)
);
create index work_orders_property_status_idx on public.work_orders(property_id,status,scheduled_start);
create index work_orders_vendor_status_idx on public.work_orders(vendor_id,status) where vendor_id is not null;

create table reporting.owner_statement_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  accounting_book_id uuid not null references public.accounting_books(id) on delete restrict,
  owner_entity_id uuid not null references public.owner_entities(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  currency_code char(3) not null,
  income_minor bigint not null,
  expense_minor bigint not null,
  management_fee_minor bigint not null default 0,
  net_owner_position_minor bigint not null,
  snapshot_data jsonb not null,
  finalized_at timestamptz not null,
  finalized_by uuid references auth.users(id) on delete restrict,
  sha256_hex text not null,
  statement_series_id uuid not null default gen_random_uuid(),
  version_number integer not null default 1 check (version_number > 0),
  supersedes_snapshot_id uuid references reporting.owner_statement_snapshots(id) on delete restrict,
  correction_reason text,
  pdf_document_version_id uuid references public.document_versions(id) on delete restrict,
  csv_document_version_id uuid references public.document_versions(id) on delete restrict,
  unique(organization_id,id),
  unique(owner_entity_id,property_id,period_start,period_end,version_number),
  unique(statement_series_id,version_number),
  check ((version_number = 1 and supersedes_snapshot_id is null) or (version_number > 1 and supersedes_snapshot_id is not null)),
  check (period_end >= period_start)
);

alter table reporting.owner_statement_snapshots
  add constraint owner_statement_pdf_org_fk foreign key (organization_id,pdf_document_version_id) references public.document_versions(organization_id,id) on delete restrict;
alter table reporting.owner_statement_snapshots
  add constraint owner_statement_csv_org_fk foreign key (organization_id,csv_document_version_id) references public.document_versions(organization_id,id) on delete restrict;

create table public.owner_remittance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  owner_entity_id uuid not null references public.owner_entities(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  statement_snapshot_id uuid references reporting.owner_statement_snapshots(id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  currency_code char(3) not null,
  paid_outside_crecy boolean not null default true,
  external_reference text,
  recorded_at timestamptz not null,
  recorded_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(organization_id,id)
);


-- v4.1 execution-control persistence.
create table private.idempotency_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete restrict,
  actor_scope text not null check (length(actor_scope) between 3 and 200),
  route text not null,
  idempotency_key text not null,
  request_hash text not null,
  response_status integer,
  response_body jsonb,
  resource_type text,
  resource_id uuid,
  state text not null default 'processing' check (state in ('processing','completed','failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null,
  unique nulls not distinct (organization_id,actor_scope,route,idempotency_key)
);
create index idempotency_expiry_idx on private.idempotency_records(expires_at);

create table private.provider_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null,
  provider_event_id text not null,
  provider_account_id text not null,
  provider_connection_id uuid references public.provider_connections(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  payload_sha256 text not null,
  event_type text not null,
  provider_created_at timestamptz,
  received_at timestamptz not null default now(),
  processing_state text not null default 'received' check (processing_state in ('received','processing','processed','ignored','failed','dead_letter')),
  processed_at timestamptz,
  attempts integer not null default 0,
  last_error_code text,
  last_error_detail text,
  unique(provider_code,provider_account_id,provider_event_id)
);
create index provider_webhook_pending_idx on private.provider_webhook_events(received_at) where processing_state in ('received','failed');

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invitation_type text not null check (invitation_type in ('organization_member','resident_relationship','owner_relationship','vendor_relationship')),
  email citext not null,
  membership_id uuid references public.organization_memberships(id) on delete restrict,
  relationship_type text,
  relationship_id uuid,
  token_hash text not null,
  token_prefix text not null,
  locale text not null,
  redirect_surface text not null,
  status text not null default 'pending' check (status in ('pending','accepted','expired','revoked','superseded')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  invited_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(token_hash)
);
create index invitations_lookup_idx on public.invitations(organization_id,email,status,expires_at);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid references public.properties(id) on delete restrict,
  tenancy_id uuid references public.tenancies(id) on delete restrict,
  owner_entity_id uuid references public.owner_entities(id) on delete restrict,
  subject text,
  conversation_type text not null check (conversation_type in ('operator_resident','operator_owner','internal_support')),
  status text not null default 'open' check (status in ('open','closed','archived')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique(organization_id,id)
);
create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  participant_type text not null check (participant_type in ('organization_member','resident_person','owner_entity','system')),
  participant_id uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_read_message_id uuid,
  primary key(conversation_id,participant_type,participant_id),
  unique(conversation_id,user_id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete restrict,
  sender_type text not null check (sender_type in ('member','resident','owner','system')),
  body_text text not null check (length(body_text) between 1 and 10000),
  status text not null default 'sent' check (status in ('sent','redacted','deleted_by_policy')),
  sent_at timestamptz not null default now(),
  edited_at timestamptz,
  correlation_id uuid not null default gen_random_uuid(),
  unique(organization_id,id)
);
create index messages_conversation_idx on public.messages(conversation_id,sent_at,id);
ALTER TABLE public.conversation_participants
  ADD CONSTRAINT conversation_participants_conversation_org_fk
  FOREIGN KEY (organization_id,conversation_id) REFERENCES public.conversations(organization_id,id) ON DELETE CASCADE;
ALTER TABLE public.conversation_participants
  ADD CONSTRAINT conversation_participants_last_read_fk
  FOREIGN KEY (last_read_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_conversation_org_fk
  FOREIGN KEY (organization_id,conversation_id) REFERENCES public.conversations(organization_id,id) ON DELETE CASCADE;

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid references public.properties(id) on delete restrict,
  title text not null,
  body_text text not null,
  locale text not null,
  audience_type text not null check (audience_type in ('organization_residents','property_residents','selected_tenancies','owners')),
  status text not null default 'draft' check (status in ('draft','scheduled','publishing','published','canceled')),
  scheduled_at timestamptz,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique(organization_id,id)
);
create table public.announcement_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete restrict,
  recipient_relationship_type text,
  recipient_relationship_id uuid,
  delivery_status text not null default 'queued' check (delivery_status in ('queued','sent','delivered','failed','suppressed','read')),
  delivered_at timestamptz,
  read_at timestamptz,
  unique(organization_id,id),
  unique(announcement_id,recipient_user_id,recipient_relationship_type,recipient_relationship_id)
);

create table private.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  template_code text not null,
  locale text not null,
  channel text not null check (channel in ('in_app','email','sms','whatsapp','push')),
  recipient_user_id uuid references auth.users(id) on delete restrict,
  recipient_address text,
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued','processing','sent','failed','canceled','dead_letter')),
  available_at timestamptz not null default now(),
  attempts integer not null default 0,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique(channel,idempotency_key)
);
create table private.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_job_id uuid not null references private.notification_jobs(id) on delete cascade,
  provider_code text,
  provider_message_id text,
  status text not null check (status in ('accepted','delivered','bounced','failed','complained','suppressed')),
  provider_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table public.document_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  recipient_user_id uuid references auth.users(id) on delete restrict,
  recipient_relationship_type text,
  recipient_relationship_id uuid,
  delivery_channel text not null check (delivery_channel in ('portal','email','secure_link')),
  status text not null default 'queued' check (status in ('queued','sent','delivered','failed','revoked')),
  delivered_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(organization_id,id)
);
create table public.document_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_delivery_id uuid not null references public.document_deliveries(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  acknowledgement_type text not null check (acknowledgement_type in ('viewed','received','accepted','declined','signed_external')),
  legal_document_version text,
  evidence_hash text not null,
  acknowledged_at timestamptz not null default now(),
  unique(document_delivery_id,user_id,acknowledgement_type)
);

create table private.upload_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  parent_resource_type text not null,
  parent_resource_id uuid not null,
  storage_bucket text not null,
  storage_path text not null,
  allowed_mime_types text[] not null,
  maximum_size_bytes bigint not null check (maximum_size_bytes > 0),
  nonce_hash text not null,
  status text not null default 'issued' check (status in ('issued','uploaded','finalized','expired','revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(storage_bucket,storage_path),
  unique(nonce_hash)
);

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  requester_user_id uuid references auth.users(id) on delete restrict,
  request_type text not null check (request_type in ('access','correction','deletion','export','restriction','objection','withdraw_consent','appeal')),
  jurisdiction_code text,
  controller_role text not null check (controller_role in ('platform','operator','joint_review_required')),
  status text not null default 'submitted' check (status in ('submitted','identity_verification','operator_action_required','processing','fulfilled','partially_fulfilled','denied','canceled')),
  submitted_at timestamptz not null default now(),
  due_at timestamptz,
  completed_at timestamptz,
  decision_reason text,
  export_document_version_id uuid references public.document_versions(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create table private.privacy_request_jobs (
  id uuid primary key default gen_random_uuid(),
  privacy_request_id uuid not null references public.privacy_requests(id) on delete cascade,
  job_type text not null check (job_type in ('discover','export','delete','anonymize','subprocessor_notify')),
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','blocked_by_hold')),
  result jsonb,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.owner_approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  owner_entity_id uuid not null references public.owner_entities(id) on delete restrict,
  work_order_id uuid references public.work_orders(id) on delete restrict,
  approval_type text not null check (approval_type in ('work_order_estimate','work_order_actual_cost','other')),
  amount_minor bigint,
  currency_code char(3),
  status text not null default 'pending' check (status in ('pending','approved','rejected','canceled','expired')),
  requested_at timestamptz not null default now(),
  requested_by uuid references auth.users(id) on delete restrict,
  decided_at timestamptz,
  version integer not null default 1,
  unique(organization_id,id)
);
create table public.owner_approval_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  approval_request_id uuid not null references public.owner_approval_requests(id) on delete restrict,
  owner_entity_id uuid not null references public.owner_entities(id) on delete restrict,
  decision text not null check (decision in ('approved','rejected')),
  reason text,
  decided_by_user_id uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now(),
  expected_request_version integer not null,
  unique(organization_id,id),
  unique(approval_request_id)
);


create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid references public.properties(id) on delete restrict,
  import_type text not null check (import_type in ('portfolio','residents','leases','opening_balances','documents','combined')),
  status public.import_status not null default 'uploaded',
  source_document_id uuid references public.documents(id) on delete restrict,
  mapping jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  committed_at timestamptz,
  unique(organization_id,id),
  check ((import_type = 'portfolio' and property_id is null) or (import_type <> 'portfolio' and property_id is not null))
);

create table private.import_rows (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  row_number integer not null,
  source_data jsonb not null,
  normalized_data jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  proposed_action text,
  committed_resource_type text,
  committed_resource_id uuid,
  unique(import_job_id,row_number)
);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  consent_type text not null,
  purpose_code text not null,
  legal_document_version text not null,
  status text not null check (status in ('granted','withdrawn','declined','not_required')),
  granted_at timestamptz,
  withdrawn_at timestamptz,
  locale text not null,
  source_surface text not null,
  evidence_hash text not null,
  created_at timestamptz not null default now(),
  check ((status = 'granted') = (granted_at is not null))
);

create table audit.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete restrict,
  actor_type text not null check (actor_type in ('user','system','provider','support')),
  action_code text not null,
  resource_type text not null,
  resource_id uuid,
  property_id uuid references public.properties(id) on delete restrict,
  request_id uuid,
  correlation_id uuid not null,
  ip_hash text,
  reason text,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_events_org_time_idx on audit.audit_events(organization_id,occurred_at desc);
create index audit_events_resource_idx on audit.audit_events(resource_type,resource_id,occurred_at desc);

create table private.outbox_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  event_type text not null,
  event_version integer not null default 1,
  aggregate_type text not null,
  aggregate_id uuid not null,
  correlation_id uuid not null,
  causation_id uuid,
  payload jsonb not null,
  occurred_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  last_error text
);
create index outbox_pending_idx on private.outbox_events(available_at,occurred_at) where processed_at is null;

create table public.plan_catalog (
  code text primary key check (code in ('free','starter','growth','pro')),
  display_name text not null,
  active boolean not null default true
);
insert into public.plan_catalog(code,display_name) values
('free','Free'),('starter','Starter'),('growth','Growth'),('pro','Pro') on conflict do nothing;

create table public.plan_entitlements (
  plan_code text not null references public.plan_catalog(code) on delete cascade,
  feature_code text not null,
  limit_value numeric,
  enabled boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  primary key(plan_code,feature_code)
);

create table public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  plan_code text not null references public.plan_catalog(code) on delete restrict,
  country_price_book char(2) not null,
  status public.subscription_status not null default 'trialing',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index organization_subscription_current_unique on public.organization_subscriptions(organization_id)
  where status in ('trialing','active','past_due','restricted');

create table public.localized_price_books (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null,
  currency_code char(3) not null,
  code text not null,
  active_from date not null,
  active_to date,
  tax_inclusive boolean not null default false,
  status text not null default 'active' check (status in ('draft','active','retired')),
  unique(code),
  check(active_to is null or active_to >= active_from)
);
create table public.plan_prices (
  price_book_id uuid not null references public.localized_price_books(id) on delete cascade,
  plan_code text not null references public.plan_catalog(code) on delete cascade,
  billing_interval text not null check (billing_interval in ('month','year')),
  amount_minor bigint not null check (amount_minor >= 0),
  included_active_units integer not null check (included_active_units >= 0),
  additional_unit_amount_minor bigint,
  provider_price_id text,
  primary key(price_book_id,plan_code,billing_interval)
);
create table public.usage_meter_definitions (
  code text primary key,
  unit_name text not null,
  aggregation text not null check (aggregation in ('sum','max','last')),
  billable boolean not null default false
);
create table public.usage_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  meter_code text not null references public.usage_meter_definitions(code) on delete restrict,
  quantity numeric not null check (quantity >= 0),
  occurred_at timestamptz not null,
  idempotency_key text not null,
  source_type text not null,
  source_id uuid,
  created_at timestamptz not null default now(),
  unique(organization_id,meter_code,idempotency_key)
);
create table public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subscription_id uuid not null references public.organization_subscriptions(id) on delete restrict,
  provider_invoice_id text,
  currency_code char(3) not null,
  subtotal_minor bigint not null,
  tax_minor bigint not null default 0,
  total_minor bigint not null,
  status text not null check (status in ('draft','open','paid','void','uncollectible')),
  period_start timestamptz,
  period_end timestamptz,
  invoice_document_version_id uuid references public.document_versions(id) on delete restrict,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique(provider_invoice_id)
);
create table public.billing_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.billing_invoices(id) on delete cascade,
  line_type text not null check (line_type in ('subscription','unit_overage','usage','discount','tax','credit')),
  description text not null,
  quantity numeric not null,
  unit_amount_minor bigint not null,
  amount_minor bigint not null,
  metadata jsonb not null default '{}'::jsonb
);



-- v4.1 cross-organization integrity constraints.
alter table public.units add constraint units_building_org_fk foreign key (organization_id,building_id) references public.buildings(organization_id,id) on delete restrict;
alter table public.ownership_interests add constraint ownership_property_org_fk foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict;
alter table public.ownership_interests add constraint ownership_owner_org_fk foreign key (organization_id,owner_entity_id) references public.owner_entities(organization_id,id) on delete restrict;
alter table public.leases add constraint leases_property_org_fk foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict;
alter table public.leases add constraint leases_unit_org_fk foreign key (organization_id,unit_id) references public.units(organization_id,id) on delete restrict;
alter table public.leases add constraint leases_household_org_fk foreign key (organization_id,household_id) references public.households(organization_id,id) on delete restrict;
alter table public.receivable_accounts add constraint receivable_book_org_fk foreign key (organization_id,accounting_book_id) references public.accounting_books(organization_id,id) on delete restrict;
alter table public.tenancies add constraint tenancies_property_org_fk foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict;
alter table public.tenancies add constraint tenancies_unit_org_fk foreign key (organization_id,unit_id) references public.units(organization_id,id) on delete restrict;
alter table public.tenancies add constraint tenancies_household_org_fk foreign key (organization_id,household_id) references public.households(organization_id,id) on delete restrict;
alter table public.tenancies add constraint tenancies_lease_org_fk foreign key (organization_id,lease_id) references public.leases(organization_id,id) on delete restrict;
alter table public.tenancies add constraint tenancies_receivable_org_fk foreign key (organization_id,receivable_account_id) references public.receivable_accounts(organization_id,id) on delete restrict;
alter table public.ledger_accounts add constraint ledger_book_org_fk foreign key (organization_id,accounting_book_id) references public.accounting_books(organization_id,id) on delete restrict;
alter table public.journal_transactions add constraint journal_entity_org_fk foreign key (organization_id,operating_entity_id) references public.operating_entities(organization_id,id) on delete restrict;
alter table public.journal_transactions add constraint journal_book_org_fk foreign key (organization_id,accounting_book_id) references public.accounting_books(organization_id,id) on delete restrict;
alter table public.charge_schedules add constraint schedules_tenancy_org_fk foreign key (organization_id,tenancy_id) references public.tenancies(organization_id,id) on delete restrict;
alter table public.charges add constraint charges_tenancy_org_fk foreign key (organization_id,tenancy_id) references public.tenancies(organization_id,id) on delete restrict;
alter table public.payments add constraint payments_tenancy_org_fk foreign key (organization_id,tenancy_id) references public.tenancies(organization_id,id) on delete restrict;
alter table public.documents add constraint documents_property_org_fk foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict;
alter table public.documents add constraint documents_unit_org_fk foreign key (organization_id,unit_id) references public.units(organization_id,id) on delete restrict;
alter table public.documents add constraint documents_tenancy_org_fk foreign key (organization_id,tenancy_id) references public.tenancies(organization_id,id) on delete restrict;
alter table public.documents add constraint documents_owner_org_fk foreign key (organization_id,owner_entity_id) references public.owner_entities(organization_id,id) on delete restrict;
alter table public.document_versions add constraint document_versions_org_fk foreign key (organization_id,document_id) references public.documents(organization_id,id) on delete restrict;
alter table public.maintenance_requests add constraint maintenance_property_org_fk foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict;
alter table public.maintenance_requests add constraint maintenance_unit_org_fk foreign key (organization_id,unit_id) references public.units(organization_id,id) on delete restrict;
alter table public.maintenance_requests add constraint maintenance_tenancy_org_fk foreign key (organization_id,tenancy_id) references public.tenancies(organization_id,id) on delete restrict;
alter table public.work_orders add constraint work_orders_property_org_fk foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict;
alter table public.work_orders add constraint work_orders_vendor_org_fk foreign key (organization_id,vendor_id) references public.vendors(organization_id,id) on delete restrict;
alter table public.charge_schedules add constraint schedules_book_org_fk foreign key (organization_id,accounting_book_id) references public.accounting_books(organization_id,id) on delete restrict;
alter table public.charge_schedules add constraint schedules_receivable_org_fk foreign key (organization_id,receivable_account_id) references public.receivable_accounts(organization_id,id) on delete restrict;
alter table public.charges add constraint charges_book_org_fk foreign key (organization_id,accounting_book_id) references public.accounting_books(organization_id,id) on delete restrict;
alter table public.charges add constraint charges_receivable_org_fk foreign key (organization_id,receivable_account_id) references public.receivable_accounts(organization_id,id) on delete restrict;
alter table public.charges add constraint charges_schedule_org_fk foreign key (organization_id,charge_schedule_id) references public.charge_schedules(organization_id,id) on delete restrict;
alter table public.payments add constraint payments_entity_org_fk foreign key (organization_id,operating_entity_id) references public.operating_entities(organization_id,id) on delete restrict;
alter table public.payments add constraint payments_book_org_fk foreign key (organization_id,accounting_book_id) references public.accounting_books(organization_id,id) on delete restrict;
alter table public.payments add constraint payments_receivable_org_fk foreign key (organization_id,receivable_account_id) references public.receivable_accounts(organization_id,id) on delete restrict;
alter table public.payment_refunds add constraint payment_refunds_payment_org_fk foreign key (organization_id,payment_id) references public.payments(organization_id,id) on delete restrict;
alter table public.payment_refunds add constraint payment_refunds_journal_org_fk foreign key (organization_id,corrective_journal_transaction_id) references public.journal_transactions(organization_id,id) on delete restrict;
alter table public.import_jobs add constraint import_jobs_property_org_fk foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict;
alter table public.import_jobs add constraint import_jobs_source_document_org_fk foreign key (organization_id,source_document_id) references public.documents(organization_id,id) on delete restrict;
alter table public.document_deliveries add constraint document_deliveries_version_org_fk foreign key (organization_id,document_version_id) references public.document_versions(organization_id,id) on delete restrict;
alter table public.document_acknowledgements add constraint document_ack_delivery_org_fk foreign key (organization_id,document_delivery_id) references public.document_deliveries(organization_id,id) on delete restrict;
alter table public.announcement_deliveries add constraint announcement_delivery_parent_org_fk foreign key (organization_id,announcement_id) references public.announcements(organization_id,id) on delete cascade;
alter table public.announcements add constraint announcements_property_org_fk foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict;
alter table public.owner_remittance_records add constraint owner_remittance_owner_org_fk foreign key (organization_id,owner_entity_id) references public.owner_entities(organization_id,id) on delete restrict;
alter table public.owner_remittance_records add constraint owner_remittance_property_org_fk foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict;
alter table public.owner_remittance_records add constraint owner_remittance_statement_org_fk foreign key (organization_id,statement_snapshot_id) references reporting.owner_statement_snapshots(organization_id,id) on delete restrict;
alter table reporting.owner_statement_snapshots add constraint owner_statements_book_org_fk foreign key (organization_id,accounting_book_id) references public.accounting_books(organization_id,id) on delete restrict;
alter table reporting.owner_statement_snapshots add constraint owner_statements_owner_org_fk foreign key (organization_id,owner_entity_id) references public.owner_entities(organization_id,id) on delete restrict;
alter table reporting.owner_statement_snapshots add constraint owner_statements_property_org_fk foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict;
alter table public.owner_approval_requests add constraint owner_approval_owner_org_fk foreign key (organization_id,owner_entity_id) references public.owner_entities(organization_id,id) on delete restrict;
alter table public.owner_approval_requests add constraint owner_approval_property_org_fk foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict;
alter table public.owner_approval_requests add constraint owner_approval_work_order_org_fk foreign key (organization_id,work_order_id) references public.work_orders(organization_id,id) on delete restrict;
alter table public.owner_approval_requests add constraint owner_approval_work_order_property_fk foreign key (organization_id,property_id,work_order_id) references public.work_orders(organization_id,property_id,id) on delete restrict;
alter table public.owner_approval_decisions add constraint owner_decision_request_org_fk foreign key (organization_id,approval_request_id) references public.owner_approval_requests(organization_id,id) on delete restrict;
alter table public.owner_approval_decisions add constraint owner_decision_owner_org_fk foreign key (organization_id,owner_entity_id) references public.owner_entities(organization_id,id) on delete restrict;
alter table public.payment_attempts add constraint payment_attempts_payment_org_fk foreign key (organization_id,payment_id) references public.payments(organization_id,id) on delete restrict;
alter table public.payment_allocations add constraint allocations_payment_org_fk foreign key (organization_id,payment_id) references public.payments(organization_id,id) on delete restrict;
alter table public.payment_allocations add constraint allocations_charge_org_fk foreign key (organization_id,charge_id) references public.charges(organization_id,id) on delete restrict;
alter table public.work_orders add constraint work_orders_request_org_fk foreign key (organization_id,maintenance_request_id) references public.maintenance_requests(organization_id,id) on delete restrict;
alter table public.work_orders add constraint work_orders_unit_org_fk foreign key (organization_id,unit_id) references public.units(organization_id,id) on delete restrict;
alter table public.work_orders add constraint work_orders_request_property_fk foreign key (organization_id,property_id,maintenance_request_id) references public.maintenance_requests(organization_id,property_id,id) on delete restrict;
alter table public.work_orders add constraint work_orders_unit_property_fk foreign key (organization_id,property_id,unit_id) references public.units(organization_id,property_id,id) on delete restrict;

create index conversations_property_idx on public.conversations(property_id,status,updated_at) where property_id is not null;
create index announcements_property_status_idx on public.announcements(property_id,status,scheduled_at);
create index privacy_requests_status_due_idx on public.privacy_requests(status,due_at);
create index owner_approval_property_status_idx on public.owner_approval_requests(property_id,status,requested_at);
create index billing_invoices_org_period_idx on public.billing_invoices(organization_id,period_start,period_end);

-- Timestamp/version trigger for mutable tables.
create or replace function private.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if to_jsonb(new) ? 'version' then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();
create trigger organizations_touch before update on public.organizations for each row execute function private.touch_updated_at();
create trigger operating_entities_touch before update on public.operating_entities for each row execute function private.touch_updated_at();
create trigger accounting_books_touch before update on public.accounting_books for each row execute function private.touch_updated_at();
create trigger memberships_touch before update on public.organization_memberships for each row execute function private.touch_updated_at();
create trigger provider_connections_touch before update on public.provider_connections for each row execute function private.touch_updated_at();
create trigger properties_touch before update on public.properties for each row execute function private.touch_updated_at();
create trigger buildings_touch before update on public.buildings for each row execute function private.touch_updated_at();
create trigger units_touch before update on public.units for each row execute function private.touch_updated_at();
create trigger people_touch before update on public.people for each row execute function private.touch_updated_at();
create trigger households_touch before update on public.households for each row execute function private.touch_updated_at();
create trigger owners_touch before update on public.owner_entities for each row execute function private.touch_updated_at();
create trigger leases_touch before update on public.leases for each row execute function private.touch_updated_at();
create trigger tenancies_touch before update on public.tenancies for each row execute function private.touch_updated_at();
create trigger charge_schedules_touch before update on public.charge_schedules for each row execute function private.touch_updated_at();
create trigger payment_refunds_touch before update on public.payment_refunds for each row execute function private.touch_updated_at();
create trigger payments_touch before update on public.payments for each row execute function private.touch_updated_at();
create trigger vendors_touch before update on public.vendors for each row execute function private.touch_updated_at();
create trigger maintenance_touch before update on public.maintenance_requests for each row execute function private.touch_updated_at();
create trigger work_orders_touch before update on public.work_orders for each row execute function private.touch_updated_at();
create trigger subscriptions_touch before update on public.organization_subscriptions for each row execute function private.touch_updated_at();
create trigger conversations_touch before update on public.conversations for each row execute function private.touch_updated_at();
create trigger announcements_touch before update on public.announcements for each row execute function private.touch_updated_at();
create trigger privacy_requests_touch before update on public.privacy_requests for each row execute function private.touch_updated_at();
create trigger owner_approvals_touch before update on public.owner_approval_requests for each row execute function private.touch_updated_at();

-- Accounting book currency becomes immutable after first posting.
create or replace function private.enforce_accounting_book_currency_immutable()
returns trigger language plpgsql as $$
begin
  if old.first_posted_at is not null and new.functional_currency_code <> old.functional_currency_code then
    raise exception using errcode='23514', message='ACCOUNTING_BOOK_CURRENCY_IMMUTABLE';
  end if;
  return new;
end;
$$;
create trigger accounting_book_currency_immutable before update on public.accounting_books
for each row execute function private.enforce_accounting_book_currency_immutable();

-- Ensure journal transaction currency matches book and mark first posting.
create or replace function private.enforce_journal_book_currency()
returns trigger language plpgsql as $$
declare book_currency char(3);
begin
  select functional_currency_code into book_currency from public.accounting_books where id = new.accounting_book_id for update;
  if book_currency is null then raise exception using errcode='23503', message='ACCOUNTING_BOOK_NOT_FOUND'; end if;
  if book_currency <> new.currency_code then raise exception using errcode='23514', message='JOURNAL_CURRENCY_MISMATCH'; end if;
  update public.accounting_books set first_posted_at = coalesce(first_posted_at,new.posted_at)
   where id = new.accounting_book_id;
  return new;
end;
$$;
create trigger journal_book_currency before insert on public.journal_transactions
for each row execute function private.enforce_journal_book_currency();

-- Deferred journal balance check.
create or replace function private.assert_journal_balanced()
returns trigger language plpgsql as $$
declare tx_id uuid; debit_total numeric; credit_total numeric;
begin
  tx_id := coalesce(new.journal_transaction_id, old.journal_transaction_id);
  select coalesce(sum(debit_minor),0),coalesce(sum(credit_minor),0)
    into debit_total,credit_total from public.journal_entries where journal_transaction_id=tx_id;
  if debit_total = 0 or debit_total <> credit_total then
    raise exception using errcode='23514', message='JOURNAL_NOT_BALANCED', detail=tx_id::text;
  end if;
  return null;
end;
$$;
create constraint trigger journal_entries_balanced
  after insert or update or delete on public.journal_entries
  deferrable initially deferred for each row execute function private.assert_journal_balanced();

-- Deferred allocation limits.
create or replace function private.assert_allocation_limits()
returns trigger language plpgsql as $$
declare p_id uuid; c_id uuid; p_amount bigint; c_amount bigint; allocated_payment bigint; allocated_charge bigint;
begin
  p_id := coalesce(new.payment_id,old.payment_id);
  c_id := coalesce(new.charge_id,old.charge_id);
  select amount_minor into p_amount from public.payments where id=p_id;
  select amount_minor into c_amount from public.charges where id=c_id;
  select coalesce(sum(amount_minor),0) into allocated_payment from public.payment_allocations where payment_id=p_id and reversed_at is null;
  select coalesce(sum(amount_minor),0) into allocated_charge from public.payment_allocations where charge_id=c_id and reversed_at is null;
  if allocated_payment > p_amount then raise exception using errcode='23514',message='PAYMENT_OVERALLOCATED'; end if;
  if allocated_charge > c_amount then raise exception using errcode='23514',message='CHARGE_OVERALLOCATED'; end if;
  return null;
end;
$$;
create constraint trigger payment_allocations_limits
  after insert or update or delete on public.payment_allocations
  deferrable initially deferred for each row execute function private.assert_allocation_limits();

-- Financial and audit tables are append-only through ordinary roles.
create or replace function private.prevent_mutation()
returns trigger language plpgsql as $$ begin raise exception using errcode='55000',message='APPEND_ONLY_RECORD'; end; $$;
create trigger journal_transactions_append_only before update or delete on public.journal_transactions for each row execute function private.prevent_mutation();
create trigger journal_entries_append_only before update or delete on public.journal_entries for each row execute function private.prevent_mutation();
create trigger owner_statement_snapshots_append_only before update or delete on reporting.owner_statement_snapshots for each row execute function private.prevent_mutation();
create trigger audit_events_append_only before update or delete on audit.audit_events for each row execute function private.prevent_mutation();

-- Exposed table grants are explicit; RLS policies are installed by file 13.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles,public.organizations,public.operating_entities,public.accounting_books,
  public.organization_memberships,public.membership_property_scopes,public.country_profiles,
  public.provider_connections,public.properties,public.buildings,public.units,public.people,
  public.households,public.household_members,public.owner_entities,public.ownership_interests,
  public.leases,public.receivable_accounts,public.tenancies,public.user_relationships,
  public.ledger_accounts,public.journal_transactions,public.journal_entries,public.charge_schedules,
  public.charges,public.payments,public.payment_attempts,public.payment_allocations,public.payment_refunds,
  public.documents,public.document_versions,public.vendors,public.maintenance_requests,
  public.work_orders,public.import_jobs,public.consent_records,public.plan_catalog,
  public.plan_entitlements,public.organization_subscriptions,public.invitations,public.conversations,
  public.conversation_participants,public.messages,public.announcements,public.announcement_deliveries,
  public.document_deliveries,public.document_acknowledgements,public.privacy_requests,
  public.owner_approval_requests,public.owner_approval_decisions,public.localized_price_books,
  public.plan_prices,public.usage_meter_definitions,public.usage_records,public.billing_invoices,
  public.billing_invoice_lines to authenticated;

grant select on public.owner_remittance_records to authenticated;

commit;
