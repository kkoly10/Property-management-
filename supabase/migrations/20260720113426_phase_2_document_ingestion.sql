begin;

create type public.document_status as enum ('draft','active','superseded','archived','void');

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid references public.properties(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  document_type text not null check (length(trim(document_type)) between 1 and 80),
  title text not null check (length(trim(title)) between 1 and 200),
  source text not null default 'operator_supplied' check (source in ('operator_supplied','imported','system_generated')),
  status public.document_status not null default 'active',
  operator_supplied_unverified boolean not null default true,
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  unique (organization_id,id),
  check (effective_to is null or effective_from is null or effective_to >= effective_from),
  check (unit_id is null or property_id is not null),
  foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict,
  foreign key (organization_id,property_id,unit_id) references public.units(organization_id,property_id,id) on delete restrict
);
create index documents_org_created_idx on public.documents(organization_id,created_at desc);
create index documents_property_created_idx on public.documents(property_id,created_at desc) where property_id is not null;

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
  unique (organization_id,id),
  unique (document_id,version_number),
  unique (storage_bucket,storage_path),
  foreign key (organization_id,document_id) references public.documents(organization_id,id) on delete restrict
);
create index document_versions_document_idx on public.document_versions(document_id,version_number desc);

create table private.upload_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  parent_resource_type text not null check (parent_resource_type in ('organization','property','unit')),
  parent_resource_id uuid not null,
  document_id uuid not null unique,
  version_id uuid not null unique,
  document_type text not null,
  title text not null,
  original_filename text not null,
  requested_mime_type text not null,
  requested_size_bytes bigint not null check (requested_size_bytes > 0),
  storage_bucket text not null,
  storage_path text not null,
  allowed_mime_types text[] not null,
  maximum_size_bytes bigint not null check (maximum_size_bytes > 0),
  nonce_hash text not null,
  status text not null default 'issued' check (status in ('issued','uploaded','finalized','expired','revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (storage_bucket,storage_path),
  unique (nonce_hash)
);
create index upload_grants_actor_status_idx on private.upload_grants(actor_user_id,status,expires_at);

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
      select 1
      from public.organization_memberships m
      join public.role_permissions rp on rp.role_code=m.role_code
      join public.role_definitions rd on rd.code=m.role_code
      where m.organization_id=target_organization and m.user_id=target_user and m.status='active'
        and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
        and rd.organization_wide_allowed
        and not exists(select 1 from public.membership_property_scopes s where s.membership_id=m.id)
        and (rp.permission_code='*' or rp.permission_code='documents.manage')
    );
  elsif target_resource_type in ('property','unit') then
    if target_resource_type='property' then
      v_property_id := target_resource_id;
    else
      select u.property_id into v_property_id from public.units u
      where u.id=target_resource_id and u.organization_id=target_organization;
      if not found then return false; end if;
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

create or replace function private.can_manage_document_parent(
  target_organization uuid,
  target_resource_type text,
  target_resource_id uuid
)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select private.user_can_manage_document_parent((select auth.uid()),target_organization,target_resource_type,target_resource_id)
$$;
revoke all on function private.can_manage_document_parent(uuid,text,uuid) from public,anon,authenticated;

create or replace function private.has_active_document_upload_grant(target_bucket text,target_path text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from private.upload_grants g
    where g.storage_bucket=target_bucket and g.storage_path=target_path and g.actor_user_id=(select auth.uid())
      and g.status='issued' and g.expires_at>now()
  );
$$;
revoke all on function private.has_active_document_upload_grant(text,text) from public,anon;
grant execute on function private.has_active_document_upload_grant(text,text) to authenticated;

