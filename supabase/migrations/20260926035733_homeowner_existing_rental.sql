-- Homeowner A3/A4: private resumable setup, pinned agreements, durable activation.
begin;

create table private.homeowner_lease_setups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  revision integer not null check (revision > 0),
  draft jsonb not null check (jsonb_typeof(draft)='object' and pg_column_size(draft)<=32768),
  status text not null default 'draft' check (status in ('draft','activated')),
  last_save_key uuid not null,
  last_save_hash text not null,
  result jsonb,
  activated_revision integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,actor_user_id,unit_id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id) on delete restrict,
  check ((status='draft' and result is null and activated_revision is null)
    or (status='activated' and result is not null and activated_revision=revision))
);
alter table private.homeowner_lease_setups enable row level security;
revoke all on private.homeowner_lease_setups from public,anon,authenticated;
create index homeowner_lease_setup_unit_idx on private.homeowner_lease_setups(unit_id);
create index homeowner_lease_setup_actor_idx on private.homeowner_lease_setups(actor_user_id);

alter table public.leases add column if not exists signed_document_version_id uuid;
alter table public.leases add constraint leases_signed_version_org_fk
  foreign key (organization_id,signed_document_version_id)
  references public.document_versions(organization_id,id) on delete restrict;
create index leases_signed_version_idx on public.leases(signed_document_version_id)
  where signed_document_version_id is not null;

create function private.require_homeowner_lease_scope(p_organization_id uuid,p_unit_id uuid)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_property_id uuid;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  select u.property_id into v_property_id from public.units u
  join public.organizations o on o.id=u.organization_id
  where u.id=p_unit_id and u.organization_id=p_organization_id and o.customer_path='self_managing';
  if v_property_id is null or not private.has_property_access(v_property_id,'lease.manage')
    or not private.has_property_access(v_property_id,'documents.manage') then
    raise exception using errcode='42501',message='HOMEOWNER_LEASE_SCOPE_DENIED';
  end if;
  return v_property_id;
end;
$$;
revoke all on function private.require_homeowner_lease_scope(uuid,uuid) from public,anon,authenticated;

