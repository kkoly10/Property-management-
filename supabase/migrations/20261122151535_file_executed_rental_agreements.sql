begin;

-- The issued login address is a private activation cross-check. It never appears in the
-- participant package or downloadable evidence and may not be inferred for earlier packages.
alter table private.rental_agreement_signers add column email_at_issue text;

create function private.capture_rental_signer_address()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  select lower(trim(u.email)) into new.email_at_issue from auth.users u
    where u.id=new.user_id and u.email_confirmed_at is not null;
  if new.email_at_issue is null then
    raise exception using errcode='23514',message='AGREEMENT_SIGNERS_UNAVAILABLE';
  end if;
  return new;
end
$$;
revoke all on function private.capture_rental_signer_address() from public,anon,authenticated,service_role;

create trigger capture_rental_signer_address before insert on private.rental_agreement_signers
for each row execute function private.capture_rental_signer_address();

-- A source PDF is filed once. Filing is separate from signing and from possession/ledger writes.
create table private.rental_agreement_filings (
  agreement_id uuid primary key references private.rental_agreements(id),
  organization_id uuid not null references public.organizations(id),
  document_id uuid not null unique references public.documents(id),
  tenancy_id uuid unique references public.tenancies(id),
  filed_by uuid not null references auth.users(id),
  filed_at timestamptz not null default clock_timestamp()
);
alter table private.rental_agreement_filings enable row level security;
revoke all on table private.rental_agreement_filings from public,anon,authenticated,service_role;

