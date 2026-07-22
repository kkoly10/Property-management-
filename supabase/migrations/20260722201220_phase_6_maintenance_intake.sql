begin;

create type public.maintenance_priority as enum ('low','medium','high','emergency');
create type public.maintenance_status as enum ('new','triaged','scheduled','in_progress','awaiting_approval','completed','closed','canceled');

create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  tenancy_id uuid references public.tenancies(id) on delete restrict,
  reported_by_user_id uuid references auth.users(id) on delete restrict,
  public_reference text not null,
  category text not null check (length(trim(category)) between 2 and 80),
  title text not null check (length(trim(title)) between 3 and 160),
  description text not null check (length(trim(description)) between 10 and 4000),
  priority_requested text check (priority_requested is null or priority_requested in ('low','medium','high')),
  priority public.maintenance_priority not null default 'medium',
  status public.maintenance_status not null default 'new',
  access_permission text check (access_permission is null or length(trim(access_permission)) between 2 and 500),
  preferred_times jsonb not null default '[]'::jsonb check (jsonb_typeof(preferred_times)='array' and jsonb_array_length(preferred_times)<=5),
  target_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  version integer not null default 1 check (version>0),
  unique (organization_id,id),
  unique (organization_id,property_id,id),
  unique (organization_id,public_reference),
  foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict,
  foreign key (organization_id,property_id,unit_id) references public.units(organization_id,property_id,id) on delete restrict,
  foreign key (organization_id,tenancy_id) references public.tenancies(organization_id,id) on delete restrict,
  check (closed_at is null or closed_at>=created_at)
);
create index maintenance_requests_property_status_idx on public.maintenance_requests(property_id,status,priority,created_at desc);
create index maintenance_requests_tenancy_created_idx on public.maintenance_requests(tenancy_id,created_at desc) where tenancy_id is not null;
create trigger maintenance_requests_touch before update on public.maintenance_requests for each row execute function private.touch_updated_at();

