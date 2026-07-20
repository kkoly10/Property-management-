begin;

create type public.property_status as enum ('draft','active','inactive','archived');
create type public.unit_operational_status as enum ('active','offline','renovation','retired');

insert into public.role_permissions(role_code,permission_code) values
  ('org_admin','resident.manage'),('org_admin','lease.manage'),('org_admin','finance.manage'),
  ('org_admin','maintenance.manage'),('org_admin','owner.manage'),('org_admin','documents.manage'),
  ('property_manager','resident.manage'),('property_manager','lease.manage'),('property_manager','finance.read'),
  ('property_manager','maintenance.manage'),('property_manager','owner.read'),('property_manager','documents.manage'),
  ('leasing_agent','property.read'),('leasing_agent','resident.manage'),('leasing_agent','lease.manage'),('leasing_agent','documents.manage'),
  ('accountant','property.read'),('accountant','resident.read'),('accountant','lease.read'),
  ('accountant','owner.manage'),('accountant','documents.read'),
  ('maintenance_coordinator','property.read'),('maintenance_coordinator','resident.read'),
  ('maintenance_coordinator','documents.read'),
  ('read_only_auditor','resident.read'),('read_only_auditor','lease.read'),('read_only_auditor','finance.read'),
  ('read_only_auditor','maintenance.read'),('read_only_auditor','owner.read'),('read_only_auditor','documents.read')
on conflict do nothing;

create table public.country_profiles (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  version integer not null check (version > 0),
  country_code char(2) not null check (country_code in ('US','CA','MX')),
  default_currency_code char(3) not null check (default_currency_code in ('USD','CAD','MXN')),
  supported_locales text[] not null,
  payment_method_codes text[] not null default '{}',
  status text not null check (status in ('research','configuration','sandbox','active','restricted','retired')),
  effective_from date not null,
  effective_to date,
  configuration jsonb not null default '{}'::jsonb,
  unique (code,version),
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

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  operating_entity_id uuid not null references public.operating_entities(id) on delete restrict,
  accounting_book_id uuid not null references public.accounting_books(id) on delete restrict,
  country_profile_id uuid not null references public.country_profiles(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 160),
  property_type text not null check (property_type in ('single_family','multifamily','mixed_use','student_housing','other_residential')),
  country_code char(2) not null check (country_code in ('US','CA','MX')),
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
  unique (organization_id,id),
  foreign key (organization_id,operating_entity_id) references public.operating_entities(organization_id,id) on delete restrict,
  foreign key (organization_id,accounting_book_id) references public.accounting_books(organization_id,id) on delete restrict
);
create index properties_org_status_idx on public.properties(organization_id,status);
create index properties_book_idx on public.properties(accounting_book_id,status);
create index properties_name_idx on public.properties(organization_id,lower(name));

alter table public.membership_property_scopes
  add constraint membership_property_scopes_property_fk
  foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete cascade;

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  code text not null,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id,code),
  unique (organization_id,id),
  foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  building_id uuid references public.buildings(id) on delete restrict,
  unit_code text not null check (length(trim(unit_code)) between 1 and 80),
  unit_type text,
  bedrooms numeric(4,1) check (bedrooms is null or bedrooms >= 0),
  bathrooms numeric(4,1) check (bathrooms is null or bathrooms >= 0),
  square_feet integer check (square_feet is null or square_feet >= 0),
  operational_status public.unit_operational_status not null default 'active',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id,unit_code),
  unique (organization_id,id),
  unique (organization_id,property_id,id),
  foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict,
  foreign key (organization_id,building_id) references public.buildings(organization_id,id) on delete restrict
);
create index units_property_status_idx on public.units(property_id,operational_status);

create table public.plan_entitlements (
  plan_code text not null references public.plan_catalog(code) on delete cascade,
  feature_code text not null,
  limit_value numeric,
  enabled boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  primary key (plan_code,feature_code)
);

insert into public.plan_entitlements(plan_code,feature_code,limit_value) values
  ('free','core.unit',1),('starter','core.unit',10),('growth','core.unit',50),('pro','core.unit',150)
