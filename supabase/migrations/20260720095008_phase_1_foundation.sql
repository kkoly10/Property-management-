begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists private;
create schema if not exists audit;

create type public.organization_status as enum ('trial','active','suspended','closing','closed');
create type public.membership_status as enum ('invited','active','suspended','revoked');
create type public.operating_entity_status as enum ('draft','verification_required','active','restricted','closed');
create type public.accounting_book_status as enum ('open','restricted','closed');
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

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(trim(display_name)) between 1 and 160),
  slug citext not null unique,
  headquarters_country_code char(2) not null check (headquarters_country_code in ('US','CA','MX')),
  default_locale text not null check (default_locale in ('en-US','es-MX','en-CA','fr-CA')),
  default_time_zone text not null,
  customer_path text not null check (customer_path in ('self_managing','property_manager')),
  status public.organization_status not null default 'trial',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict,
  version integer not null default 1 check (version > 0)
);

create table public.operating_entities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_name text not null,
  display_name text not null,
  country_code char(2) not null check (country_code in ('US','CA','MX')),
  entity_type text not null check (entity_type in ('individual','sole_proprietor','company','partnership','trust','other')),
  tax_identifier_last4 text,
  registration_reference text,
  status public.operating_entity_status not null default 'draft',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict,
  unique (organization_id,id),
  unique (organization_id,display_name)
);
create index operating_entities_org_status_idx on public.operating_entities(organization_id,status);

create table public.accounting_books (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  operating_entity_id uuid not null references public.operating_entities(id) on delete restrict,
  name text not null,
  functional_currency_code char(3) not null check (functional_currency_code in ('USD','CAD','MXN')),
  status public.accounting_book_status not null default 'open',
  first_posted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict,
  unique (organization_id,id),
  unique (organization_id,operating_entity_id,name),
  foreign key (organization_id,operating_entity_id) references public.operating_entities(organization_id,id) on delete restrict
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
  ('org_admin','organization.manage'),
  ('org_admin','property.manage'),
  ('property_manager','property.manage'),
  ('accountant','finance.manage'),
  ('maintenance_coordinator','maintenance.manage'),
  ('read_only_auditor','property.read')
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
create unique index organization_memberships_active_unique on public.organization_memberships(organization_id,user_id)
  where status in ('invited','active','suspended');
create index organization_memberships_user_idx on public.organization_memberships(user_id,status,organization_id);

create table public.plan_catalog (
  code text primary key check (code in ('free','starter','growth','pro')),
  display_name text not null,
  active boolean not null default true
);
insert into public.plan_catalog(code,display_name) values
  ('free','Free'),('starter','Starter'),('growth','Growth'),('pro','Pro')
on conflict do nothing;

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

create table private.idempotency_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete restrict,
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
  unique nulls not distinct (organization_id,actor_user_id,route,idempotency_key)
);
create index idempotency_expiry_idx on private.idempotency_records(expires_at);

create table audit.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete restrict,
  actor_type text not null check (actor_type in ('user','system','provider','support')),
  action_code text not null,
  resource_type text not null,
  resource_id uuid,
  request_id uuid,
  correlation_id uuid not null,
  ip_hash text,
  reason text,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_events_org_time_idx on audit.audit_events(organization_id,occurred_at desc);

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

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(user_id,display_name,locale)
  values (new.id,new.raw_user_meta_data->>'display_name',coalesce(new.raw_user_meta_data->>'locale','en-US'))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public,anon,authenticated,service_role;
create trigger auth_user_profile_created after insert on auth.users for each row execute function private.handle_new_user();

create or replace function private.is_active_org_member(target_organization uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id=target_organization
      and m.user_id=(select auth.uid())
      and m.status='active'
      and m.starts_at<=now()
      and (m.ends_at is null or m.ends_at>now())
  );
$$;

create or replace function private.has_org_permission(target_organization uuid,target_permission text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.role_permissions rp on rp.role_code=m.role_code
    where m.organization_id=target_organization
      and m.user_id=(select auth.uid())
      and m.status='active'
      and m.starts_at<=now()
      and (m.ends_at is null or m.ends_at>now())
      and (rp.permission_code='*' or rp.permission_code=target_permission)
  );