create function public.get_rental_agreement_filing(p_organization_id uuid,p_agreement_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_agreement private.rental_agreements%rowtype;
  v_filing private.rental_agreement_filings%rowtype;
begin
  if p_organization_id is null then raise exception using errcode='42501',message='AGREEMENT_FORBIDDEN'; end if;
  v_agreement := private.agreement_visible_to_actor(p_agreement_id,p_organization_id);
  select * into v_filing from private.rental_agreement_filings f where f.agreement_id=v_agreement.id;
  return jsonb_build_object('agreementId',p_agreement_id,'propertyId',v_agreement.property_id,'unitId',v_agreement.unit_id,
    'documentId',v_filing.document_id,'tenancyId',v_filing.tenancy_id);
end
$$;
revoke all on function public.get_rental_agreement_filing(uuid,uuid) from public,anon,service_role;
grant execute on function public.get_rental_agreement_filing(uuid,uuid) to authenticated;

create function public.file_executed_rental_agreement(p_organization_id uuid,p_agreement_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_agreement private.rental_agreements%rowtype;
  v_filing private.rental_agreement_filings%rowtype;
  v_document public.documents%rowtype;
  v_version public.document_versions%rowtype;
begin
  if p_organization_id is null then raise exception using errcode='42501',message='AGREEMENT_FORBIDDEN'; end if;
  if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception using errcode='42501',message='MFA_REQUIRED'; end if;
  v_agreement := private.agreement_visible_to_actor(p_agreement_id,p_organization_id);

  perform 1 from public.units u where u.id=v_agreement.unit_id and u.organization_id=p_organization_id for update;
  select * into strict v_agreement from private.rental_agreements a where a.id=p_agreement_id for update;
  select * into v_filing from private.rental_agreement_filings f where f.agreement_id=p_agreement_id;
  if found then return public.get_rental_agreement_filing(p_organization_id,p_agreement_id); end if;
  if v_agreement.status<>'executed' then raise exception using errcode='23514',message='AGREEMENT_EXECUTION_REQUIRED'; end if;
  if exists (
    select 1 from private.rental_agreement_signers s where s.agreement_id=p_agreement_id and s.email_at_issue is null
  ) then raise exception using errcode='23514',message='AGREEMENT_ISSUED_ADDRESS_UNAVAILABLE'; end if;

  select * into strict v_version from public.document_versions dv where dv.organization_id=p_organization_id and dv.id=v_agreement.source_version_id;
  select * into strict v_document from public.documents d where d.organization_id=p_organization_id and d.id=v_version.document_id for update;
  if v_document.status<>'active' or v_document.document_type<>'rental_agreement_source' or v_document.tenancy_id is not null
    or v_document.property_id is distinct from v_agreement.property_id
    or (v_document.unit_id is not null and v_document.unit_id<>v_agreement.unit_id)
    or not exists (
      select 1 from public.document_versions dv where dv.id=v_version.id and dv.upload_status='clean'
        and dv.storage_bucket='private-documents' and lower(dv.sha256_hex)=v_agreement.source_sha256
    ) or exists (
      select 1 from public.document_versions dv where dv.document_id=v_document.id and dv.version_number>v_version.version_number
    ) then raise exception using errcode='23514',message='AGREEMENT_SOURCE_UNAVAILABLE'; end if;

  insert into private.rental_agreement_filings(agreement_id,organization_id,document_id,filed_by)
    values(p_agreement_id,p_organization_id,v_document.id,auth.uid());
  -- The ordinary lease selectors recognize a filed source. The binding trigger below
  -- makes those existing activation commands carry the same exact-party/source guard.
  update public.documents set document_type='lease',unit_id=v_agreement.unit_id where id=v_document.id;
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values(p_organization_id,auth.uid(),'user','rental_agreement.filed','rental_agreement',p_agreement_id,p_agreement_id,
      jsonb_build_object('unitId',v_agreement.unit_id,'sourceVersionId',v_version.id,'evidenceSha256',v_agreement.evidence_sha256));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values(p_organization_id,'rental_agreement.filed','rental_agreement',p_agreement_id,p_agreement_id,
      jsonb_build_object('unitId',v_agreement.unit_id,'sourceVersionId',v_version.id));
  return public.get_rental_agreement_filing(p_organization_id,p_agreement_id);
end
$$;
revoke all on function public.file_executed_rental_agreement(uuid,uuid) from public,anon,service_role;
grant execute on function public.file_executed_rental_agreement(uuid,uuid) to authenticated;

create function private.link_filed_agreement_to_tenancy()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_filing private.rental_agreement_filings%rowtype;
  v_agreement private.rental_agreements%rowtype;
  v_tenancy public.tenancies%rowtype;
  v_issued_addresses text[];
  v_household_addresses text[];
begin
  select * into v_filing from private.rental_agreement_filings f where f.document_id=old.id for update;
  if not found then return new; end if;
  if v_filing.tenancy_id is not null or new.tenancy_id is null then
    raise exception using errcode='23514',message='AGREEMENT_TENANCY_ALREADY_BOUND';
  end if;
  select * into strict v_agreement from private.rental_agreements a where a.id=v_filing.agreement_id;
  select * into v_tenancy from public.tenancies t where t.id=new.tenancy_id and t.organization_id=v_filing.organization_id;
  if not found or v_tenancy.property_id is distinct from v_agreement.property_id
    or v_tenancy.unit_id is distinct from v_agreement.unit_id or v_agreement.status<>'executed'
    or not exists (
      select 1 from public.document_versions dv where dv.id=v_agreement.source_version_id and dv.document_id=old.id
        and dv.upload_status='clean' and dv.storage_bucket='private-documents' and lower(dv.sha256_hex)=v_agreement.source_sha256
    ) or exists (
      select 1 from public.document_versions dv join public.document_versions pinned on pinned.id=v_agreement.source_version_id
        where dv.document_id=pinned.document_id and dv.version_number>pinned.version_number
    ) then raise exception using errcode='23514',message='AGREEMENT_TENANCY_SCOPE_MISMATCH'; end if;

  perform u.id from auth.users u join private.rental_agreement_signers s on s.user_id=u.id
    where s.agreement_id=v_agreement.id and s.capacity='lessee' order by u.id for share of u;
  if exists (
    select 1 from private.rental_agreement_signers s left join auth.users u on u.id=s.user_id
    where s.agreement_id=v_agreement.id and s.capacity='lessee'
      and (u.email_confirmed_at is null or lower(trim(u.email)) is distinct from s.email_at_issue)
  ) then raise exception using errcode='23514',message='AGREEMENT_SIGNING_ADDRESS_CHANGED'; end if;

  select array_agg(s.email_at_issue order by s.email_at_issue) into v_issued_addresses
    from private.rental_agreement_signers s where s.agreement_id=v_agreement.id and s.capacity='lessee';
  select array_agg(lower(trim(p.email)) order by lower(trim(p.email))) into v_household_addresses
    from public.household_members m join public.people p on p.organization_id=m.organization_id and p.id=m.person_id
    where m.organization_id=v_tenancy.organization_id and m.household_id=v_tenancy.household_id and m.is_financially_responsible;
  if v_issued_addresses is distinct from v_household_addresses then
    raise exception using errcode='23514',message='AGREEMENT_HOUSEHOLD_MISMATCH';
  end if;

  update private.rental_agreement_filings set tenancy_id=v_tenancy.id where agreement_id=v_agreement.id;
  update public.leases set signed_document_version_id=v_agreement.source_version_id,executed_at=v_agreement.closed_at
    where organization_id=v_tenancy.organization_id and id=v_tenancy.lease_id;
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values(v_filing.organization_id,auth.uid(),'user','rental_agreement.bound_to_tenancy','rental_agreement',v_agreement.id,v_agreement.id,
      jsonb_build_object('tenancyId',v_tenancy.id,'leaseId',v_tenancy.lease_id,'sourceVersionId',v_agreement.source_version_id));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values(v_filing.organization_id,'rental_agreement.bound_to_tenancy','rental_agreement',v_agreement.id,v_agreement.id,
      jsonb_build_object('tenancyId',v_tenancy.id,'leaseId',v_tenancy.lease_id));
  return new;
end
$$;
revoke all on function private.link_filed_agreement_to_tenancy() from public,anon,authenticated,service_role;

create trigger link_filed_agreement_to_tenancy before update of tenancy_id on public.documents
for each row when (old.tenancy_id is distinct from new.tenancy_id)
execute function private.link_filed_agreement_to_tenancy();

commit;