create function public.get_homeowner_lease_setup(p_organization_id uuid,p_unit_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_property_id uuid; v_setup private.homeowner_lease_setups%rowtype;
  v_options jsonb; v_currency text; v_day text;
begin
  v_property_id:=private.require_homeowner_lease_scope(p_organization_id,p_unit_id);
  select * into v_setup from private.homeowner_lease_setups
    where organization_id=p_organization_id and unit_id=p_unit_id and actor_user_id=auth.uid();
  select b.functional_currency_code,(now() at time zone p.time_zone)::date::text into v_currency,v_day
    from public.properties p join public.accounting_books b on b.id=p.accounting_book_id
    where p.id=v_property_id and p.organization_id=p_organization_id;
  select coalesce(jsonb_agg(x.item order by x.created_at desc),'[]'::jsonb) into v_options from (
    select d.created_at,jsonb_build_object('documentId',d.id,'versionId',dv.id,'filename',dv.original_filename,
      'title',d.title,'status',dv.upload_status,'scanState',(select sj.status from private.document_scan_jobs sj
      where sj.document_version_id=dv.id order by sj.created_at desc limit 1)) as item
    from public.documents d
    join lateral (select * from public.document_versions v where v.document_id=d.id and v.organization_id=d.organization_id
      order by v.version_number desc limit 1) dv on true
    where d.organization_id=p_organization_id and d.property_id=v_property_id
      and (d.unit_id is null or d.unit_id=p_unit_id) and d.document_type in ('lease','signed_lease') and d.status='active'
      and (d.tenancy_id is null or d.tenancy_id=(v_setup.result->>'tenancyId')::uuid)
    order by d.created_at desc limit 100
  ) x;
  return jsonb_build_object('setupId',v_setup.id,'revision',coalesce(v_setup.revision,0),'draft',v_setup.draft,
    'status',coalesce(v_setup.status,'draft'),'result',v_setup.result,'documents',v_options,
    'currency',v_currency,'localDate',v_day,'propertyId',v_property_id);
end;
$$;
revoke all on function public.get_homeowner_lease_setup(uuid,uuid) from public,anon;
grant execute on function public.get_homeowner_lease_setup(uuid,uuid) to authenticated;

create function public.save_homeowner_lease_setup(p_organization_id uuid,p_unit_id uuid,
  p_expected_revision integer,p_draft jsonb,p_operation_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_property_id uuid; v_setup private.homeowner_lease_setups%rowtype;
  v_hash text; v_id uuid; v_revision integer; v_correlation uuid:=gen_random_uuid(); v_field text; v_member jsonb;
begin
  v_property_id:=private.require_homeowner_lease_scope(p_organization_id,p_unit_id);
  if p_operation_key is null or p_expected_revision is null or p_expected_revision<0
    or jsonb_typeof(p_draft) is distinct from 'object' or pg_column_size(p_draft)>32768 then
    raise exception using errcode='22023',message='INVALID_SETUP_DRAFT';
  end if;
  if exists(select 1 from jsonb_object_keys(p_draft) k where k not in
    ('householdName','members','startDate','endDate','rentAmount','rentFrequency','openingBalance',
     'firstChargeDueDate','occupancy','documentVersionId','upload')) then
    raise exception using errcode='22023',message='INVALID_SETUP_DRAFT';
  end if;
  foreach v_field in array array['householdName','startDate','endDate','rentAmount','openingBalance','firstChargeDueDate','documentVersionId'] loop
    if jsonb_typeof(p_draft->v_field) is distinct from 'string' or length(p_draft->>v_field)>160 then
      raise exception using errcode='22023',message='INVALID_SETUP_DRAFT';
    end if;
  end loop;
  if length(p_draft->>'startDate')>10 or length(p_draft->>'endDate')>10 or length(p_draft->>'firstChargeDueDate')>10
    or length(p_draft->>'rentAmount')>18 or length(p_draft->>'openingBalance')>19
    or ((p_draft->>'documentVersionId')<>'' and (p_draft->>'documentVersionId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    or coalesce(p_draft->>'occupancy','') not in ('existing','future')
    or coalesce(p_draft->>'rentFrequency','') not in ('weekly','biweekly','monthly','quarterly','semiannual','annual')
    or jsonb_typeof(p_draft->'members') is distinct from 'array' then
    raise exception using errcode='22023',message='INVALID_SETUP_DRAFT';
  end if;
  if jsonb_array_length(p_draft->'members') not between 1 and 12 then
    raise exception using errcode='22023',message='INVALID_SETUP_DRAFT';
  end if;
  for v_member in select value from jsonb_array_elements(p_draft->'members') loop
    if jsonb_typeof(v_member) is distinct from 'object' then raise exception using errcode='22023',message='INVALID_SETUP_DRAFT'; end if;
    if exists(select 1 from jsonb_object_keys(v_member) k where k not in ('firstName','lastName','email','phoneE164','primaryContact','financiallyResponsible'))
      or jsonb_typeof(v_member->'firstName') is distinct from 'string' or length(v_member->>'firstName')>100
      or jsonb_typeof(v_member->'lastName') is distinct from 'string' or length(v_member->>'lastName')>100
      or jsonb_typeof(v_member->'email') is distinct from 'string' or length(v_member->>'email')>254
      or jsonb_typeof(v_member->'phoneE164') is distinct from 'string' or length(v_member->>'phoneE164')>20
      or jsonb_typeof(v_member->'primaryContact') is distinct from 'boolean'
      or jsonb_typeof(v_member->'financiallyResponsible') is distinct from 'boolean' then
      raise exception using errcode='22023',message='INVALID_SETUP_DRAFT';
    end if;
  end loop;
  if jsonb_typeof(p_draft->'upload') is distinct from 'null' then
    if jsonb_typeof(p_draft->'upload') is distinct from 'object' then raise exception using errcode='22023',message='INVALID_SETUP_DRAFT'; end if;
    v_member:=p_draft->'upload';
    if exists(select 1 from jsonb_object_keys(v_member) k where k not in ('grantId','checksum','filename','finalizeKey'))
      or jsonb_typeof(v_member->'grantId') is distinct from 'string'
      or jsonb_typeof(v_member->'finalizeKey') is distinct from 'string'
      or jsonb_typeof(v_member->'checksum') is distinct from 'string'
      or coalesce(v_member->>'grantId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(v_member->>'finalizeKey','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(v_member->>'checksum','') !~ '^[a-f0-9]{64}$'
      or jsonb_typeof(v_member->'filename') is distinct from 'string' or length(v_member->>'filename')>255 then
      raise exception using errcode='22023',message='INVALID_SETUP_DRAFT';
    end if;
  end if;
  -- Unit first everywhere: two independent operators may draft but cannot activate it twice.
  perform 1 from public.units where id=p_unit_id and organization_id=p_organization_id for update;
  select * into v_setup from private.homeowner_lease_setups
    where organization_id=p_organization_id and unit_id=p_unit_id and actor_user_id=auth.uid() for update;
  v_hash:=encode(sha256(convert_to(jsonb_build_object('revision',p_expected_revision,'draft',p_draft)::text,'UTF8')),'hex');
  if v_setup.last_save_key=p_operation_key then
    if v_setup.last_save_hash<>v_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    return public.get_homeowner_lease_setup(p_organization_id,p_unit_id);
  end if;
  if v_setup.status='activated' then raise exception using errcode='23505',message='SETUP_ALREADY_ACTIVATED'; end if;
  if coalesce(v_setup.revision,0)<>p_expected_revision then
    raise exception using errcode='23505',message='SETUP_REVISION_CONFLICT';
  end if;
  v_revision:=p_expected_revision+1;
  insert into private.homeowner_lease_setups(organization_id,unit_id,actor_user_id,revision,draft,last_save_key,last_save_hash)
    values(p_organization_id,p_unit_id,auth.uid(),v_revision,p_draft,p_operation_key,v_hash)
    on conflict(organization_id,actor_user_id,unit_id) do update set
      revision=excluded.revision,draft=excluded.draft,last_save_key=excluded.last_save_key,
      last_save_hash=excluded.last_save_hash,updated_at=now() returning id into v_id;
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values(p_organization_id,auth.uid(),'user','homeowner_lease.draft_saved','homeowner_lease_setup',v_id,v_correlation,
      jsonb_build_object('unitId',p_unit_id,'revision',v_revision));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values(p_organization_id,'homeowner_lease.draft_saved','homeowner_lease_setup',v_id,v_correlation,
      jsonb_build_object('setupId',v_id,'revision',v_revision));
  return public.get_homeowner_lease_setup(p_organization_id,p_unit_id);
end;
$$;
revoke all on function public.save_homeowner_lease_setup(uuid,uuid,integer,jsonb,uuid) from public,anon;
grant execute on function public.save_homeowner_lease_setup(uuid,uuid,integer,jsonb,uuid) to authenticated;

-- Read the immutable finalized receipt before the HTTP path inspects an issued-only grant.
create function public.recover_document_upload(p_grant_id uuid,p_sha256_hex text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_grant private.upload_grants%rowtype; v_version public.document_versions%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  select * into v_grant from private.upload_grants where id=p_grant_id and actor_user_id=auth.uid();
  if not found or not private.user_can_manage_document_parent(auth.uid(),v_grant.organization_id,
    v_grant.parent_resource_type,v_grant.parent_resource_id) then
    raise exception using errcode='42501',message='UPLOAD_GRANT_NOT_FOUND';
  end if;
  if v_grant.status<>'finalized' then return null; end if;
  select * into v_version from public.document_versions where id=v_grant.version_id
    and document_id=v_grant.document_id and organization_id=v_grant.organization_id;
  if not found or v_version.sha256_hex is distinct from lower(p_sha256_hex) then
    raise exception using errcode='23505',message='UPLOAD_CHECKSUM_CONFLICT';
  end if;
  return jsonb_build_object('documentId',v_grant.document_id,'versionId',v_grant.version_id,
    'scanStatus',v_version.upload_status,'recovered',true);
end;
$$;
revoke all on function public.recover_document_upload(uuid,text) from public,anon;
grant execute on function public.recover_document_upload(uuid,text) to authenticated;

create function public.activate_homeowner_lease_setup(p_organization_id uuid,p_unit_id uuid,
  p_expected_revision integer,p_opening_confirmed boolean,p_agreement_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_property_id uuid; v_setup private.homeowner_lease_setups%rowtype; v_draft jsonb;
  v_property public.properties%rowtype; v_document public.documents%rowtype;
  v_version public.document_versions%rowtype; v_version_id uuid; v_document_id uuid;
  v_day date; v_start date; v_end date; v_due date; v_rent bigint; v_opening bigint;
  v_currency text; v_result jsonb; v_people jsonb; v_key text; v_corr uuid:=gen_random_uuid();
  v_member jsonb;
begin
  v_property_id:=private.require_homeowner_lease_scope(p_organization_id,p_unit_id);
  if p_expected_revision is null or p_expected_revision<1 or p_opening_confirmed is distinct from true
    or p_agreement_confirmed is distinct from true then
    raise exception using errcode='22023',message='SETUP_CONFIRMATION_REQUIRED';
  end if;
  perform 1 from public.units where id=p_unit_id and organization_id=p_organization_id for update;
  select * into v_setup from private.homeowner_lease_setups where organization_id=p_organization_id
    and unit_id=p_unit_id and actor_user_id=auth.uid() for update;
  if not found then raise exception using errcode='P0002',message='SETUP_NOT_FOUND'; end if;
  if v_setup.revision<>p_expected_revision then raise exception using errcode='23505',message='SETUP_REVISION_CONFLICT'; end if;
  -- Receipt precedes time/document side effects: a later replay must never create another tenancy.
  if v_setup.status='activated' then return v_setup.result; end if;
  v_draft:=v_setup.draft;
  if jsonb_typeof(v_draft->'upload') is distinct from 'null'
    or jsonb_typeof(v_draft->'members') is distinct from 'array'
    or coalesce(v_draft->>'occupancy','') not in ('existing','future')
    or coalesce(v_draft->>'rentFrequency','') not in ('weekly','biweekly','monthly','quarterly','semiannual','annual') then
    raise exception using errcode='22023',message='INVALID_SIGNED_RENTAL';
  end if;
  if jsonb_array_length(v_draft->'members') not between 1 and 12 then
    raise exception using errcode='22023',message='INVALID_SIGNED_RENTAL';
  end if;
  for v_member in select value from jsonb_array_elements(v_draft->'members') loop
    if jsonb_typeof(v_member) is distinct from 'object'
      or jsonb_typeof(v_member->'primaryContact') is distinct from 'boolean'
      or jsonb_typeof(v_member->'financiallyResponsible') is distinct from 'boolean'
      or ((v_member->>'primaryContact')::boolean and trim(coalesce(v_member->>'email','')) !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then
      raise exception using errcode='22023',message='INVALID_SIGNED_RENTAL';
    end if;
  end loop;
  if coalesce(v_draft->>'rentAmount','') !~ '^[0-9]{1,14}([.][0-9]{1,2})?$'
    or coalesce(v_draft->>'openingBalance','') !~ '^-?[0-9]{1,14}([.][0-9]{1,2})?$' then
    raise exception using errcode='22023',message='INVALID_RENTAL_AMOUNT';
  end if;
  if (v_draft->>'rentAmount')::numeric*100>9007199254740991
    or abs((v_draft->>'openingBalance')::numeric*100)>9007199254740991 then
    raise exception using errcode='22003',message='RENTAL_AMOUNT_OUT_OF_RANGE';
  end if;
  v_rent:=((v_draft->>'rentAmount')::numeric*100)::bigint;
  v_opening:=((v_draft->>'openingBalance')::numeric*100)::bigint;
  if v_opening<>0 and not private.has_property_access(v_property_id,'finance.manage') then
    raise exception using errcode='42501',message='FINANCE_PERMISSION_REQUIRED';
  end if;
  if coalesce(v_draft->>'startDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or coalesce(v_draft->>'firstChargeDueDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or (coalesce(v_draft->>'endDate','')<>'' and (v_draft->>'endDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
    raise exception using errcode='22007',message='INVALID_RENTAL_DATES';
  end if;
  begin
    v_start:=(v_draft->>'startDate')::date; v_end:=nullif(v_draft->>'endDate','')::date;
    v_due:=(v_draft->>'firstChargeDueDate')::date; v_version_id:=(v_draft->>'documentVersionId')::uuid;
  exception when others then raise exception using errcode='22007',message='INVALID_RENTAL_DATES_OR_DOCUMENT'; end;
  select * into v_property from public.properties where id=v_property_id and organization_id=p_organization_id;
  v_day:=(now() at time zone v_property.time_zone)::date;
  if v_due<v_day or v_due<v_start or (v_end is not null and (v_end<v_due or v_end<v_start)) then
    raise exception using errcode='22023',message='FIRST_CHARGE_CUTOVER_INVALID';
  end if;
  if (v_draft->>'occupancy'='existing' and v_start>v_day)
    or (v_draft->>'occupancy'='future' and v_start<=v_day) then
    raise exception using errcode='22023',message='OCCUPANCY_DATE_MISMATCH';
  end if;
  select document_id into v_document_id from public.document_versions
    where id=v_version_id and organization_id=p_organization_id;
  select * into v_document from public.documents where id=v_document_id
    and organization_id=p_organization_id for update;
  if not found or v_document.property_id is distinct from v_property_id
    or (v_document.unit_id is not null and v_document.unit_id<>p_unit_id)
    or v_document.status<>'active' or v_document.tenancy_id is not null
    or v_document.document_type not in ('lease','signed_lease') then
    raise exception using errcode='23514',message='SIGNED_VERSION_NOT_READY';
  end if;
  select * into v_version from public.document_versions where id=v_version_id
    and organization_id=p_organization_id and document_id=v_document_id for share;
  if not found or v_version.upload_status<>'clean' or exists(select 1 from public.document_versions
    where document_id=v_document_id and version_number>v_version.version_number) then
    raise exception using errcode='23514',message='SIGNED_VERSION_NOT_READY';
  end if;
  select functional_currency_code into v_currency from public.accounting_books where id=v_property.accounting_book_id;
  -- The shipped engine uses current_date. Scope it to this property's day for this transaction only.
  perform set_config('TimeZone',v_property.time_zone,true);
  v_key:='HRL:'||v_setup.id::text||':'||v_setup.revision::text;
  v_result:=public.activate_existing_lease(p_organization_id,v_property_id,p_unit_id,
    jsonb_build_object('displayName',v_draft->>'householdName','members',v_draft->'members'),
    jsonb_build_object('source','operator_supplied','startDate',v_start,'endDate',v_end,
      'rentAmountMinor',v_rent,'currencyCode',v_currency,'rentFrequency',v_draft->>'rentFrequency',
      'signedDocumentId',v_document_id),v_opening,v_due,v_key);
  update public.leases set signed_document_version_id=v_version_id
    where id=(v_result->>'leaseId')::uuid and organization_id=p_organization_id;
  select jsonb_agg(jsonb_build_object('personId',p.id,'name',concat_ws(' ',p.first_name,p.last_name),
    'email',p.email) order by hm.is_primary_contact desc,p.id) into v_people
    from public.household_members hm join public.people p on p.id=hm.person_id and p.organization_id=hm.organization_id
    where hm.organization_id=p_organization_id and hm.household_id=(v_result->>'householdId')::uuid;
  v_result:=v_result||jsonb_build_object('people',v_people,'documentVersionId',v_version_id,
    'firstChargeDueDate',v_due,'openingBalanceMinor',v_opening,'currency',v_currency);
  update private.homeowner_lease_setups set status='activated',activated_revision=revision,result=v_result,updated_at=now()
    where id=v_setup.id;
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values(p_organization_id,auth.uid(),'user','homeowner_lease.activated','homeowner_lease_setup',v_setup.id,v_corr,
      jsonb_build_object('revision',v_setup.revision,'tenancyId',v_result->>'tenancyId','documentVersionId',v_version_id,
        'firstChargeDueDate',v_due,'openingPositionConfirmed',true,'signedAgreementConfirmed',true));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values(p_organization_id,'homeowner_lease.activated','homeowner_lease_setup',v_setup.id,v_corr,
      jsonb_build_object('setupId',v_setup.id,'tenancyId',v_result->>'tenancyId'));
  return v_result;
end;
$$;
revoke all on function public.activate_homeowner_lease_setup(uuid,uuid,integer,boolean,boolean) from public,anon;
grant execute on function public.activate_homeowner_lease_setup(uuid,uuid,integer,boolean,boolean) to authenticated;

create function private.preserve_signed_lease_version() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.signed_document_version_id is not null and new.signed_document_version_id is distinct from old.signed_document_version_id then
    raise exception using errcode='55000',message='SIGNED_LEASE_VERSION_IMMUTABLE';
  end if;
  return new;
end;
$$;
revoke all on function private.preserve_signed_lease_version() from public,anon,authenticated;
create trigger preserve_signed_lease_version before update on public.leases
for each row execute function private.preserve_signed_lease_version();

-- Access still comes ONLY from the existing invitation-acceptance command. This trigger
-- publishes only the selected lease version to the recipient whose relationship just activated.
create function private.deliver_homeowner_signed_lease() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_row record; v_key text; v_inserted boolean; v_delivery uuid; v_corr uuid;
begin
  if new.status<>'active' or new.relationship_type<>'resident_person' then return new; end if;
  for v_row in
    select l.id as lease_id,l.signed_document_version_id as version_id from public.household_members hm
    join public.tenancies t on t.household_id=hm.household_id and t.organization_id=hm.organization_id
    join public.leases l on l.id=t.lease_id and l.organization_id=t.organization_id
    join public.document_versions dv on dv.id=l.signed_document_version_id and dv.organization_id=l.organization_id
    join public.documents d on d.id=dv.document_id and d.organization_id=dv.organization_id
    where hm.organization_id=new.organization_id and hm.person_id=new.relationship_id and hm.ends_on is null
      and t.status in ('scheduled','active','notice_given','move_out_in_progress')
      and dv.upload_status='clean' and d.status='active' and d.tenancy_id=t.id
  loop
    v_key:=v_row.lease_id::text||':'||new.relationship_id::text;
    insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
      values(new.organization_id,new.user_id,'HomeownerSignedLeasePortal',v_key,encode(sha256(convert_to(v_row.version_id::text,'UTF8')),'hex'),'infinity')
      on conflict do nothing returning true into v_inserted;
    if not coalesce(v_inserted,false) then continue; end if;
    v_delivery:=gen_random_uuid(); v_corr:=gen_random_uuid();
    insert into public.document_deliveries(id,organization_id,document_version_id,recipient_user_id,
      recipient_relationship_type,recipient_relationship_id,delivery_channel,status,delivered_at)
      values(v_delivery,new.organization_id,v_row.version_id,new.user_id,'resident_person',new.relationship_id,'portal','delivered',now());
    insert into audit.audit_events(organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
      values(new.organization_id,'system','document.delivered','document_delivery',v_delivery,v_corr,
        jsonb_build_object('documentVersionId',v_row.version_id,'recipientUserId',new.user_id,'deliveryChannel','portal','source','homeowner_signed_lease'));
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
      values(new.organization_id,'document.delivered','document_delivery',v_delivery,v_corr,
        jsonb_build_object('documentDeliveryId',v_delivery,'documentVersionId',v_row.version_id,'recipientUserId',new.user_id,'deliveryChannel','portal'));
    update private.idempotency_records set state='completed',response_status=201,
      response_body=jsonb_build_object('documentDeliveryId',v_delivery),resource_type='document_delivery',
      resource_id=v_delivery,completed_at=now() where organization_id=new.organization_id
      and actor_user_id=new.user_id and route='HomeownerSignedLeasePortal' and idempotency_key=v_key;
  end loop;
  return new;
end;
$$;
revoke all on function private.deliver_homeowner_signed_lease() from public,anon,authenticated;
create trigger deliver_homeowner_signed_lease after insert or update of status on public.user_relationships
for each row execute function private.deliver_homeowner_signed_lease();


create function public.start_due_homeowner_tenancies(p_at timestamptz,p_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row record; v_started integer:=0; v_correlation uuid;
begin
  if p_at is null or p_limit is null or p_limit not between 1 and 500 then
    raise exception using errcode='22023',message='INVALID_START_BATCH';
  end if;
  for v_row in
    select t.id,t.organization_id,t.possession_start,p.time_zone
    from public.tenancies t
    join public.leases l on l.id=t.lease_id and l.organization_id=t.organization_id
    join public.properties p on p.id=t.property_id and p.organization_id=t.organization_id
    join public.units u on u.id=t.unit_id and u.organization_id=t.organization_id
    join public.accounting_books b on b.id=p.accounting_book_id and b.organization_id=t.organization_id
    join pg_timezone_names tz on tz.name=p.time_zone
    where t.status='scheduled' and l.status='active' and l.signed_document_version_id is not null
      and t.possession_start<=(p_at at time zone tz.name)::date
      and (t.possession_end is null or t.possession_end>=(p_at at time zone tz.name)::date)
      and u.operational_status='active' and u.archived_at is null and p.archived_at is null
      and p.status<>'archived' and b.status='open'
    order by t.id limit p_limit for update of t skip locked
  loop
    v_correlation:=gen_random_uuid();
    update public.tenancies set status='active',updated_at=now() where id=v_row.id and status='scheduled';
    if not found then continue; end if;
    v_started:=v_started+1;
    insert into audit.audit_events(organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
      values(v_row.organization_id,'system','tenancy.started','tenancy',v_row.id,v_correlation,
        jsonb_build_object('possessionStart',v_row.possession_start,'evaluatedAt',p_at,'timeZone',v_row.time_zone));
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
      values(v_row.organization_id,'tenancy.started','tenancy',v_row.id,v_correlation,
        jsonb_build_object('tenancyId',v_row.id,'possessionStart',v_row.possession_start));
  end loop;
  return jsonb_build_object('started',v_started,'limitReached',v_started=p_limit,'evaluatedAt',p_at);
end;
$$;
revoke all on function public.start_due_homeowner_tenancies(timestamptz,integer) from public,anon,authenticated;
grant execute on function public.start_due_homeowner_tenancies(timestamptz,integer) to service_role;

commit;
