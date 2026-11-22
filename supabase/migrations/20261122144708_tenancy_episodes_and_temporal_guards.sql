begin;

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- Older deployments still enforce the original one-live-row index. Add both
-- successor guards before removing it, so the release never widens writes
-- without both date and physical-possession protection.
alter table public.tenancies add constraint tenancies_unit_reservation_dates_excl
  exclude using gist (
    unit_id with =,
    (daterange(possession_start,possession_end,'[]')) with &&
  ) where (status in ('scheduled','active','notice_given','move_out_in_progress'));

create unique index tenancies_unit_one_physical_possession
  on public.tenancies(unit_id)
  where status in ('active','notice_given','move_out_in_progress');

create unique index homeowner_lease_setups_one_draft_per_actor_unit
  on private.homeowner_lease_setups(organization_id,actor_user_id,unit_id)
  where status='draft';

-- The existing commands and file imports all create reservations through this
-- table. Agree on unit-first locking and property-local dates at that boundary.
create function private.check_recorded_tenancy_possession()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_local_date date;
begin
  select (now() at time zone p.time_zone)::date into v_local_date
    from public.units u join public.properties p
      on p.id=u.property_id and p.organization_id=u.organization_id
    where u.id=new.unit_id and u.organization_id=new.organization_id
      and p.id=new.property_id for update of u;
  if not found then return new; end if; -- Composite foreign keys reject a bad anchor.
  if new.status in ('active','scheduled') then
    new.status:=case when new.possession_start>v_local_date then 'scheduled'::public.tenancy_status
      else 'active'::public.tenancy_status end;
  end if;
  if new.status in ('active','notice_given','move_out_in_progress') and exists (
    select 1 from public.tenancies t where t.unit_id=new.unit_id
      and t.status in ('active','notice_given','move_out_in_progress')
      and not (daterange(t.possession_start,t.possession_end,'[]')
        && daterange(new.possession_start,new.possession_end,'[]'))
  ) then
    raise exception using errcode='23P01',message='TENANCY_POSSESSION_ACTIVE';
  end if;
  return new;
end;
$$;
revoke all on function private.check_recorded_tenancy_possession() from public,anon,authenticated,service_role;

create trigger check_recorded_tenancy_possession_before_insert
  before insert on public.tenancies for each row execute function private.check_recorded_tenancy_possession();

-- The current authenticated read is compatible during rollout and always resolves deterministically.
create function public.get_homeowner_lease_episode(p_organization_id uuid,p_unit_id uuid,
  p_setup_id uuid,p_application_id uuid,p_new boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_property_id uuid; v_setup private.homeowner_lease_setups%rowtype;
  v_options jsonb; v_currency text; v_day text; v_possession_status text; v_previous_setups jsonb;
begin
  v_property_id:=private.require_homeowner_lease_scope(p_organization_id,p_unit_id);
  if (p_setup_id is not null)::integer + (p_application_id is not null)::integer + coalesce(p_new,false)::integer > 1 then
    raise exception using errcode='22023',message='INVALID_SETUP_SELECTOR';
  end if;
  select * into v_setup from private.homeowner_lease_setups
    where organization_id=p_organization_id and unit_id=p_unit_id and actor_user_id=auth.uid()
      and (p_setup_id is null or id=p_setup_id)
      and (p_application_id is null or source_rental_application_id=p_application_id)
      and (not coalesce(p_new,false) or status='draft')
    order by (status='draft') desc,updated_at desc,id limit 1;
  if not found and (p_setup_id is not null or p_application_id is not null) then
    raise exception using errcode='P0002',message='SETUP_NOT_FOUND';
  end if;
  select t.status::text into v_possession_status from public.tenancies t
    where t.organization_id=p_organization_id and t.id=(v_setup.result->>'tenancyId')::uuid;
  select coalesce(jsonb_agg(history.item order by history.updated_at desc,history.id),'[]'::jsonb)
    into v_previous_setups
    from (
      select s.updated_at,s.id,jsonb_build_object('setupId',s.id,'householdName',s.draft->>'householdName',
        'startDate',s.draft->>'startDate','possessionStatus',t.status) as item
      from private.homeowner_lease_setups s
      join public.tenancies t on t.organization_id=s.organization_id and t.id=(s.result->>'tenancyId')::uuid
      where s.organization_id=p_organization_id and s.unit_id=p_unit_id and s.actor_user_id=auth.uid()
        and s.status='activated' and s.id is distinct from v_setup.id
      order by s.updated_at desc,s.id limit 25
    ) history;
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
    'currency',v_currency,'localDate',v_day,'propertyId',v_property_id,'possessionStatus',v_possession_status,
    'previousSetups',v_previous_setups);