on conflict (plan_code,feature_code) do update set limit_value=excluded.limit_value,enabled=true;

create table public.usage_meter_definitions (
  code text primary key,
  unit_name text not null,
  aggregation text not null check (aggregation in ('sum','max','last')),
  billable boolean not null default false
);
insert into public.usage_meter_definitions(code,unit_name,aggregation,billable)
values ('active_units','active unit','max',true)
on conflict (code) do nothing;

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
  unique (organization_id,meter_code,idempotency_key)
);
create index usage_records_org_meter_time_idx on public.usage_records(organization_id,meter_code,occurred_at desc);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.touch_updated_at() from public,anon,authenticated;
create trigger properties_touch before update on public.properties for each row execute function private.touch_updated_at();
create trigger buildings_touch before update on public.buildings for each row execute function private.touch_updated_at();
create trigger units_touch before update on public.units for each row execute function private.touch_updated_at();

create or replace function private.has_property_access(target_property uuid,target_permission text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties p
    join public.organization_memberships m on m.organization_id=p.organization_id
    join public.role_permissions rp on rp.role_code=m.role_code
    join public.role_definitions rd on rd.code=m.role_code
    where p.id=target_property
      and m.user_id=(select auth.uid())
      and m.status='active'
      and m.starts_at<=now()
      and (m.ends_at is null or m.ends_at>now())
      and (rp.permission_code='*' or rp.permission_code=target_permission)
      and (
        exists(select 1 from public.membership_property_scopes s where s.membership_id=m.id and s.property_id=p.id)
        or (rd.organization_wide_allowed and not exists(select 1 from public.membership_property_scopes s2 where s2.membership_id=m.id))
      )
  );
$$;

create or replace function private.has_unscoped_org_permission(target_organization uuid,target_permission text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.role_permissions rp on rp.role_code=m.role_code
    join public.role_definitions rd on rd.code=m.role_code
    where m.organization_id=target_organization
      and m.user_id=(select auth.uid())
      and m.status='active'
      and m.starts_at<=now()
      and (m.ends_at is null or m.ends_at>now())
      and rd.organization_wide_allowed
      and not exists(select 1 from public.membership_property_scopes s where s.membership_id=m.id)
      and (rp.permission_code='*' or rp.permission_code=target_permission)
  );
$$;

revoke all on function private.has_property_access(uuid,text) from public;
revoke all on function private.has_unscoped_org_permission(uuid,text) from public;
grant execute on function private.has_property_access(uuid,text) to authenticated;
grant execute on function private.has_unscoped_org_permission(uuid,text) to authenticated;

