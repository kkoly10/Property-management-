begin;

create type public.work_order_status as enum ('draft','assigned','accepted','scheduled','in_progress','awaiting_approval','completed','closed','canceled');

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  display_name text not null check (length(trim(display_name)) between 1 and 160),
  email citext,
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (organization_id,id)
);
create index vendors_org_status_idx on public.vendors(organization_id,status);
create trigger vendors_touch before update on public.vendors for each row execute function private.touch_updated_at();

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  maintenance_request_id uuid not null references public.maintenance_requests(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  vendor_id uuid references public.vendors(id) on delete restrict,
  public_reference text not null,
  status public.work_order_status not null default 'draft',
  scope text not null check (length(trim(scope)) between 3 and 2000),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  completion_summary text check (completion_summary is null or length(trim(completion_summary)) between 3 and 4000),
  estimated_cost_minor bigint check (estimated_cost_minor is null or estimated_cost_minor >= 0),
  actual_cost_minor bigint check (actual_cost_minor is null or actual_cost_minor >= 0),
  currency_code char(3) check (currency_code is null or currency_code in ('USD','CAD','MXN')),
  owner_approval_required boolean not null default false,
  owner_approval_status text check (owner_approval_status is null or owner_approval_status in ('pending','approved','rejected')),
  canceled_reason text check (canceled_reason is null or length(trim(canceled_reason)) between 3 and 1000),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (organization_id,id),
  unique (organization_id,property_id,id),
  unique (organization_id,public_reference),
  foreign key (organization_id,maintenance_request_id) references public.maintenance_requests(organization_id,id) on delete restrict,
  foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict,
  foreign key (organization_id,property_id,unit_id) references public.units(organization_id,property_id,id) on delete restrict,
  foreign key (organization_id,vendor_id) references public.vendors(organization_id,id) on delete restrict,
  check (scheduled_end is null or scheduled_start is null or scheduled_end > scheduled_start),
  check (completed_at is null or started_at is null or completed_at >= started_at),
  check ((status = 'canceled') = (canceled_reason is not null))
);
create unique index work_orders_one_active_per_request on public.work_orders(maintenance_request_id) where status not in ('closed','canceled');
create index work_orders_property_status_idx on public.work_orders(property_id,status,scheduled_start);
create index work_orders_vendor_status_idx on public.work_orders(vendor_id,status) where vendor_id is not null;
create trigger work_orders_touch before update on public.work_orders for each row execute function private.touch_updated_at();