$$;

revoke all on function private.is_active_org_member(uuid) from public;
revoke all on function private.has_org_permission(uuid,text) from public;
grant execute on function private.is_active_org_member(uuid) to authenticated;
grant execute on function private.has_org_permission(uuid,text) to authenticated;

create or replace function public.create_organization(
  p_display_name text,
  p_slug text,
  p_customer_path text,
  p_headquarters_country_code char(2),
  p_default_locale text,
  p_default_time_zone text,
  p_terms_version text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  request_hash text;
  v_organization_id uuid;
  membership_id uuid;
  correlation_id uuid := gen_random_uuid();
  previous private.idempotency_records%rowtype;
  response jsonb;
begin
  if actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;

  request_hash := encode(sha256(convert_to(concat_ws('|',p_display_name,p_slug,p_customer_path,p_headquarters_country_code,p_default_locale,p_default_time_zone,p_terms_version),'UTF8')),'hex');
  select * into previous from private.idempotency_records r
    where r.organization_id is null and r.actor_user_id=actor_id and r.route='CreateOrganization' and r.idempotency_key=p_idempotency_key;
  if found then
    if previous.request_hash<>request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if previous.state='completed' then return previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (null,actor_id,'CreateOrganization',p_idempotency_key,request_hash,now()+interval '24 hours');

  insert into public.organizations(display_name,slug,customer_path,headquarters_country_code,default_locale,default_time_zone,created_by)
  values (trim(p_display_name),lower(trim(p_slug)),p_customer_path,p_headquarters_country_code,p_default_locale,p_default_time_zone,actor_id)
  returning id into v_organization_id;

  insert into public.organization_memberships(organization_id,user_id,role_code,status,invited_by)
  values (v_organization_id,actor_id,'org_owner','active',actor_id)
  returning id into membership_id;

  insert into public.organization_subscriptions(organization_id,plan_code,country_price_book,status,trial_ends_at,current_period_start,current_period_end)
  values (v_organization_id,'growth',p_headquarters_country_code,'trialing',now()+interval '14 days',now(),now()+interval '14 days');

  insert into public.consent_records(user_id,organization_id,consent_type,purpose_code,legal_document_version,status,granted_at,locale,source_surface,evidence_hash)
  values (actor_id,v_organization_id,'terms_and_privacy','workspace_creation',p_terms_version,'granted',now(),p_default_locale,'onboarding.organization',encode(sha256(convert_to(concat(actor_id,p_terms_version,correlation_id),'UTF8')),'hex'));

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (v_organization_id,actor_id,'user','organization.created','organization',v_organization_id,correlation_id,jsonb_build_object('slug',lower(trim(p_slug)),'plan','growth'));

  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (v_organization_id,'organization.created','organization',v_organization_id,correlation_id,jsonb_build_object('organizationId',v_organization_id,'actorUserId',actor_id));

  response := jsonb_build_object('organizationId',v_organization_id,'membershipId',membership_id,'roleCode','org_owner','trial',jsonb_build_object('planCode','growth','endsAt',now()+interval '14 days'));
  update private.idempotency_records r set state='completed',response_status=201,response_body=response,resource_type='organization',resource_id=v_organization_id,completed_at=now()
    where r.organization_id is null and r.actor_user_id=actor_id and r.route='CreateOrganization' and r.idempotency_key=p_idempotency_key;
  return response;
end;
$$;

create or replace function public.create_operating_entity_and_book(
  p_organization_id uuid,
  p_legal_name text,
  p_display_name text,
  p_country_code char(2),
  p_entity_type text,
  p_currency_code char(3),
  p_book_name text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  expected_currency char(3);
  request_hash text;
  entity_id uuid;
  book_id uuid;
  correlation_id uuid := gen_random_uuid();
  previous private.idempotency_records%rowtype;
  response jsonb;
begin
  if actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if not private.has_org_permission(p_organization_id,'organization.manage') then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  expected_currency := case p_country_code when 'US' then 'USD' when 'CA' then 'CAD' when 'MX' then 'MXN' end;
  if expected_currency is null or p_currency_code<>expected_currency then raise exception using errcode='23514',message='CURRENCY_MISMATCH'; end if;

  request_hash := encode(sha256(convert_to(concat_ws('|',p_organization_id,p_legal_name,p_display_name,p_country_code,p_entity_type,p_currency_code,p_book_name),'UTF8')),'hex');
  select * into previous from private.idempotency_records r
    where r.organization_id=p_organization_id and r.actor_user_id=actor_id and r.route='CreateOperatingEntityAndBook' and r.idempotency_key=p_idempotency_key;
  if found then
    if previous.request_hash<>request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if previous.state='completed' then return previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (p_organization_id,actor_id,'CreateOperatingEntityAndBook',p_idempotency_key,request_hash,now()+interval '24 hours');

  insert into public.operating_entities(organization_id,legal_name,display_name,country_code,entity_type,created_by)
  values (p_organization_id,trim(p_legal_name),trim(p_display_name),p_country_code,p_entity_type,actor_id)
  returning id into entity_id;

  insert into public.accounting_books(organization_id,operating_entity_id,name,functional_currency_code,created_by)
  values (p_organization_id,entity_id,trim(p_book_name),p_currency_code,actor_id)
  returning id into book_id;

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (p_organization_id,actor_id,'user','operating_entity_and_book.created','operating_entity',entity_id,correlation_id,jsonb_build_object('bookId',book_id,'currencyCode',p_currency_code));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (p_organization_id,'operating_entity.created','operating_entity',entity_id,correlation_id,jsonb_build_object('organizationId',p_organization_id,'bookId',book_id));

  response := jsonb_build_object('operatingEntityId',entity_id,'accountingBookId',book_id,'currencyCode',p_currency_code);
  update private.idempotency_records set state='completed',response_status=201,response_body=response,resource_type='operating_entity',resource_id=entity_id,completed_at=now()
    where organization_id=p_organization_id and actor_user_id=actor_id and route='CreateOperatingEntityAndBook' and idempotency_key=p_idempotency_key;
  return response;
end;
$$;

revoke all on function public.create_organization(text,text,text,char(2),text,text,text,text) from public,anon;
revoke all on function public.create_operating_entity_and_book(uuid,text,text,char(2),text,char(3),text,text) from public,anon;
grant execute on function public.create_organization(text,text,text,char(2),text,text,text,text) to authenticated;
grant execute on function public.create_operating_entity_and_book(uuid,text,text,char(2),text,char(3),text,text) to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.operating_entities enable row level security;
alter table public.accounting_books enable row level security;
alter table public.role_definitions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.plan_catalog enable row level security;
alter table public.organization_subscriptions enable row level security;
alter table public.consent_records enable row level security;

create policy profiles_self_read on public.profiles for select to authenticated using (user_id=(select auth.uid()));
create policy organizations_member_read on public.organizations for select to authenticated using ((select private.is_active_org_member(id)));
create policy operating_entities_member_read on public.operating_entities for select to authenticated using ((select private.is_active_org_member(organization_id)));
create policy accounting_books_member_read on public.accounting_books for select to authenticated using ((select private.is_active_org_member(organization_id)));
create policy role_definitions_authenticated_read on public.role_definitions for select to authenticated using (true);
create policy role_permissions_authenticated_read on public.role_permissions for select to authenticated using (true);
create policy memberships_self_or_admin_read on public.organization_memberships for select to authenticated using (user_id=(select auth.uid()) or (select private.has_org_permission(organization_id,'organization.manage')));
create policy plan_catalog_authenticated_read on public.plan_catalog for select to authenticated using (active=true);
create policy subscriptions_member_read on public.organization_subscriptions for select to authenticated using ((select private.is_active_org_member(organization_id)));
create policy consent_self_or_admin_read on public.consent_records for select to authenticated using (user_id=(select auth.uid()) or (organization_id is not null and (select private.has_org_permission(organization_id,'organization.manage'))));

revoke all on all tables in schema public from anon,authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles,public.organizations,public.operating_entities,public.accounting_books,
  public.role_definitions,public.role_permissions,public.organization_memberships,public.plan_catalog,
  public.organization_subscriptions,public.consent_records to authenticated;

commit;