create table private.maintenance_request_evidence (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  maintenance_request_id uuid not null references public.maintenance_requests(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (maintenance_request_id,document_id),
  foreign key (organization_id,maintenance_request_id) references public.maintenance_requests(organization_id,id) on delete restrict,
  foreign key (organization_id,document_id) references public.documents(organization_id,id) on delete restrict
);
create index maintenance_request_evidence_document_idx on private.maintenance_request_evidence(document_id);

alter table private.upload_grants drop constraint upload_grants_parent_resource_type_check;
alter table private.upload_grants add constraint upload_grants_parent_resource_type_check
  check (parent_resource_type in ('organization','property','unit','tenancy'));
alter table private.upload_grants add constraint upload_grants_tenancy_evidence_only
  check (
    parent_resource_type<>'tenancy'
    or (document_type='maintenance_evidence' and requested_mime_type in ('image/png','image/jpeg'))
  );

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

create or replace function public.submit_maintenance_request(
  p_tenancy_id uuid,
  p_category text,
  p_title text,
  p_description text,
  p_priority_requested text,
  p_access_permission text,
  p_preferred_times jsonb,
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
  v_tenancy public.tenancies%rowtype;
  v_is_resident boolean;
  v_evidence_ids uuid[] := coalesce(p_evidence_document_ids,array[]::uuid[]);
  v_request_id uuid := gen_random_uuid();
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
  select * into v_tenancy from public.tenancies t where t.id=p_tenancy_id;
  if not found then raise exception using errcode='P0002',message='TENANCY_NOT_FOUND'; end if;
  v_is_resident := private.is_resident_for_tenancy(p_tenancy_id);
  if not v_is_resident and not private.has_property_access(v_tenancy.property_id,'maintenance.manage') then
    raise exception using errcode='42501',message='TENANCY_SCOPE_DENIED';
  end if;
  if v_tenancy.status not in ('scheduled','active','notice_given','move_out_in_progress') then
    raise exception using errcode='23514',message='TENANCY_NOT_ACTIVE';
  end if;
  if length(trim(coalesce(p_category,''))) not between 2 and 80
    or length(trim(coalesce(p_title,''))) not between 3 and 160
    or length(trim(coalesce(p_description,''))) not between 10 and 4000
    or (p_priority_requested is not null and p_priority_requested not in ('low','medium','high'))
    or (p_access_permission is not null and length(trim(p_access_permission)) not between 2 and 500)
  then raise exception using errcode='23514',message='INVALID_MAINTENANCE_REQUEST'; end if;
  if p_preferred_times is null or jsonb_typeof(p_preferred_times)<>'array' or jsonb_array_length(p_preferred_times)>5
    or exists(
      select 1 from jsonb_array_elements(p_preferred_times) slot
      where jsonb_typeof(slot)<>'object' or coalesce(slot->>'start','')='' or coalesce(slot->>'end','')=''
    )
  then raise exception using errcode='23514',message='INVALID_PREFERRED_TIMES'; end if;
  begin
    if exists(
      select 1 from jsonb_array_elements(p_preferred_times) slot
      where (slot->>'start')::timestamptz >= (slot->>'end')::timestamptz
    ) then raise exception using errcode='23514',message='INVALID_PREFERRED_TIMES'; end if;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode='22007',message='INVALID_PREFERRED_TIMES';
  end;
  if cardinality(v_evidence_ids)>5 or cardinality(v_evidence_ids)<>(select count(distinct id) from unnest(v_evidence_ids) id) then
    raise exception using errcode='23514',message='INVALID_EVIDENCE';
  end if;

  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'tenancyId',p_tenancy_id,'category',trim(p_category),'title',trim(p_title),'description',trim(p_description),
    'priorityRequested',p_priority_requested,'accessPermission',nullif(trim(coalesce(p_access_permission,'')),''),
    'preferredTimes',p_preferred_times,'evidenceDocumentIds',to_jsonb(v_evidence_ids)
  )::text,'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=v_tenancy.organization_id and r.actor_user_id=v_actor_id
    and r.route='SubmitMaintenanceRequest' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  if v_is_resident then
    perform pg_advisory_xact_lock(hashtextextended(v_actor_id::text,0));
    if (select count(*) from public.maintenance_requests mr where mr.reported_by_user_id=v_actor_id and mr.created_at>now()-interval '24 hours')>=10 then
      raise exception using errcode='P0001',message='MAINTENANCE_RATE_LIMITED';
    end if;
  end if;

  perform 1 from public.documents d where d.id=any(v_evidence_ids) order by d.id for update;
  if cardinality(v_evidence_ids)<>(
    select count(distinct d.id)
    from public.documents d join public.document_versions dv on dv.document_id=d.id and dv.organization_id=d.organization_id
    where d.id=any(v_evidence_ids) and d.organization_id=v_tenancy.organization_id
      and d.property_id=v_tenancy.property_id and d.unit_id=v_tenancy.unit_id and d.tenancy_id=v_tenancy.id
      and d.document_type='maintenance_evidence' and d.status='active'
      and dv.mime_type in ('image/png','image/jpeg') and dv.upload_status in ('quarantined','scanning','clean')
  ) then raise exception using errcode='23514',message='EVIDENCE_NOT_AVAILABLE'; end if;

  v_public_reference := 'MR-'||upper(substr(replace(v_request_id::text,'-',''),1,12));
  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (v_tenancy.organization_id,v_actor_id,'SubmitMaintenanceRequest',p_idempotency_key,v_request_hash,now()+interval '24 hours');
  insert into public.maintenance_requests(
    id,organization_id,property_id,unit_id,tenancy_id,reported_by_user_id,public_reference,
    category,title,description,priority_requested,priority,status,access_permission,preferred_times
  ) values (
    v_request_id,v_tenancy.organization_id,v_tenancy.property_id,v_tenancy.unit_id,v_tenancy.id,v_actor_id,v_public_reference,
    trim(p_category),trim(p_title),trim(p_description),p_priority_requested,'medium','new',nullif(trim(coalesce(p_access_permission,'')),''),p_preferred_times
  );
  insert into private.maintenance_request_evidence(organization_id,maintenance_request_id,document_id)
  select v_tenancy.organization_id,v_request_id,id from unnest(v_evidence_ids) id;

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (v_tenancy.organization_id,v_actor_id,'user','maintenance_request.submitted','maintenance_request',v_request_id,v_correlation_id,
    jsonb_build_object('publicReference',v_public_reference,'residentVisibleStatus','submitted','evidenceCount',cardinality(v_evidence_ids)));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload) values
    (v_tenancy.organization_id,'maintenance_request.submitted','maintenance_request',v_request_id,v_correlation_id,
      jsonb_build_object('requestId',v_request_id,'propertyId',v_tenancy.property_id,'unitId',v_tenancy.unit_id,'residentVisibleStatus','submitted')),
    (v_tenancy.organization_id,'notification.requested','maintenance_request',v_request_id,v_correlation_id,
      jsonb_build_object('templateCode','maintenance_request_submitted_operator','requestId',v_request_id,'propertyId',v_tenancy.property_id));

  v_response := jsonb_build_object('maintenanceRequestId',v_request_id,'publicReference',v_public_reference,'status','new');
  update private.idempotency_records r set state='completed',response_status=201,response_body=v_response,
    resource_type='maintenance_request',resource_id=v_request_id,completed_at=now()
  where r.organization_id=v_tenancy.organization_id and r.actor_user_id=v_actor_id
    and r.route='SubmitMaintenanceRequest' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;