end;
$$;
revoke all on function public.get_homeowner_lease_episode(uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.get_homeowner_lease_episode(uuid,uuid,uuid,uuid,boolean) to authenticated;

create or replace function public.get_homeowner_lease_setup(p_organization_id uuid,p_unit_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select public.get_homeowner_lease_episode(p_organization_id,p_unit_id,null,null,false)
$$;

-- First save uses its operation UUID as the durable episode ID, even if the HTTP response is lost.
create function public.save_homeowner_lease_episode(p_organization_id uuid,p_unit_id uuid,p_setup_id uuid,
  p_expected_revision integer,p_draft jsonb,p_operation_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_property_id uuid; v_setup private.homeowner_lease_setups%rowtype;
  v_hash text; v_id uuid:=coalesce(p_setup_id,p_operation_key); v_revision integer; v_correlation uuid:=gen_random_uuid(); v_field text; v_member jsonb;
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
    where id=v_id and organization_id=p_organization_id and unit_id=p_unit_id and actor_user_id=auth.uid() for update;
  if not found and p_setup_id is not null then
    raise exception using errcode='P0002',message='SETUP_NOT_FOUND';
  end if;
  if v_setup.id is null and exists (
    select 1 from private.homeowner_lease_setups
    where organization_id=p_organization_id and unit_id=p_unit_id and actor_user_id=auth.uid() and status='draft'
  ) then
    raise exception using errcode='23505',message='SETUP_DRAFT_ALREADY_EXISTS';
  end if;
  v_hash:=encode(sha256(convert_to(jsonb_build_object('revision',p_expected_revision,'draft',p_draft)::text,'UTF8')),'hex');
  if v_setup.last_save_key=p_operation_key then
    if v_setup.last_save_hash<>v_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    return public.get_homeowner_lease_episode(p_organization_id,p_unit_id,v_id,null,false);
  end if;
  if v_setup.status='activated' then raise exception using errcode='23505',message='SETUP_ALREADY_ACTIVATED'; end if;
  if coalesce(v_setup.revision,0)<>p_expected_revision then
    raise exception using errcode='23505',message='SETUP_REVISION_CONFLICT';
  end if;
  v_revision:=p_expected_revision+1;
  if v_setup.id is null then
    insert into private.homeowner_lease_setups(id,organization_id,unit_id,actor_user_id,revision,draft,last_save_key,last_save_hash)
      values(v_id,p_organization_id,p_unit_id,auth.uid(),v_revision,p_draft,p_operation_key,v_hash);
  else
    update private.homeowner_lease_setups set revision=v_revision,draft=p_draft,last_save_key=p_operation_key,
      last_save_hash=v_hash,updated_at=now() where id=v_id;
  end if;
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values(p_organization_id,auth.uid(),'user','homeowner_lease.draft_saved','homeowner_lease_setup',v_id,v_correlation,
      jsonb_build_object('unitId',p_unit_id,'revision',v_revision));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values(p_organization_id,'homeowner_lease.draft_saved','homeowner_lease_setup',v_id,v_correlation,
      jsonb_build_object('setupId',v_id,'revision',v_revision));
  return public.get_homeowner_lease_episode(p_organization_id,p_unit_id,v_id,null,false);
end;
$$;
revoke all on function public.save_homeowner_lease_episode(uuid,uuid,uuid,integer,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_homeowner_lease_episode(uuid,uuid,uuid,integer,jsonb,uuid) to authenticated;

-- Preserve the existing scoped activation and ledger implementation while pinning the episode target.
create function public.activate_homeowner_lease_episode(p_organization_id uuid,p_unit_id uuid,p_setup_id uuid,
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
  select * into v_setup from private.homeowner_lease_setups where id=p_setup_id and organization_id=p_organization_id
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
  v_result:=v_result||jsonb_build_object('possessionStatus',(select t.status from public.tenancies t
    where t.organization_id=p_organization_id and t.id=(v_result->>'tenancyId')::uuid),'people',v_people,'documentVersionId',v_version_id,
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
revoke all on function public.activate_homeowner_lease_episode(uuid,uuid,uuid,integer,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function public.activate_homeowner_lease_episode(uuid,uuid,uuid,integer,boolean,boolean) to authenticated;

create or replace function public.prepare_rental_application_lease(
  p_organization_id uuid, p_application_id uuid, p_expected_version integer, p_operation_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid(); v_app public.rental_applications%rowtype;
  v_setup private.homeowner_lease_setups%rowtype; v_property_id uuid; v_unit_id uuid;
  v_actor_scope text; v_hash text; v_previous private.idempotency_records%rowtype;
  v_draft jsonb; v_rent_text text; v_setup_id uuid; v_corr uuid:=gen_random_uuid(); v_response jsonb;
begin
  if v_actor is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_expected_version is null or p_expected_version<1 or p_operation_key is null then
    raise exception using errcode='22023',message='INVALID_APPLICATION_PREPARATION';
  end if;
  select unit_id into v_unit_id from public.rental_applications a
    where a.id=p_application_id and a.organization_id=p_organization_id;
  if not found then raise exception using errcode='P0002',message='APPLICATION_NOT_FOUND'; end if;
  perform 1 from public.units u where u.id=v_unit_id and u.organization_id=p_organization_id for update;
  select * into v_app from public.rental_applications a
    where a.id=p_application_id and a.organization_id=p_organization_id for update;
  v_property_id:=private.require_homeowner_lease_scope(p_organization_id,v_app.unit_id);
  if v_property_id<>v_app.property_id then raise exception using errcode='42501',message='APPLICATION_SCOPE_DENIED'; end if;

  v_actor_scope:='user:'||v_actor::text;
  v_hash:=encode(sha256(convert_to(jsonb_build_object(
    'applicationId',p_application_id,'expectedVersion',p_expected_version,'operationKey',p_operation_key
  )::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',p_organization_id,v_actor_scope,'PrepareRentalApplicationLease',p_operation_key::text
  ),0));  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_scope=v_actor_scope
    and r.route='PrepareRentalApplicationLease' and r.idempotency_key=p_operation_key::text;
  if found then
    if v_previous.request_hash<>v_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;
  if v_app.version<>p_expected_version then raise exception using errcode='40001',message='APPLICATION_VERSION_CONFLICT'; end if;
  if v_app.status='lease_preparation' then
    select * into v_setup from private.homeowner_lease_setups s
      where s.source_rental_application_id=v_app.id
        and s.actor_user_id=v_actor and s.status='draft';
    if found then
      return jsonb_build_object('applicationId',v_app.id,'applicationReference',v_app.public_reference,
        'status',v_app.status,'applicationVersion',v_app.version,'setupId',v_setup.id,
        'setupRevision',v_setup.revision,'unitId',v_app.unit_id);
    end if;
    raise exception using errcode='23505',message='APPLICATION_PREPARATION_OWNED_BY_ANOTHER_ACTOR';
  end if;
  if v_app.status<>'submitted' then
    raise exception using errcode='23514',message='APPLICATION_NOT_READY_FOR_LEASE';
  end if;
  if exists(select 1 from public.rental_applications x
      where x.organization_id=p_organization_id and x.unit_id=v_app.unit_id
        and x.status='lease_preparation' and x.id<>v_app.id) then
    raise exception using errcode='23505',message='ANOTHER_APPLICATION_IN_LEASE_PREPARATION';
  end if;
  select * into v_setup from private.homeowner_lease_setups s
    where s.organization_id=p_organization_id and s.actor_user_id=v_actor and s.unit_id=v_app.unit_id
      and s.status='draft' for update;
  if found then
    raise exception using errcode='23505',message='LEASE_SETUP_ALREADY_IN_PROGRESS';
  end if;

  v_rent_text:=(v_app.listing_rent_amount_minor/100)::text||'.'||
    lpad((v_app.listing_rent_amount_minor%100)::text,2,'0');
  v_draft:=jsonb_build_object(
    'householdName',concat_ws(' ',v_app.first_name,v_app.last_name)||' household',
    'members',jsonb_build_array(jsonb_build_object(
      'firstName',v_app.first_name,'lastName',v_app.last_name,'email',v_app.email::text,
      'phoneE164','','primaryContact',true,'financiallyResponsible',true
    )),
    'startDate',case when v_app.desired_move_in_on>(
      select (now() at time zone p.time_zone)::date from public.properties p
      where p.id=v_app.property_id and p.organization_id=p_organization_id
    ) then v_app.desired_move_in_on::text else '' end,
    'endDate','','rentAmount',v_rent_text,'rentFrequency','monthly','openingBalance','0.00',
    'firstChargeDueDate',case when v_app.desired_move_in_on>(
      select (now() at time zone p.time_zone)::date from public.properties p
      where p.id=v_app.property_id and p.organization_id=p_organization_id
    ) then v_app.desired_move_in_on::text else '' end,
    'occupancy','future','documentVersionId','','upload',null
  );  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,request_hash,expires_at
  ) values (p_organization_id,v_actor,v_actor_scope,'PrepareRentalApplicationLease',
    p_operation_key::text,v_hash,'infinity'::timestamptz);

  insert into private.homeowner_lease_setups(
    organization_id,unit_id,actor_user_id,revision,draft,last_save_key,last_save_hash,source_rental_application_id
  ) values (p_organization_id,v_app.unit_id,v_actor,1,v_draft,p_operation_key,
    encode(sha256(convert_to(jsonb_build_object('revision',0,'draft',v_draft)::text,'UTF8')),'hex'),v_app.id
  ) returning id into v_setup_id;

  update public.rental_applications set status='lease_preparation',lease_prepared_at=now(),
    updated_at=now(),version=version+1 where id=v_app.id returning * into v_app;
  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
  ) values (p_organization_id,v_actor,'user','rental_application.lease_prepared','rental_application',
    v_app.id,v_corr,jsonb_build_object('unitId',v_app.unit_id,'setupId',v_setup_id));
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (p_organization_id,'rental_application.lease_prepared','rental_application',v_app.id,v_corr,
    jsonb_build_object('applicationId',v_app.id,'unitId',v_app.unit_id,'setupId',v_setup_id));
  v_response:=jsonb_build_object('applicationId',v_app.id,'applicationReference',v_app.public_reference,
    'status',v_app.status,'applicationVersion',v_app.version,'setupId',v_setup_id,
    'setupRevision',1,'unitId',v_app.unit_id);  update private.idempotency_records r set state='completed',response_status=200,response_body=v_response,
    resource_type='rental_application',resource_id=v_app.id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_scope=v_actor_scope
    and r.route='PrepareRentalApplicationLease' and r.idempotency_key=p_operation_key::text;
  return v_response;
end; $$;

create or replace function private.prevent_rental_application_tenancy_bypass()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- The reservation was checked in its creation transaction. A later application does not
  -- veto a separately recorded reservation when it starts possession.
  if tg_op='UPDATE' then return new; end if;
  if exists (
    select 1 from public.rental_applications a
    where a.organization_id=new.organization_id and a.unit_id=new.unit_id
      and a.status='lease_preparation'
  ) then
    raise exception using errcode='23514',message='APPLICATION_LEASE_PREPARATION_ACTIVE';
  end if;
  return new;
end; $$;

-- Unit-only imports resolve actual occupancy first; ambiguous future-only matches fail validation.
create or replace function private.import_resolve_tenancy(
  p_organization_id uuid, p_property_name text, p_address_line1 text, p_locality text,
  p_country_code text, p_unit_code text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as (
  select t.id,t.status
  from public.tenancies t
  join public.properties p on p.id=t.property_id
  join public.units u on u.id=t.unit_id
  where t.organization_id=p_organization_id
    and t.status in ('scheduled','active','notice_given','move_out_in_progress')
    and lower(p.name)=lower(p_property_name)
    and lower(p.address_line1)=lower(p_address_line1)
    and lower(coalesce(p.locality,''))=lower(coalesce(p_locality,''))
    and p.country_code=p_country_code
    and lower(u.unit_code)=lower(p_unit_code)
  ), eligible as (
    select c.id from candidates c
    where c.status in ('active','notice_given','move_out_in_progress')
      or not exists(select 1 from candidates present where present.status in ('active','notice_given','move_out_in_progress'))
  )
  select min(id::text)::uuid from eligible having count(*)=1
$$;

-- Keep the scheduler RPC contract. The worker starts a due reservation only if
-- possession is available when checked under the unit lock.
create or replace function public.start_due_homeowner_tenancies(p_at timestamptz,p_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_candidate record; v_started integer:=0; v_examined integer:=0; v_correlation uuid;
begin
  if p_at is null or p_limit is null or p_limit not between 1 and 500 then
    raise exception using errcode='22023',message='INVALID_START_BATCH';
  end if;
  for v_candidate in
    select t.id,t.organization_id,t.unit_id,t.possession_start,p.time_zone
    from public.tenancies t
    join public.leases l on l.id=t.lease_id and l.organization_id=t.organization_id
    join public.properties p on p.id=t.property_id and p.organization_id=t.organization_id
    join public.units u on u.id=t.unit_id and u.organization_id=t.organization_id
    join public.accounting_books b on b.id=p.accounting_book_id and b.organization_id=t.organization_id
    join pg_timezone_names tz on tz.name=p.time_zone
    where t.status='scheduled' and l.status='active'
      and t.possession_start<=(p_at at time zone tz.name)::date
      and (t.possession_end is null or t.possession_end>=(p_at at time zone tz.name)::date)
      and u.operational_status='active' and u.archived_at is null and p.archived_at is null
      and p.status<>'archived' and b.status='open'
      and (
        l.signed_document_version_id is not null
        or exists (
          select 1 from public.documents d join public.document_versions dv
            on dv.document_id=d.id and dv.organization_id=d.organization_id
          where d.tenancy_id=t.id and d.organization_id=t.organization_id
            and d.status='active' and d.document_type in ('lease','signed_lease') and dv.upload_status='clean'
        )
      )
      and not exists (
        select 1 from public.tenancies current_possession
        where current_possession.unit_id=t.unit_id
          and current_possession.status in ('active','notice_given','move_out_in_progress')
      )
    order by t.possession_start,t.unit_id,t.id limit p_limit
  loop
    v_examined:=v_examined+1;
    perform 1 from public.units u where u.id=v_candidate.unit_id
      and u.organization_id=v_candidate.organization_id and u.operational_status='active' and u.archived_at is null
      for update skip locked;
    if not found then continue; end if;
    v_correlation:=gen_random_uuid();
    update public.tenancies t set status='active',updated_at=now()
      where t.id=v_candidate.id and t.status='scheduled'
        and t.possession_start<=(p_at at time zone v_candidate.time_zone)::date
        and (t.possession_end is null or t.possession_end>=(p_at at time zone v_candidate.time_zone)::date)
        and not exists (
          select 1 from public.tenancies current_possession where current_possession.unit_id=t.unit_id
            and current_possession.status in ('active','notice_given','move_out_in_progress')
        );
    if not found then continue; end if;
    v_started:=v_started+1;
    insert into audit.audit_events(organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
      values(v_candidate.organization_id,'system','tenancy.started','tenancy',v_candidate.id,v_correlation,
        jsonb_build_object('possessionStart',v_candidate.possession_start,'evaluatedAt',p_at,'timeZone',v_candidate.time_zone));
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
      values(v_candidate.organization_id,'tenancy.started','tenancy',v_candidate.id,v_correlation,
        jsonb_build_object('tenancyId',v_candidate.id,'possessionStart',v_candidate.possession_start));
  end loop;
  return jsonb_build_object('started',v_started,'limitReached',v_examined=p_limit,'evaluatedAt',p_at);
end;
$$;

-- The legacy core remains the financial authority. Its receipt and event must
-- now distinguish recorded future possession from an active tenancy.
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
  v_possession_status public.tenancy_status;
  v_tenancy_event text;
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
    v_start_date,v_end_date,case when v_start_date>(now() at time zone v_property.time_zone)::date then 'scheduled'::public.tenancy_status else 'active'::public.tenancy_status end
  ) returning status into v_possession_status;
  v_tenancy_event:=case when v_possession_status='scheduled' then 'tenancy.scheduled' else 'tenancy.activated' end;
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
    (p_organization_id,v_actor_id,'user',v_tenancy_event,'tenancy',v_tenancy_id,v_correlation_id,jsonb_build_object('householdId',v_household_id,'unitId',p_unit_id,'receivableAccountId',v_receivable_account_id)),
    (p_organization_id,v_actor_id,'user','charge_schedule.created','charge_schedule',v_charge_schedule_id,v_correlation_id,jsonb_build_object('tenancyId',v_tenancy_id,'amountMinor',v_rent_amount_minor,'currencyCode',v_currency_code));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload) values
    (p_organization_id,'lease.recorded','lease',v_lease_id,v_correlation_id,jsonb_build_object('leaseId',v_lease_id,'tenancyId',v_tenancy_id)),
    (p_organization_id,v_tenancy_event,'tenancy',v_tenancy_id,v_correlation_id,jsonb_build_object('tenancyId',v_tenancy_id,'householdId',v_household_id,'receivableAccountId',v_receivable_account_id)),
    (p_organization_id,'charge_schedule.created','charge_schedule',v_charge_schedule_id,v_correlation_id,jsonb_build_object('chargeScheduleId',v_charge_schedule_id,'tenancyId',v_tenancy_id));
  if v_opening_amount<>0 then
    insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values (p_organization_id,v_actor_id,'user','opening_balance.posted','journal_transaction',v_journal_transaction_id,v_correlation_id,jsonb_build_object('tenancyId',v_tenancy_id,'amountMinor',v_opening_amount,'currencyCode',v_currency_code));
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (p_organization_id,'opening_balance.posted','journal_transaction',v_journal_transaction_id,v_correlation_id,jsonb_build_object('journalTransactionId',v_journal_transaction_id,'tenancyId',v_tenancy_id));
  end if;

  v_response := jsonb_build_object(
    'householdId',v_household_id,'leaseId',v_lease_id,'tenancyId',v_tenancy_id,
    'receivableAccountId',v_receivable_account_id,'chargeScheduleId',v_charge_schedule_id,'possessionStatus',v_possession_status
  );
  update private.idempotency_records r set state='completed',response_status=201,response_body=v_response,
    resource_type='tenancy',resource_id=v_tenancy_id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='ActivateExistingLease' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;

commit;
