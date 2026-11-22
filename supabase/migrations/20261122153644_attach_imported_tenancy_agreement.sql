begin;

create function public.get_imported_tenancy_agreement(p_organization_id uuid,p_tenancy_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_tenancy public.tenancies%rowtype;
  v_lease public.leases%rowtype;
  v_options jsonb;
begin
  perform private.enter_organization_context(p_organization_id);
  select * into v_tenancy from public.tenancies t where t.organization_id=p_organization_id and t.id=p_tenancy_id
    and private.has_property_access(t.property_id,'lease.manage') and private.has_property_access(t.property_id,'documents.manage');
  if not found then return null; end if;
  select * into v_lease from public.leases l where l.organization_id=p_organization_id and l.id=v_tenancy.lease_id and l.source='imported';
  if not found then return null; end if;
  if v_lease.signed_document_version_id is not null then
    return jsonb_build_object('unitId',v_tenancy.unit_id,'versionId',v_lease.signed_document_version_id,'choices','[]'::jsonb);
  end if;
  if v_tenancy.status='closed' or v_lease.status<>'active' then return null; end if;
  select coalesce(jsonb_agg(c.item order by c.created_at desc,c.id),'[]'::jsonb) into v_options from (
    select v.id,v.uploaded_at as created_at,jsonb_build_object('versionId',v.id,'title',d.title,'filename',v.original_filename,'version',v.version_number) as item
    from public.documents d
    join lateral (
      select dv.id,dv.uploaded_at,dv.original_filename,dv.version_number,dv.upload_status,dv.storage_bucket,dv.mime_type
      from public.document_versions dv where dv.organization_id=d.organization_id and dv.document_id=d.id
      order by dv.version_number desc limit 1
    ) v on true
    where d.organization_id=p_organization_id and d.property_id=v_tenancy.property_id and d.unit_id=v_tenancy.unit_id
      and d.status='active' and d.document_type in ('lease','signed_lease') and (d.tenancy_id is null or d.tenancy_id=p_tenancy_id)
      and v.upload_status='clean' and v.storage_bucket='private-documents' and v.mime_type='application/pdf'
      and not exists (select 1 from private.rental_agreement_filings f where f.document_id=d.id)
    order by v.uploaded_at desc,v.id limit 50
  ) c;
  return jsonb_build_object('unitId',v_tenancy.unit_id,'versionId',null,'choices',v_options);
end
$$;
revoke all on function public.get_imported_tenancy_agreement(uuid,uuid) from public,anon,service_role;
grant execute on function public.get_imported_tenancy_agreement(uuid,uuid) to authenticated;

create function public.attach_imported_tenancy_agreement(
  p_organization_id uuid,p_tenancy_id uuid,p_document_version_id uuid,p_signed_copy_confirmed boolean
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_tenancy public.tenancies%rowtype;
  v_lease public.leases%rowtype;
  v_document public.documents%rowtype;
  v_version public.document_versions%rowtype;
  v_corr uuid := gen_random_uuid();
begin
  perform private.enter_organization_context(p_organization_id);
  if p_signed_copy_confirmed is distinct from true or p_document_version_id is null then
    raise exception using errcode='22023',message='IMPORT_AGREEMENT_CONFIRMATION_REQUIRED';
  end if;
  select * into v_tenancy from public.tenancies t where t.organization_id=p_organization_id and t.id=p_tenancy_id
    and private.has_property_access(t.property_id,'lease.manage') and private.has_property_access(t.property_id,'documents.manage');
  if not found then raise exception using errcode='42501',message='IMPORT_AGREEMENT_SCOPE_DENIED'; end if;
  perform 1 from public.units u where u.id=v_tenancy.unit_id and u.organization_id=p_organization_id for no key update;
  select * into strict v_tenancy from public.tenancies t where t.organization_id=p_organization_id and t.id=p_tenancy_id for no key update;
  if not private.has_property_access(v_tenancy.property_id,'lease.manage') or not private.has_property_access(v_tenancy.property_id,'documents.manage') then
    raise exception using errcode='42501',message='IMPORT_AGREEMENT_SCOPE_DENIED';
  end if;
  select * into v_lease from public.leases l where l.organization_id=p_organization_id and l.id=v_tenancy.lease_id and l.source='imported' for no key update;
  if not found then raise exception using errcode='23514',message='IMPORT_AGREEMENT_UNAVAILABLE'; end if;
  if v_lease.signed_document_version_id=p_document_version_id then
    return jsonb_build_object('tenancyId',p_tenancy_id,'versionId',p_document_version_id,'replayed',true);
  end if;
  if v_lease.signed_document_version_id is not null or v_tenancy.status='closed' or v_lease.status<>'active' then
    raise exception using errcode='23514',message='IMPORT_AGREEMENT_UNAVAILABLE';
  end if;
  select * into v_version from public.document_versions v where v.organization_id=p_organization_id and v.id=p_document_version_id;
  select * into v_document from public.documents d where d.organization_id=p_organization_id and d.id=v_version.document_id for no key update;
  if not found or v_document.property_id is distinct from v_tenancy.property_id
    or v_document.unit_id is distinct from v_tenancy.unit_id
    or v_document.status<>'active' or v_document.document_type not in ('lease','signed_lease')
    or (v_document.tenancy_id is not null and v_document.tenancy_id<>p_tenancy_id)
    or exists (select 1 from private.rental_agreement_filings f where f.document_id=v_document.id)
    then raise exception using errcode='23514',message='IMPORT_SIGNED_VERSION_UNAVAILABLE'; end if;
  perform 1 from public.document_versions v where v.organization_id=p_organization_id and v.id=p_document_version_id and v.document_id=v_document.id
    and v.upload_status='clean' and v.storage_bucket='private-documents' and v.mime_type='application/pdf'
    and not exists (select 1 from public.document_versions newer where newer.document_id=v_document.id and newer.version_number>v.version_number)
    for share;
  if not found then raise exception using errcode='23514',message='IMPORT_SIGNED_VERSION_UNAVAILABLE'; end if;

  update public.documents set tenancy_id=p_tenancy_id,operator_supplied_unverified=true where id=v_document.id;
  update public.leases set signed_document_version_id=p_document_version_id where id=v_lease.id;
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values(p_organization_id,auth.uid(),'user','lease.imported_agreement_attached','lease',v_lease.id,v_corr,
      jsonb_build_object('tenancyId',p_tenancy_id,'versionId',p_document_version_id,'signedCopyConfirmed',true));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values(p_organization_id,'lease.imported_agreement_attached','lease',v_lease.id,v_corr,
      jsonb_build_object('tenancyId',p_tenancy_id,'versionId',p_document_version_id));
  return jsonb_build_object('tenancyId',p_tenancy_id,'versionId',p_document_version_id,'replayed',false);
end
$$;
revoke all on function public.attach_imported_tenancy_agreement(uuid,uuid,uuid,boolean) from public,anon,service_role;
grant execute on function public.attach_imported_tenancy_agreement(uuid,uuid,uuid,boolean) to authenticated;

commit;