create or replace function public.create_property(
  p_organization_id uuid,
  p_operating_entity_id uuid,
  p_accounting_book_id uuid,
  p_country_profile_code text,
  p_name text,
  p_property_type text,
  p_address_line1 text,
  p_address_line2 text,
  p_locality text,
  p_subdivision_code text,
  p_postal_code text,
  p_country_code char(2),
  p_time_zone text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request_hash text;
  v_profile_id uuid;
  v_profile_country char(2);
  v_profile_currency char(3);
  v_book_currency char(3);
  v_property_id uuid;
  v_correlation_id uuid := gen_random_uuid();
  v_previous private.idempotency_records%rowtype;
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if not (
    private.has_org_permission(p_organization_id,'organization.manage')
    or private.has_unscoped_org_permission(p_organization_id,'property.manage')
  ) then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;

  v_request_hash := encode(sha256(convert_to(concat_ws('|',p_organization_id,p_operating_entity_id,p_accounting_book_id,p_country_profile_code,p_name,p_property_type,p_address_line1,p_address_line2,p_locality,p_subdivision_code,p_postal_code,p_country_code,p_time_zone),'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
    where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id and r.route='CreateProperty' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  select cp.id,cp.country_code,cp.default_currency_code
    into v_profile_id,v_profile_country,v_profile_currency
  from public.country_profiles cp
  where cp.code=p_country_profile_code
    and cp.status in ('sandbox','active')
    and cp.effective_from<=current_date
    and (cp.effective_to is null or cp.effective_to>=current_date)
  order by cp.version desc limit 1;
  if not found or v_profile_country<>p_country_code then
    raise exception using errcode='23514',message='COUNTRY_PROFILE_MISMATCH';
  end if;

  select b.functional_currency_code into v_book_currency
  from public.accounting_books b
  join public.operating_entities e on e.organization_id=b.organization_id and e.id=b.operating_entity_id
  where b.id=p_accounting_book_id
    and b.organization_id=p_organization_id
    and b.operating_entity_id=p_operating_entity_id
    and e.id=p_operating_entity_id;
  if not found then raise exception using errcode='23503',message='RESOURCE_CONFLICT'; end if;
  if v_book_currency<>v_profile_currency then raise exception using errcode='23514',message='CURRENCY_MISMATCH'; end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (p_organization_id,v_actor_id,'CreateProperty',p_idempotency_key,v_request_hash,now()+interval '24 hours');

  insert into public.properties(
    organization_id,operating_entity_id,accounting_book_id,country_profile_id,name,property_type,
    country_code,subdivision_code,locality,postal_code,address_line1,address_line2,time_zone,created_by
  ) values (
    p_organization_id,p_operating_entity_id,p_accounting_book_id,v_profile_id,trim(p_name),p_property_type,
    p_country_code,nullif(trim(p_subdivision_code),''),nullif(trim(p_locality),''),nullif(trim(p_postal_code),''),
    trim(p_address_line1),nullif(trim(p_address_line2),''),p_time_zone,v_actor_id
  ) returning id into v_property_id;

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (p_organization_id,v_actor_id,'user','property.created','property',v_property_id,v_correlation_id,
    jsonb_build_object('bookId',p_accounting_book_id,'country',p_country_code,'status','draft'));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (p_organization_id,'property.created','property',v_property_id,v_correlation_id,
    jsonb_build_object('propertyId',v_property_id,'bookId',p_accounting_book_id,'country',p_country_code));

  v_response := jsonb_build_object('propertyId',v_property_id,'status','draft');
  update private.idempotency_records r
    set state='completed',response_status=201,response_body=v_response,resource_type='property',resource_id=v_property_id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id and r.route='CreateProperty' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;

create or replace function public.create_unit(
  p_organization_id uuid,
  p_property_id uuid,
  p_building_id uuid,
  p_unit_code text,
  p_unit_type text,
  p_bedrooms numeric,
  p_bathrooms numeric,
  p_square_feet integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request_hash text;
  v_property_organization_id uuid;
  v_plan_code text;
  v_unit_limit integer;
  v_active_units integer;
  v_unit_id uuid;
  v_correlation_id uuid := gen_random_uuid();
  v_previous private.idempotency_records%rowtype;
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if not private.has_property_access(p_property_id,'property.manage') then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;

  select p.organization_id into v_property_organization_id from public.properties p where p.id=p_property_id;
  if not found or v_property_organization_id<>p_organization_id then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;

  v_request_hash := encode(sha256(convert_to(concat_ws('|',p_organization_id,p_property_id,p_building_id,p_unit_code,p_unit_type,p_bedrooms,p_bathrooms,p_square_feet),'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
    where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id and r.route='CreateUnit' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  select s.plan_code into v_plan_code
  from public.organization_subscriptions s
  where s.organization_id=p_organization_id and s.status in ('trialing','active','past_due','restricted')
  order by s.created_at desc limit 1
  for update;
  if not found then raise exception using errcode='23514',message='PLAN_UNAVAILABLE'; end if;

  select e.limit_value::integer into v_unit_limit
  from public.plan_entitlements e
  where e.plan_code=v_plan_code and e.feature_code='core.unit' and e.enabled;
  if v_unit_limit is null then raise exception using errcode='23514',message='PLAN_UNAVAILABLE'; end if;

  select count(*)::integer into v_active_units
  from public.units u
  where u.organization_id=p_organization_id and u.operational_status<>'retired' and u.archived_at is null;
  if v_active_units>=v_unit_limit then raise exception using errcode='23514',message='PLAN_LIMIT_EXCEEDED'; end if;

  if p_building_id is not null and not exists (
    select 1 from public.buildings b where b.id=p_building_id and b.organization_id=p_organization_id and b.property_id=p_property_id
  ) then raise exception using errcode='23503',message='RESOURCE_CONFLICT'; end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (p_organization_id,v_actor_id,'CreateUnit',p_idempotency_key,v_request_hash,now()+interval '24 hours');

  insert into public.units(organization_id,property_id,building_id,unit_code,unit_type,bedrooms,bathrooms,square_feet)
  values (p_organization_id,p_property_id,p_building_id,trim(p_unit_code),nullif(trim(p_unit_type),''),p_bedrooms,p_bathrooms,p_square_feet)
  returning id into v_unit_id;
  v_active_units := v_active_units+1;

  insert into public.usage_records(organization_id,meter_code,quantity,occurred_at,idempotency_key,source_type,source_id)
  values (p_organization_id,'active_units',v_active_units,now(),'CreateUnit:'||v_unit_id,'unit',v_unit_id);
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (p_organization_id,v_actor_id,'user','unit.created','unit',v_unit_id,v_correlation_id,
    jsonb_build_object('propertyId',p_property_id,'unitCode',trim(p_unit_code),'activeUnitUsage',v_active_units));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (p_organization_id,'unit.created','unit',v_unit_id,v_correlation_id,
    jsonb_build_object('propertyId',p_property_id,'unitId',v_unit_id));

  v_response := jsonb_build_object('unitId',v_unit_id,'operationalStatus','active','activeUnitUsage',v_active_units);
  update private.idempotency_records r
    set state='completed',response_status=201,response_body=v_response,resource_type='unit',resource_id=v_unit_id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id and r.route='CreateUnit' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;

revoke all on function public.create_property(uuid,uuid,uuid,text,text,text,text,text,text,text,text,char(2),text,text) from public,anon;
revoke all on function public.create_unit(uuid,uuid,uuid,text,text,numeric,numeric,integer,text) from public,anon;
grant execute on function public.create_property(uuid,uuid,uuid,text,text,text,text,text,text,text,text,char(2),text,text) to authenticated;
grant execute on function public.create_unit(uuid,uuid,uuid,text,text,numeric,numeric,integer,text) to authenticated;

alter table public.country_profiles enable row level security;
alter table public.membership_property_scopes enable row level security;
alter table public.properties enable row level security;
alter table public.buildings enable row level security;
alter table public.units enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.usage_meter_definitions enable row level security;
alter table public.usage_records enable row level security;

create policy country_profiles_authenticated_read on public.country_profiles for select to authenticated using (true);
create policy property_scopes_self_or_admin_read on public.membership_property_scopes for select to authenticated using (
  exists(select 1 from public.organization_memberships m where m.id=membership_id and m.user_id=(select auth.uid()))
  or exists(select 1 from public.organization_memberships m where m.id=membership_id and (select private.has_org_permission(m.organization_id,'organization.manage')))
);
create policy properties_scoped_read on public.properties for select to authenticated using (
  (select private.has_property_access(id,'property.read')) or (select private.has_property_access(id,'property.manage'))
);
create policy buildings_scoped_read on public.buildings for select to authenticated using (
  exists(select 1 from public.properties p where p.id=property_id)
);
create policy units_scoped_read on public.units for select to authenticated using (
  (select private.has_property_access(property_id,'property.read')) or (select private.has_property_access(property_id,'property.manage'))
);
create policy plan_entitlements_authenticated_read on public.plan_entitlements for select to authenticated using (true);
create policy usage_meter_definitions_authenticated_read on public.usage_meter_definitions for select to authenticated using (true);
create policy usage_records_org_admin_read on public.usage_records for select to authenticated using (
  (select private.has_org_permission(organization_id,'organization.manage'))
);

grant select on public.country_profiles,public.membership_property_scopes,public.properties,public.buildings,
  public.units,public.plan_entitlements,public.usage_meter_definitions,public.usage_records to authenticated;

commit;