create table private.work_order_evidence (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  work_order_id uuid not null references public.work_orders(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (work_order_id,document_id),
  foreign key (organization_id,work_order_id) references public.work_orders(organization_id,id) on delete restrict,
  foreign key (organization_id,document_id) references public.documents(organization_id,id) on delete restrict
);
create index work_order_evidence_document_idx on private.work_order_evidence(document_id);

alter table private.upload_grants drop constraint upload_grants_parent_resource_type_check;
alter table private.upload_grants add constraint upload_grants_parent_resource_type_check
  check (parent_resource_type in ('organization','property','unit','tenancy','work_order'));

create or replace function private.user_can_manage_document_parent(
  target_user uuid,
  target_organization uuid,
  target_resource_type text,
  target_resource_id uuid
)
returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_property_id uuid;
begin
  if target_resource_type='organization' then
    return target_resource_id=target_organization and exists(
      select 1 from public.organization_memberships m
      join public.role_permissions rp on rp.role_code=m.role_code
      join public.role_definitions rd on rd.code=m.role_code
      where m.organization_id=target_organization and m.user_id=target_user and m.status='active'
        and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
        and rd.organization_wide_allowed
        and not exists(select 1 from public.membership_property_scopes s where s.membership_id=m.id)
        and (rp.permission_code='*' or rp.permission_code='documents.manage')
    );
  elsif target_resource_type='work_order' then
    select w.property_id into v_property_id from public.work_orders w
    where w.id=target_resource_id and w.organization_id=target_organization;
    if not found then return false; end if;
    return private.has_property_access(v_property_id,'maintenance.manage')
      or private.user_can_manage_document_parent(target_user,target_organization,'property',v_property_id);
  elsif target_resource_type in ('property','unit','tenancy') then
    if target_resource_type='property' then
      v_property_id := target_resource_id;
    elsif target_resource_type='unit' then
      select u.property_id into v_property_id from public.units u
      where u.id=target_resource_id and u.organization_id=target_organization;
      if not found then return false; end if;
    else
      select t.property_id into v_property_id from public.tenancies t
      where t.id=target_resource_id and t.organization_id=target_organization;
      if not found then return false; end if;
      if exists(
        select 1
        from public.tenancies t
        join public.household_members hm on hm.organization_id=t.organization_id and hm.household_id=t.household_id
        join public.user_relationships ur on ur.organization_id=t.organization_id
          and ur.relationship_type='resident_person' and ur.relationship_id=hm.person_id and ur.status='active'
        where t.id=target_resource_id and ur.user_id=target_user
          and t.status in ('scheduled','active','notice_given','move_out_in_progress')
          and hm.starts_on<=current_date and (hm.ends_on is null or hm.ends_on>=current_date)
      ) then return true; end if;
    end if;
    return exists(
      select 1
      from public.properties p
      join public.organization_memberships m on m.organization_id=p.organization_id
      join public.role_permissions rp on rp.role_code=m.role_code
      join public.role_definitions rd on rd.code=m.role_code
      where p.id=v_property_id and p.organization_id=target_organization
        and m.user_id=target_user and m.status='active'
        and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
        and (rp.permission_code='*' or rp.permission_code='documents.manage')
        and (
          exists(select 1 from public.membership_property_scopes s where s.membership_id=m.id and s.property_id=p.id)
          or (rd.organization_wide_allowed and not exists(select 1 from public.membership_property_scopes s2 where s2.membership_id=m.id))
        )
    );
  end if;
  return false;
end;
$$;
revoke all on function private.user_can_manage_document_parent(uuid,uuid,text,uuid) from public,anon,authenticated;

create or replace function public.finalize_document(
  p_actor_user_id uuid,
  p_grant_id uuid,
  p_sha256_hex text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := p_actor_user_id;
  v_grant private.upload_grants%rowtype;
  v_property_id uuid;
  v_unit_id uuid;
  v_tenancy_id uuid;
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='ACTOR_REQUIRED'; end if;
  if p_sha256_hex is null or p_sha256_hex !~ '^[0-9a-fA-F]{64}$' then raise exception using errcode='23514',message='INVALID_CHECKSUM'; end if;

  select * into v_grant from private.upload_grants g where g.id=p_grant_id for update;
  if not found or v_grant.actor_user_id<>v_actor_id then raise exception using errcode='42501',message='UPLOAD_GRANT_NOT_FOUND'; end if;
  if not private.user_can_manage_document_parent(v_actor_id,v_grant.organization_id,v_grant.parent_resource_type,v_grant.parent_resource_id) then
    raise exception using errcode='42501',message='PARENT_SCOPE_DENIED';
  end if;

  v_request_hash := encode(sha256(convert_to(concat_ws('|',p_grant_id,lower(p_sha256_hex)),'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=v_grant.organization_id and r.actor_user_id=v_actor_id
    and r.route='FinalizeDocument' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  if v_grant.status<>'issued' then raise exception using errcode='23514',message='UPLOAD_GRANT_ALREADY_USED'; end if;
  if v_grant.expires_at<=now() then
    update private.upload_grants set status='expired' where id=p_grant_id;
    raise exception using errcode='23514',message='UPLOAD_GRANT_EXPIRED';
  end if;

  if v_grant.parent_resource_type='property' then
    v_property_id := v_grant.parent_resource_id;
  elsif v_grant.parent_resource_type='unit' then
    v_unit_id := v_grant.parent_resource_id;
    select u.property_id into v_property_id from public.units u where u.id=v_unit_id and u.organization_id=v_grant.organization_id;
  elsif v_grant.parent_resource_type='tenancy' then
    v_tenancy_id := v_grant.parent_resource_id;
    select t.property_id,t.unit_id into v_property_id,v_unit_id from public.tenancies t
    where t.id=v_tenancy_id and t.organization_id=v_grant.organization_id;
    if not found then raise exception using errcode='P0002',message='TENANCY_NOT_FOUND'; end if;
  elsif v_grant.parent_resource_type='work_order' then
    select w.property_id,w.unit_id into v_property_id,v_unit_id from public.work_orders w
    where w.id=v_grant.parent_resource_id and w.organization_id=v_grant.organization_id;
    if not found then raise exception using errcode='P0002',message='WORK_ORDER_NOT_FOUND'; end if;
  end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (v_grant.organization_id,v_actor_id,'FinalizeDocument',p_idempotency_key,v_request_hash,now()+interval '24 hours');

  insert into public.documents(id,organization_id,property_id,unit_id,tenancy_id,document_type,title,source,status,operator_supplied_unverified,created_by)
  values (v_grant.document_id,v_grant.organization_id,v_property_id,v_unit_id,v_tenancy_id,v_grant.document_type,v_grant.title,'operator_supplied','active',true,v_actor_id);
  insert into public.document_versions(
    id,organization_id,document_id,version_number,storage_bucket,storage_path,mime_type,size_bytes,
    sha256_hex,original_filename,uploaded_by,upload_status
  ) values (
    v_grant.version_id,v_grant.organization_id,v_grant.document_id,1,v_grant.storage_bucket,v_grant.storage_path,
    v_grant.requested_mime_type,v_grant.requested_size_bytes,lower(p_sha256_hex),v_grant.original_filename,v_actor_id,'quarantined'
  );
  update private.upload_grants set status='finalized' where id=p_grant_id;

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (v_grant.organization_id,v_actor_id,'user','document.uploaded','document',v_grant.document_id,v_correlation_id,
    jsonb_build_object('versionId',v_grant.version_id,'parentType',v_grant.parent_resource_type,'scanStatus','pending'));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (v_grant.organization_id,'document.uploaded','document',v_grant.document_id,v_correlation_id,
    jsonb_build_object('documentId',v_grant.document_id,'versionId',v_grant.version_id,'storageBucket',v_grant.storage_bucket,'storagePath',v_grant.storage_path));

  v_response := jsonb_build_object('documentId',v_grant.document_id,'versionId',v_grant.version_id,'scanStatus','pending');
  update private.idempotency_records r
  set state='completed',response_status=201,response_body=v_response,resource_type='document',resource_id=v_grant.document_id,completed_at=now()
  where r.organization_id=v_grant.organization_id and r.actor_user_id=v_actor_id
    and r.route='FinalizeDocument' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.finalize_document(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finalize_document(uuid,uuid,text,text) to service_role;

create or replace function public.create_vendor(
  p_organization_id uuid,
  p_display_name text,
  p_email text,
  p_phone_e164 text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_vendor_id uuid := gen_random_uuid();
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if not private.has_unscoped_org_permission(p_organization_id,'maintenance.manage') then
    raise exception using errcode='42501',message='ORGANIZATION_SCOPE_DENIED';
  end if;
  if length(trim(coalesce(p_display_name,''))) not between 1 and 160 then
    raise exception using errcode='23514',message='INVALID_VENDOR_NAME';
  end if;
  if p_email is not null and p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception using errcode='23514',message='INVALID_VENDOR_EMAIL';
  end if;
  if p_phone_e164 is not null and p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception using errcode='23514',message='INVALID_VENDOR_PHONE';
  end if;

  v_request_hash := encode(sha256(convert_to(concat_ws('|',p_organization_id,trim(p_display_name),coalesce(p_email,''),coalesce(p_phone_e164,'')),'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='CreateVendor' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (p_organization_id,v_actor_id,'CreateVendor',p_idempotency_key,v_request_hash,now()+interval '24 hours');
  insert into public.vendors(id,organization_id,display_name,email,phone_e164,created_by)
  values (v_vendor_id,p_organization_id,trim(p_display_name),p_email,p_phone_e164,v_actor_id);

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (p_organization_id,v_actor_id,'user','vendor.created','vendor',v_vendor_id,v_correlation_id,
    jsonb_build_object('displayName',trim(p_display_name)));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (p_organization_id,'vendor.created','vendor',v_vendor_id,v_correlation_id,jsonb_build_object('vendorId',v_vendor_id));

  v_response := jsonb_build_object('vendorId',v_vendor_id,'displayName',trim(p_display_name),'status','active');
  update private.idempotency_records r
  set state='completed',response_status=201,response_body=v_response,resource_type='vendor',resource_id=v_vendor_id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='CreateVendor' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.create_vendor(uuid,text,text,text,text) from public,anon;
grant execute on function public.create_vendor(uuid,text,text,text,text) to authenticated;

create or replace function public.create_and_assign_work_order(
  p_organization_id uuid,
  p_maintenance_request_id uuid,
  p_vendor_id uuid,
  p_scope text,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_estimated_cost_minor bigint,
  p_currency_code text,
  p_owner_approval_required boolean,
  p_official_priority text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.maintenance_requests%rowtype;
  v_book public.accounting_books%rowtype;
  v_threshold bigint;
  v_owner_approval_required boolean;
  v_owner_approval_status text;
  v_status public.work_order_status;
  v_work_order_id uuid := gen_random_uuid();
  v_public_reference text;
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if length(trim(coalesce(p_scope,''))) not between 3 and 2000 then
    raise exception using errcode='23514',message='INVALID_WORK_ORDER_SCOPE';
  end if;
  if p_scheduled_start is not null and p_scheduled_end is not null and p_scheduled_end<=p_scheduled_start then
    raise exception using errcode='23514',message='INVALID_SCHEDULE_WINDOW';
  end if;
  if p_estimated_cost_minor is not null and (p_estimated_cost_minor<0 or p_currency_code is null) then
    raise exception using errcode='23514',message='INVALID_ESTIMATED_COST';
  end if;
  if p_currency_code is not null and p_currency_code not in ('USD','CAD','MXN') then
    raise exception using errcode='23514',message='INVALID_CURRENCY';
  end if;
  if p_official_priority is not null and p_official_priority not in ('low','medium','high','emergency') then
    raise exception using errcode='23514',message='INVALID_PRIORITY';
  end if;

  select * into v_request from public.maintenance_requests r
  where r.id=p_maintenance_request_id and r.organization_id=p_organization_id
  for update;
  if not found then raise exception using errcode='P0002',message='MAINTENANCE_REQUEST_NOT_FOUND'; end if;
  if not private.has_property_access(v_request.property_id,'maintenance.manage') then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  if v_request.status not in ('new','triaged','canceled') then
    raise exception using errcode='23514',message='MAINTENANCE_REQUEST_NOT_ELIGIBLE';
  end if;

  if p_vendor_id is not null and not exists(
    select 1 from public.vendors v where v.id=p_vendor_id and v.organization_id=p_organization_id and v.status='active'
  ) then raise exception using errcode='P0002',message='VENDOR_NOT_FOUND'; end if;

  if p_estimated_cost_minor is not null then
    select b.* into v_book from public.accounting_books b
    join public.properties p on p.accounting_book_id=b.id
    where p.id=v_request.property_id and b.organization_id=p_organization_id;
    if not found or p_currency_code<>v_book.functional_currency_code then
      raise exception using errcode='23514',message='WORK_ORDER_CURRENCY_MISMATCH';
    end if;
  end if;

  select case
    when coalesce(o.settings->>'work_order_owner_approval_threshold_minor','')~'^[0-9]+$'
      then (o.settings->>'work_order_owner_approval_threshold_minor')::bigint
    else null end
  into v_threshold from public.organizations o where o.id=p_organization_id;
  v_owner_approval_required := coalesce(p_owner_approval_required,false)
    or (v_threshold is not null and p_estimated_cost_minor is not null and p_estimated_cost_minor>v_threshold);
  v_owner_approval_status := case when v_owner_approval_required then 'pending' else null end;
  v_status := case when p_vendor_id is not null then 'assigned' else 'draft' end;
  v_public_reference := 'WO-'||upper(substr(replace(v_work_order_id::text,'-',''),1,12));

  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'maintenanceRequestId',p_maintenance_request_id,'vendorId',p_vendor_id,'scope',trim(p_scope),
    'scheduledStart',p_scheduled_start,'scheduledEnd',p_scheduled_end,
    'estimatedCostMinor',p_estimated_cost_minor,'currencyCode',p_currency_code,
    'ownerApprovalRequired',p_owner_approval_required,'officialPriority',p_official_priority
  )::text,'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='CreateAndAssignWorkOrder' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  if exists(select 1 from public.work_orders w where w.maintenance_request_id=v_request.id and w.status not in ('closed','canceled')) then
    raise exception using errcode='23514',message='WORK_ORDER_ALREADY_EXISTS';
  end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (p_organization_id,v_actor_id,'CreateAndAssignWorkOrder',p_idempotency_key,v_request_hash,now()+interval '24 hours');
  insert into public.work_orders(
    id,organization_id,maintenance_request_id,property_id,unit_id,vendor_id,public_reference,status,scope,
    scheduled_start,scheduled_end,estimated_cost_minor,currency_code,owner_approval_required,owner_approval_status,created_by
  ) values (
    v_work_order_id,p_organization_id,v_request.id,v_request.property_id,v_request.unit_id,p_vendor_id,v_public_reference,v_status,trim(p_scope),
    p_scheduled_start,p_scheduled_end,p_estimated_cost_minor,p_currency_code,v_owner_approval_required,v_owner_approval_status,v_actor_id
  );
  update public.maintenance_requests set status='triaged',priority=coalesce(p_official_priority::public.maintenance_priority,priority) where id=v_request.id;

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (p_organization_id,v_actor_id,'user','work_order.created','work_order',v_work_order_id,v_correlation_id,
    jsonb_build_object('publicReference',v_public_reference,'status',v_status,'vendorId',p_vendor_id,'ownerApprovalRequired',v_owner_approval_required));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (p_organization_id,'work_order.created','work_order',v_work_order_id,v_correlation_id,
    jsonb_build_object('workOrderId',v_work_order_id,'maintenanceRequestId',v_request.id,'propertyId',v_request.property_id,'status',v_status));
  if p_vendor_id is not null then
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (p_organization_id,'work_order.assigned','work_order',v_work_order_id,v_correlation_id,
      jsonb_build_object('workOrderId',v_work_order_id,'vendorId',p_vendor_id));
  end if;
  if v_owner_approval_required then
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (p_organization_id,'owner_approval.requested','work_order',v_work_order_id,v_correlation_id,
      jsonb_build_object('workOrderId',v_work_order_id,'approvalType','work_order_estimate','estimatedCostMinor',p_estimated_cost_minor));
  end if;

  v_response := jsonb_build_object('workOrderId',v_work_order_id,'publicReference',v_public_reference,'status',v_status,'ownerApprovalStatus',v_owner_approval_status);
  update private.idempotency_records r
  set state='completed',response_status=201,response_body=v_response,resource_type='work_order',resource_id=v_work_order_id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='CreateAndAssignWorkOrder' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.create_and_assign_work_order(uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,text,boolean,text,text) from public,anon;
grant execute on function public.create_and_assign_work_order(uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,text,boolean,text,text) to authenticated;

create or replace function public.transition_work_order(
  p_work_order_id uuid,
  p_expected_version integer,
  p_transition text,
  p_reason text,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_actual_cost_minor bigint,
  p_completion_summary text,
  p_evidence_document_ids uuid[],
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_work_order public.work_orders%rowtype;
  v_evidence_ids uuid[] := coalesce(p_evidence_document_ids,array[]::uuid[]);
  v_evidence_required boolean;
  v_new_status public.work_order_status;
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception using errcode='23514',message='INVALID_EXPECTED_VERSION';
  end if;
  if p_transition not in ('accept','schedule','start','complete','close','cancel') then
    raise exception using errcode='23514',message='INVALID_TRANSITION';
  end if;

  select * into v_work_order from public.work_orders w where w.id=p_work_order_id for update;
  if not found then raise exception using errcode='P0002',message='WORK_ORDER_NOT_FOUND'; end if;
  if not private.has_property_access(v_work_order.property_id,'maintenance.manage') then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;

  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'workOrderId',p_work_order_id,'expectedVersion',p_expected_version,'transition',p_transition,'reason',p_reason,
    'scheduledStart',p_scheduled_start,'scheduledEnd',p_scheduled_end,'actualCostMinor',p_actual_cost_minor,
    'completionSummary',p_completion_summary,'evidenceDocumentIds',to_jsonb(v_evidence_ids)
  )::text,'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=v_work_order.organization_id and r.actor_user_id=v_actor_id
    and r.route='TransitionWorkOrder' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  if v_work_order.status in ('closed','canceled') then raise exception using errcode='23514',message='WORK_ORDER_ALREADY_CLOSED'; end if;
  if v_work_order.version<>p_expected_version then raise exception using errcode='40001',message='WORK_ORDER_VERSION_CONFLICT'; end if;

  if p_transition='accept' then
    if v_work_order.status<>'assigned' then raise exception using errcode='23514',message='INVALID_TRANSITION'; end if;
    v_new_status := 'accepted';
  elsif p_transition='schedule' then
    if v_work_order.status<>'accepted' then raise exception using errcode='23514',message='INVALID_TRANSITION'; end if;
    if p_scheduled_start is null or p_scheduled_end is null or p_scheduled_end<=p_scheduled_start then
      raise exception using errcode='23514',message='INVALID_SCHEDULE_WINDOW';
    end if;
    v_new_status := 'scheduled';
  elsif p_transition='start' then
    if v_work_order.status<>'scheduled' then raise exception using errcode='23514',message='INVALID_TRANSITION'; end if;
    v_new_status := 'in_progress';
  elsif p_transition='complete' then
    if v_work_order.status<>'in_progress' then raise exception using errcode='23514',message='INVALID_TRANSITION'; end if;
    if length(trim(coalesce(p_completion_summary,''))) not between 3 and 4000 then
      raise exception using errcode='23514',message='COMPLETION_SUMMARY_REQUIRED';
    end if;
    if cardinality(v_evidence_ids)>10 or cardinality(v_evidence_ids)<>(select count(distinct id) from unnest(v_evidence_ids) id) then
      raise exception using errcode='23514',message='INVALID_EVIDENCE';
    end if;
    select case when coalesce(o.settings->>'work_order_completion_evidence_required','true')='false' then false else true end
    into v_evidence_required from public.organizations o where o.id=v_work_order.organization_id;
    if v_evidence_required and cardinality(v_evidence_ids)=0 then
      raise exception using errcode='23514',message='COMPLETION_EVIDENCE_REQUIRED';
    end if;
    if cardinality(v_evidence_ids)>0 then
      perform 1 from public.documents d where d.id=any(v_evidence_ids) order by d.id for update;
      if cardinality(v_evidence_ids)<>(
        select count(distinct d.id)
        from public.documents d join public.document_versions dv on dv.document_id=d.id and dv.organization_id=d.organization_id
        where d.id=any(v_evidence_ids) and d.organization_id=v_work_order.organization_id
          and d.property_id=v_work_order.property_id and d.document_type='work_order_evidence' and d.status='active'
          and dv.upload_status='clean'
      ) then raise exception using errcode='23514',message='EVIDENCE_NOT_AVAILABLE'; end if;
    end if;
    v_new_status := case when v_work_order.owner_approval_required and v_work_order.owner_approval_status<>'approved'
      then 'awaiting_approval' else 'completed' end;
  elsif p_transition='close' then
    if v_work_order.status<>'completed' then raise exception using errcode='23514',message='INVALID_TRANSITION'; end if;
    v_new_status := 'closed';
  elsif p_transition='cancel' then
    if v_work_order.status not in ('draft','assigned','accepted','scheduled','in_progress','awaiting_approval') then
      raise exception using errcode='23514',message='INVALID_TRANSITION';
    end if;
    if length(trim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception using errcode='23514',message='CANCEL_REASON_REQUIRED'; end if;
    v_new_status := 'canceled';
  end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (v_work_order.organization_id,v_actor_id,'TransitionWorkOrder',p_idempotency_key,v_request_hash,now()+interval '24 hours');

  update public.work_orders set
    status=v_new_status,
    version=version+1,
    scheduled_start=case when p_transition='schedule' then p_scheduled_start else scheduled_start end,
    scheduled_end=case when p_transition='schedule' then p_scheduled_end else scheduled_end end,
    started_at=case when p_transition='start' then now() else started_at end,
    completed_at=case when p_transition='complete' and v_new_status='completed' then now() else completed_at end,
    completion_summary=case when p_transition='complete' then trim(p_completion_summary) else completion_summary end,
    actual_cost_minor=case when p_transition='complete' then coalesce(p_actual_cost_minor,actual_cost_minor) else actual_cost_minor end,
    canceled_reason=case when p_transition='cancel' then trim(p_reason) else canceled_reason end
  where id=p_work_order_id;

  if p_transition='complete' and cardinality(v_evidence_ids)>0 then
    insert into private.work_order_evidence(organization_id,work_order_id,document_id)
    select v_work_order.organization_id,p_work_order_id,id from unnest(v_evidence_ids) id
    on conflict do nothing;
  end if;

  update public.maintenance_requests set
    status=(case v_new_status
      when 'accepted' then 'triaged'::public.maintenance_status
      when 'scheduled' then 'scheduled'::public.maintenance_status
      when 'in_progress' then 'in_progress'::public.maintenance_status
      when 'awaiting_approval' then 'awaiting_approval'::public.maintenance_status
      when 'completed' then 'completed'::public.maintenance_status
      when 'closed' then 'closed'::public.maintenance_status
      when 'canceled' then 'canceled'::public.maintenance_status
      else status end),
    closed_at=case when v_new_status in ('closed','canceled') then now() else closed_at end
  where id=v_work_order.maintenance_request_id;

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,before_data,after_data)
  values (v_work_order.organization_id,v_actor_id,'user','work_order.status_changed','work_order',p_work_order_id,v_correlation_id,
    jsonb_build_object('status',v_work_order.status),jsonb_build_object('status',v_new_status,'transition',p_transition));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (v_work_order.organization_id,'work_order.status_changed','work_order',p_work_order_id,v_correlation_id,
    jsonb_build_object('workOrderId',p_work_order_id,'from',v_work_order.status,'to',v_new_status,'actorType','user'));
  if v_new_status='completed' then
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (v_work_order.organization_id,'work_order.completed','work_order',p_work_order_id,v_correlation_id,
      jsonb_build_object('workOrderId',p_work_order_id,'maintenanceRequestId',v_work_order.maintenance_request_id));
  end if;

  v_response := jsonb_build_object('workOrderId',p_work_order_id,'status',v_new_status,'version',v_work_order.version+1);
  update private.idempotency_records r
  set state='completed',response_status=200,response_body=v_response,resource_type='work_order',resource_id=p_work_order_id,completed_at=now()
  where r.organization_id=v_work_order.organization_id and r.actor_user_id=v_actor_id
    and r.route='TransitionWorkOrder' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.transition_work_order(uuid,integer,text,text,timestamptz,timestamptz,bigint,text,uuid[],text) from public,anon;
grant execute on function public.transition_work_order(uuid,integer,text,text,timestamptz,timestamptz,bigint,text,uuid[],text) to authenticated;

create or replace function public.get_operator_vendor_directory()
returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'vendorId',v.id,'displayName',v.display_name,'email',v.email,'phoneE164',v.phone_e164,'status',v.status
  ) order by v.display_name),'[]'::jsonb)
  from public.vendors v
  where v.status='active'
    and (private.has_unscoped_org_permission(v.organization_id,'maintenance.read') or private.has_unscoped_org_permission(v.organization_id,'maintenance.manage'))
$$;
revoke all on function public.get_operator_vendor_directory() from public,anon;
grant execute on function public.get_operator_vendor_directory() to authenticated;

create or replace function public.get_operator_maintenance_workspace()
returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  with visible as (
    select mr.*,p.name as property_name,u.unit_code
    from public.maintenance_requests mr join public.properties p on p.id=mr.property_id join public.units u on u.id=mr.unit_id
    where private.has_property_access(mr.property_id,'maintenance.read') or private.has_property_access(mr.property_id,'maintenance.manage')
    order by mr.created_at desc limit 100
  )
  select jsonb_build_object(
    'summary',jsonb_build_object(
      'open',count(*) filter (where status not in ('closed','canceled')),
      'overdue',count(*) filter (where target_at<now() and status not in ('completed','closed','canceled')),
      'untriaged',count(*) filter (where status='new')
    ),
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'maintenanceRequestId',id,'organizationId',organization_id,'publicReference',public_reference,'propertyName',property_name,'unitCode',unit_code,
      'category',category,'title',title,'description',description,'priorityRequested',priority_requested,
      'officialPriority',priority,'status',status,'accessPermission',access_permission,'preferredTimes',preferred_times,
      'createdAt',created_at,'targetAt',target_at,'evidenceCount',(select count(*) from private.maintenance_request_evidence e where e.maintenance_request_id=visible.id),
      'workOrder',(
        select jsonb_build_object(
          'workOrderId',w.id,'publicReference',w.public_reference,'status',w.status,'scope',w.scope,
          'vendorId',w.vendor_id,'vendorName',ve.display_name,
          'scheduledStart',w.scheduled_start,'scheduledEnd',w.scheduled_end,'startedAt',w.started_at,
          'completedAt',w.completed_at,'completionSummary',w.completion_summary,
          'estimatedCostMinor',w.estimated_cost_minor,'actualCostMinor',w.actual_cost_minor,'currencyCode',w.currency_code,
          'ownerApprovalRequired',w.owner_approval_required,'ownerApprovalStatus',w.owner_approval_status,
          'canceledReason',w.canceled_reason,'version',w.version,
          'evidenceCount',(select count(*) from private.work_order_evidence e where e.work_order_id=w.id)
        )
        from public.work_orders w left join public.vendors ve on ve.id=w.vendor_id
        where w.maintenance_request_id=visible.id and w.status not in ('closed','canceled')
        order by w.created_at desc limit 1
      )
    ) order by created_at desc) filter (where id is not null),'[]'::jsonb)
  ) from visible
$$;

alter table public.vendors enable row level security;
alter table public.work_orders enable row level security;

create policy vendors_operator_or_self_read on public.vendors for select to authenticated using (
  exists(select 1 from public.work_orders w where w.vendor_id=vendors.id and (private.has_property_access(w.property_id,'maintenance.read') or private.has_property_access(w.property_id,'maintenance.manage')))
  or private.has_unscoped_org_permission(organization_id,'maintenance.read')
  or private.has_unscoped_org_permission(organization_id,'maintenance.manage')
  or exists(select 1 from public.user_relationships ur where ur.user_id=(select auth.uid()) and ur.organization_id=organization_id and ur.relationship_type='vendor_contact' and ur.relationship_id=vendors.id and ur.status='active')
);
create policy work_orders_scoped_read on public.work_orders for select to authenticated using (
  private.has_property_access(property_id,'maintenance.read') or private.has_property_access(property_id,'maintenance.manage')
);

revoke all on public.vendors,public.work_orders from public,anon,authenticated;
grant select on public.vendors,public.work_orders to authenticated;
revoke all on private.work_order_evidence from public,anon,authenticated;
revoke all on function public.create_vendor(uuid,text,text,text,text) from public,anon;
revoke all on function public.create_and_assign_work_order(uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,text,boolean,text,text) from public,anon;
revoke all on function public.transition_work_order(uuid,integer,text,text,timestamptz,timestamptz,bigint,text,uuid[],text) from public,anon;
revoke all on function public.get_operator_vendor_directory() from public,anon;
revoke all on function public.get_operator_maintenance_workspace() from public,anon;
grant execute on function public.create_vendor(uuid,text,text,text,text) to authenticated;
grant execute on function public.create_and_assign_work_order(uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,text,boolean,text,text) to authenticated;
grant execute on function public.transition_work_order(uuid,integer,text,text,timestamptz,timestamptz,bigint,text,uuid[],text) to authenticated;
grant execute on function public.get_operator_vendor_directory() to authenticated;
grant execute on function public.get_operator_maintenance_workspace() to authenticated;

commit;