create or replace function public.create_document_upload_grant(
  p_organization_id uuid,
  p_parent_resource_type text,
  p_parent_resource_id uuid,
  p_document_type text,
  p_title text,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_allowed_mime_types constant text[] := array[
    'application/pdf','text/csv','application/vnd.ms-excel',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png','image/jpeg','application/zip'
  ];
  v_maximum_size constant bigint := 26214400;
  v_request_hash text;
  v_grant_id uuid := gen_random_uuid();
  v_document_id uuid := gen_random_uuid();
  v_version_id uuid := gen_random_uuid();
  v_safe_filename text;
  v_storage_path text;
  v_expires_at timestamptz := now()+interval '15 minutes';
  v_previous private.idempotency_records%rowtype;
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if not private.can_manage_document_parent(p_organization_id,p_parent_resource_type,p_parent_resource_id) then
    raise exception using errcode='42501',message='PARENT_SCOPE_DENIED';
  end if;
  if p_mime_type is null or not (p_mime_type=any(v_allowed_mime_types)) then
    raise exception using errcode='23514',message='MIME_TYPE_NOT_ALLOWED';
  end if;
  if p_size_bytes is null or p_size_bytes<=0 or p_size_bytes>v_maximum_size then
    raise exception using errcode='23514',message='FILE_SIZE_NOT_ALLOWED';
  end if;
  if length(trim(p_document_type)) not between 1 and 80 or length(trim(p_title)) not between 1 and 200 then
    raise exception using errcode='23514',message='INVALID_DOCUMENT_METADATA';
  end if;

  v_request_hash := encode(sha256(convert_to(concat_ws('|',p_organization_id,p_parent_resource_type,p_parent_resource_id,p_document_type,p_title,p_original_filename,p_mime_type,p_size_bytes),'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='CreateDocumentUploadGrant' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  v_safe_filename := regexp_replace(trim(p_original_filename),'[^a-zA-Z0-9._-]+','_','g');
  if length(v_safe_filename)=0 then v_safe_filename := 'upload'; end if;
  v_storage_path := format('organizations/%s/%s/%s/%s/%s',p_organization_id,p_parent_resource_type,p_parent_resource_id,v_version_id,v_safe_filename);

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (p_organization_id,v_actor_id,'CreateDocumentUploadGrant',p_idempotency_key,v_request_hash,now()+interval '24 hours');

  insert into private.upload_grants(
    id,organization_id,actor_user_id,parent_resource_type,parent_resource_id,document_id,version_id,
    document_type,title,original_filename,requested_mime_type,requested_size_bytes,
    storage_bucket,storage_path,allowed_mime_types,maximum_size_bytes,nonce_hash,expires_at
  ) values (
    v_grant_id,p_organization_id,v_actor_id,p_parent_resource_type,p_parent_resource_id,v_document_id,v_version_id,
    trim(p_document_type),trim(p_title),v_safe_filename,p_mime_type,p_size_bytes,
    'private-documents',v_storage_path,v_allowed_mime_types,v_maximum_size,
    encode(sha256(convert_to(v_grant_id::text||v_actor_id::text||clock_timestamp()::text,'UTF8')),'hex'),v_expires_at
  );

  v_response := jsonb_build_object(
    'grantId',v_grant_id,'expiresAt',v_expires_at,'storagePath',v_storage_path,
    'storageBucket','private-documents'
  );
  update private.idempotency_records r
  set state='completed',response_status=201,response_body=v_response,resource_type='upload_grant',resource_id=v_grant_id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='CreateDocumentUploadGrant' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;

create or replace function public.inspect_document_upload_grant(p_grant_id uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare v_grant private.upload_grants%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  select * into v_grant from private.upload_grants g where g.id=p_grant_id and g.actor_user_id=auth.uid();
  if not found then raise exception using errcode='42501',message='UPLOAD_GRANT_NOT_FOUND'; end if;
  if v_grant.status<>'issued' or v_grant.expires_at<=now() then raise exception using errcode='23514',message='UPLOAD_GRANT_EXPIRED'; end if;
  return jsonb_build_object(
    'storageBucket',v_grant.storage_bucket,'storagePath',v_grant.storage_path,
    'allowedMimeTypes',v_grant.allowed_mime_types,'maximumSizeBytes',v_grant.maximum_size_bytes,
    'requestedMimeType',v_grant.requested_mime_type,'requestedSizeBytes',v_grant.requested_size_bytes
  );
end;
$$;

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
  end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (v_grant.organization_id,v_actor_id,'FinalizeDocument',p_idempotency_key,v_request_hash,now()+interval '24 hours');

  insert into public.documents(id,organization_id,property_id,unit_id,document_type,title,source,status,operator_supplied_unverified,created_by)
  values (v_grant.document_id,v_grant.organization_id,v_property_id,v_unit_id,v_grant.document_type,v_grant.title,'operator_supplied','active',true,v_actor_id);
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

revoke all on function public.create_document_upload_grant(uuid,text,uuid,text,text,text,text,bigint,text) from public,anon;
revoke all on function public.inspect_document_upload_grant(uuid) from public,anon;
revoke all on function public.finalize_document(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_document_upload_grant(uuid,text,uuid,text,text,text,text,bigint,text) to authenticated;
grant execute on function public.inspect_document_upload_grant(uuid) to authenticated;
grant execute on function public.finalize_document(uuid,uuid,text,text) to service_role;

alter table public.documents enable row level security;
alter table public.document_versions enable row level security;

create policy documents_scoped_read on public.documents for select to authenticated
using (
  (property_id is not null and (private.has_property_access(property_id,'documents.read') or private.has_property_access(property_id,'documents.manage')))
  or (property_id is null and (private.has_unscoped_org_permission(organization_id,'documents.read') or private.has_unscoped_org_permission(organization_id,'documents.manage')))
);
create policy document_versions_parent_read on public.document_versions for select to authenticated
using (exists(select 1 from public.documents d where d.id=document_id and d.organization_id=document_versions.organization_id));

grant select on public.documents,public.document_versions to authenticated;
revoke insert,update,delete on public.documents,public.document_versions from anon,authenticated;
revoke all on private.upload_grants from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'private-documents','private-documents',false,26214400,
  array['application/pdf','text/csv','application/vnd.ms-excel','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/png','image/jpeg','application/zip']
)
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy document_grant_upload on storage.objects for insert to authenticated
with check (
  bucket_id='private-documents'
  and private.has_active_document_upload_grant(bucket_id,name)
);
create policy document_grant_verify_read on storage.objects for select to authenticated
using (
  bucket_id='private-documents'
  and (
    private.has_active_document_upload_grant(bucket_id,name)
    or exists(
      select 1 from public.document_versions dv
      join public.documents d on d.id=dv.document_id and d.organization_id=dv.organization_id
      where dv.storage_bucket=bucket_id and dv.storage_path=name
    )
  )
);

commit;
