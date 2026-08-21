-- Phase 3: accept true .xlsx workbooks (and ZIP archives) as import/document sources.
--
-- The mime allowlist is enforced in FIVE places: the zod schema, this upload-grant command, the
-- storage bucket's allowed_mime_types, the import route's version query, and create_import_job. The
-- import commands and the app layer already accept the spreadsheetml type; this migration closes the
-- two SQL gates, without which an operator could never upload the workbook in the first place.
--
-- Forward-only: redefines one function and updates the bucket row. No table, no policy.
begin;

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
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
revoke all on function public.create_document_upload_grant(uuid,text,uuid,text,text,text,text,bigint,text) from public,anon;
grant execute on function public.create_document_upload_grant(uuid,text,uuid,text,text,text,text,bigint,text) to authenticated;

-- The bucket is the last line of defense: storage rejects an upload whose mime type is not listed.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf','text/csv','application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png','image/jpeg','application/zip'
]
where id = 'private-documents';

commit;