create or replace function public.get_resident_maintenance_workspace()
returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tenancies',coalesce((
      select jsonb_agg(jsonb_build_object(
        'tenancyId',t.id,'organizationId',t.organization_id,'propertyName',p.name,'unitCode',u.unit_code
      ) order by p.name,u.unit_code)
      from public.tenancies t join public.properties p on p.id=t.property_id join public.units u on u.id=t.unit_id
      where t.status in ('scheduled','active','notice_given','move_out_in_progress') and private.is_resident_for_tenancy(t.id)
    ),'[]'::jsonb),
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'maintenanceRequestId',mr.id,'publicReference',mr.public_reference,'propertyName',p.name,'unitCode',u.unit_code,
        'category',mr.category,'title',mr.title,'description',mr.description,'priorityRequested',mr.priority_requested,
        'residentVisibleStatus',case mr.status
          when 'new' then 'submitted' when 'triaged' then 'reviewed' when 'scheduled' then 'scheduled'
          when 'in_progress' then 'being_repaired' when 'awaiting_approval' then 'waiting_for_confirmation'
          when 'completed' then 'completed' when 'closed' then 'completed' else 'canceled' end,
        'accessPermission',mr.access_permission,'preferredTimes',mr.preferred_times,'createdAt',mr.created_at,'closedAt',mr.closed_at,
        'evidenceCount',(select count(*) from private.maintenance_request_evidence e where e.maintenance_request_id=mr.id)
      ) order by mr.created_at desc)
      from public.maintenance_requests mr join public.properties p on p.id=mr.property_id join public.units u on u.id=mr.unit_id
      where mr.tenancy_id is not null and private.is_resident_for_tenancy(mr.tenancy_id)
    ),'[]'::jsonb)
  )
$$;

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
      'maintenanceRequestId',id,'publicReference',public_reference,'propertyName',property_name,'unitCode',unit_code,
      'category',category,'title',title,'description',description,'priorityRequested',priority_requested,
      'officialPriority',priority,'status',status,'accessPermission',access_permission,'preferredTimes',preferred_times,
      'createdAt',created_at,'targetAt',target_at,'evidenceCount',(select count(*) from private.maintenance_request_evidence e where e.maintenance_request_id=visible.id)
    ) order by created_at desc) filter (where id is not null),'[]'::jsonb)
  ) from visible
$$;

alter table public.maintenance_requests enable row level security;
create policy maintenance_requests_scoped_read on public.maintenance_requests for select to authenticated using (
  private.has_property_access(property_id,'maintenance.read') or private.has_property_access(property_id,'maintenance.manage')
  or (tenancy_id is not null and private.is_resident_for_tenancy(tenancy_id))
);

revoke all on public.maintenance_requests from public,anon,authenticated;
grant select on public.maintenance_requests to authenticated;
revoke all on private.maintenance_request_evidence from public,anon,authenticated,service_role;
revoke all on function public.submit_maintenance_request(uuid,text,text,text,text,text,jsonb,uuid[],text) from public,anon;
revoke all on function public.get_resident_maintenance_workspace() from public,anon;
revoke all on function public.get_operator_maintenance_workspace() from public,anon;
grant execute on function public.submit_maintenance_request(uuid,text,text,text,text,text,jsonb,uuid[],text) to authenticated;
grant execute on function public.get_resident_maintenance_workspace() to authenticated;
grant execute on function public.get_operator_maintenance_workspace() to authenticated;

commit;
