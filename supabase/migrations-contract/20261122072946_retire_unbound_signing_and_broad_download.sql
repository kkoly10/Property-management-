-- The compatible application uses the service-only guarded write. Keep the
-- existing receipt writer callable only by its owner from that trusted context.
begin;

revoke execute on function public.sign_document(uuid,uuid,text,boolean,text,boolean,text,text,text,text)
  from public,anon,authenticated,service_role;

alter policy document_versions_parent_read on public.document_versions
  using (private.can_read_document_version(id));

-- The upload grant still permits the uploader to verify the bytes before
-- finalizing. Everyone else must have both version read access and a clean scan.
alter policy document_grant_verify_read on storage.objects using (
  bucket_id='private-documents'
  and (
    private.has_active_document_upload_grant(bucket_id,name)
    or exists (
      select 1 from public.document_versions dv
      where dv.storage_bucket=bucket_id and dv.storage_path=name and dv.upload_status='clean'
    )
  )
);

create trigger serialize_document_decline_before_insert
  before insert on public.document_acknowledgements for each row
  when (new.acknowledgement_type='declined')
  execute function private.serialize_document_decline();

commit;
