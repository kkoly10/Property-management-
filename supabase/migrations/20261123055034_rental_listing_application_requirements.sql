-- The optional public criteria are written only by the authorized listing command.
-- Application intake snapshots the exact version from the scoped published listing.
begin;

create function private.normalize_rental_listing_application_requirements(p_input jsonb)
returns jsonb
language plpgsql
immutable strict
set search_path = ''
as $$
declare
  v_criteria text;
  v_alternatives text;
  v_document_types jsonb;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception using errcode='22023',message='INVALID_APPLICATION_REQUIREMENTS';
  end if;
  if exists(select 1 from jsonb_object_keys(p_input) k
    where k not in ('criteriaText','requiredDocumentTypes','acceptedAlternatives'))
    or jsonb_typeof(p_input->'criteriaText') is distinct from 'string'
    or jsonb_typeof(p_input->'acceptedAlternatives') is distinct from 'string'
    or jsonb_typeof(p_input->'requiredDocumentTypes') is distinct from 'array'
  then
    raise exception using errcode='22023',message='INVALID_APPLICATION_REQUIREMENTS';
  end if;

  v_criteria:=regexp_replace(p_input->>'criteriaText','^[[:space:]]+|[[:space:]]+$','','g');
  v_alternatives:=regexp_replace(p_input->>'acceptedAlternatives','^[[:space:]]+|[[:space:]]+$','','g');
  v_document_types:=p_input->'requiredDocumentTypes';
  if length(v_criteria)>1600 or length(v_alternatives)>800 or jsonb_array_length(v_document_types)>3
    or exists(select 1 from jsonb_array_elements(v_document_types) d(value)
      where d.value not in ('"credit_evidence"'::jsonb,'"identity"'::jsonb,'"income_evidence"'::jsonb))
    or (select count(distinct value) from jsonb_array_elements(v_document_types))<>jsonb_array_length(v_document_types)
    or (v_criteria='' and v_alternatives='' and jsonb_array_length(v_document_types)=0)
  then
    raise exception using errcode='22023',message='INVALID_APPLICATION_REQUIREMENTS';
  end if;

  select coalesce(jsonb_agg(d.value order by d.value),'[]'::jsonb)
    into v_document_types from jsonb_array_elements(v_document_types) d(value);
  return jsonb_build_object(
    'criteriaText',v_criteria,'requiredDocumentTypes',v_document_types,'acceptedAlternatives',v_alternatives
  );
end;
$$;
revoke all on function private.normalize_rental_listing_application_requirements(jsonb)
  from public,anon,authenticated,service_role;

alter table public.rental_listings
  add column application_requirements jsonb,
  add constraint rental_listing_application_requirements_shape check (
    application_requirements is null
    or (
      jsonb_typeof(application_requirements)='object'
      and jsonb_typeof(application_requirements->'requirementsVersion')='string'
      and (application_requirements->>'requirementsVersion') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and (application_requirements-'requirementsVersion')
        = private.normalize_rental_listing_application_requirements(application_requirements-'requirementsVersion')
    ) is true
  );

create function private.get_rental_listing_application_requirements(p_listing_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select l.application_requirements from public.rental_listings l where l.id=p_listing_id;
$$;
revoke all on function private.get_rental_listing_application_requirements(uuid)
  from public,anon,authenticated,service_role;

create or replace function public.save_rental_listing(
  p_organization_id uuid,
  p_unit_id uuid,
  p_expected_version integer,
  p_details jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_unit public.units%rowtype;
  v_property public.properties%rowtype;
  v_book public.accounting_books%rowtype;
  v_listing public.rental_listings%rowtype;
  v_existing boolean := false;
  v_photo jsonb;
  v_photo_ids uuid[] := '{}'::uuid[];
  v_photo_id uuid;
  v_sort smallint := 0;
  v_hash text;
  v_previous private.idempotency_records%rowtype;
  v_corr uuid := gen_random_uuid();
  v_response jsonb;
  v_requirements jsonb;
  v_requirements_snapshot jsonb;
begin
  if v_actor is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_organization_id is null or p_unit_id is null then raise exception using errcode='22023',message='LISTING_SCOPE_REQUIRED'; end if;
  if p_expected_version is null or p_expected_version < 0 then raise exception using errcode='22023',message='INVALID_EXPECTED_VERSION'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='22023',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if jsonb_typeof(p_details) is distinct from 'object' or pg_column_size(p_details)>16384 then
    raise exception using errcode='22023',message='INVALID_LISTING_DETAILS';
  end if;
  if exists(select 1 from jsonb_object_keys(p_details) k where k not in
    ('title','summary','rentAmountMinor','availableOn','leaseTermText','petsText','utilitiesText','parkingText','visibility','photos','applicationRequirements')) then
    raise exception using errcode='22023',message='INVALID_LISTING_DETAILS';
  end if;
  if jsonb_typeof(p_details->'title') is distinct from 'string'
    or length(trim(p_details->>'title')) not between 1 and 160
    or jsonb_typeof(p_details->'summary') is distinct from 'string'
    or length(p_details->>'summary')>3000
    or jsonb_typeof(p_details->'rentAmountMinor') is distinct from 'number'
    or (p_details->>'rentAmountMinor') !~ '^[0-9]+$'
    or (p_details->>'rentAmountMinor')::numeric>9007199254740991
    or coalesce(p_details->>'availableOn','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or coalesce(p_details->>'visibility','')<>'unlisted'
    or jsonb_typeof(p_details->'photos') is distinct from 'array'
    or jsonb_array_length(p_details->'photos')>20 then
    raise exception using errcode='22023',message='INVALID_LISTING_DETAILS';
  end if;
  if p_details ? 'applicationRequirements' and p_details->'applicationRequirements'<>'null'::jsonb then
    v_requirements:=private.normalize_rental_listing_application_requirements(p_details->'applicationRequirements');
  end if;
  if length(coalesce(p_details->>'leaseTermText',''))>500
    or length(coalesce(p_details->>'petsText',''))>500
    or length(coalesce(p_details->>'utilitiesText',''))>1000
    or length(coalesce(p_details->>'parkingText',''))>1000 then
    raise exception using errcode='22023',message='LISTING_TEXT_TOO_LONG';
  end if;
  begin
    perform (p_details->>'availableOn')::date;
  exception when others then
    raise exception using errcode='22007',message='INVALID_AVAILABLE_DATE';
  end;

  select u.* into v_unit from public.units u
  where u.id=p_unit_id and u.organization_id=p_organization_id and u.archived_at is null and u.operational_status='active'
  for update;
  if not found then raise exception using errcode='P0002',message='UNIT_NOT_FOUND'; end if;
  select p.* into v_property from public.properties p
  where p.id=v_unit.property_id and p.organization_id=p_organization_id and p.archived_at is null and p.status<>'archived';
  if not found then raise exception using errcode='P0002',message='PROPERTY_NOT_FOUND'; end if;
  if not private.has_property_access(v_property.id,'property.manage') then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  if not exists(select 1 from public.organizations o where o.id=p_organization_id and o.customer_path='self_managing') then
    raise exception using errcode='42501',message='SELF_MANAGING_WORKSPACE_REQUIRED';
  end if;
  select b.* into v_book from public.accounting_books b
  where b.id=v_property.accounting_book_id and b.organization_id=p_organization_id and b.status='open';
  if not found then raise exception using errcode='23514',message='ACCOUNTING_BOOK_NOT_OPEN'; end if;

  -- Re-authorize above, then short-circuit an exact successful retry BEFORE guards whose result
  -- changed because that successful call incremented the listing version.
  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'organizationId',p_organization_id,'unitId',p_unit_id,'expectedVersion',p_expected_version,'details',p_details
  )::text,'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor
    and r.route='SaveRentalListing' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  select * into v_listing from public.rental_listings l
  where l.organization_id=p_organization_id and l.unit_id=p_unit_id and l.status<>'closed' for update;
  v_existing := found;
  if not v_existing and p_expected_version<>0 then
    if exists(
      select 1 from public.rental_listings l
      where l.organization_id=p_organization_id and l.unit_id=p_unit_id
        and l.status='closed' and l.version=p_expected_version
    ) then
      raise exception using errcode='23514',message='LISTING_CLOSED';
    end if;
    raise exception using errcode='40001',message='LISTING_VERSION_CONFLICT';
  end if;
  if v_existing and v_listing.version<>p_expected_version then
    raise exception using errcode='40001',message='LISTING_VERSION_CONFLICT';
  end if;

  v_requirements_snapshot:=v_listing.application_requirements;
  if p_details ? 'applicationRequirements' then
    if v_requirements is null then
      v_requirements_snapshot:=null;
    elsif (v_requirements_snapshot-'requirementsVersion') is distinct from v_requirements then
      v_requirements_snapshot:=v_requirements||jsonb_build_object('requirementsVersion',gen_random_uuid());
    end if;
  end if;

  for v_photo in select value from jsonb_array_elements(p_details->'photos') loop
    if jsonb_typeof(v_photo) is distinct from 'object'
      or exists(select 1 from jsonb_object_keys(v_photo) k where k not in ('documentVersionId','altText'))
      or coalesce(v_photo->>'documentVersionId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or length(coalesce(v_photo->>'altText',''))>240 then
      raise exception using errcode='22023',message='INVALID_LISTING_PHOTO';
    end if;
    v_photo_id := (v_photo->>'documentVersionId')::uuid;
    if v_photo_id=any(v_photo_ids) then raise exception using errcode='23505',message='DUPLICATE_LISTING_PHOTO'; end if;
    v_photo_ids := array_append(v_photo_ids,v_photo_id);
    if not exists(
      select 1 from public.document_versions dv
      join public.documents d on d.id=dv.document_id and d.organization_id=dv.organization_id
      where dv.id=v_photo_id and dv.organization_id=p_organization_id and dv.upload_status='clean'
        and d.organization_id=p_organization_id and d.property_id=v_property.id and d.unit_id=p_unit_id
        and d.document_type='rental_listing_photo' and d.status='active' and d.tenancy_id is null
    ) then raise exception using errcode='23514',message='LISTING_PHOTO_NOT_READY'; end if;
  end loop;

  insert into private.idempotency_records(
    organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at
  ) values (
    p_organization_id,v_actor,'SaveRentalListing',p_idempotency_key,v_hash,'infinity'::timestamptz
  );

  if v_existing then
    update public.rental_listings set
      title=trim(p_details->>'title'),
      summary=p_details->>'summary',
      rent_amount_minor=(p_details->>'rentAmountMinor')::bigint,
      currency_code=v_book.functional_currency_code,
      available_on=(p_details->>'availableOn')::date,
      unit_type=v_unit.unit_type,
      bedrooms=v_unit.bedrooms,
      bathrooms=v_unit.bathrooms,
      locality=v_property.locality,
      subdivision_code=v_property.subdivision_code,
      country_code=v_property.country_code,
      lease_term_text=coalesce(p_details->>'leaseTermText',''),
      pets_text=coalesce(p_details->>'petsText',''),
      utilities_text=coalesce(p_details->>'utilitiesText',''),
      parking_text=coalesce(p_details->>'parkingText',''),
      application_requirements=v_requirements_snapshot,
      visibility='unlisted',
      status='draft',
      closed_at=null,
      version=version+1,
      updated_at=now(),
      updated_by=v_actor
    where id=v_listing.id
    returning * into v_listing;
    delete from public.rental_listing_photos where listing_id=v_listing.id;
  else
    insert into public.rental_listings(
      organization_id,property_id,unit_id,title,summary,rent_amount_minor,currency_code,available_on,
      unit_type,bedrooms,bathrooms,locality,subdivision_code,country_code,
      lease_term_text,pets_text,utilities_text,parking_text,application_requirements,visibility,created_by,updated_by
    ) values (
      p_organization_id,v_property.id,p_unit_id,trim(p_details->>'title'),p_details->>'summary',
      (p_details->>'rentAmountMinor')::bigint,v_book.functional_currency_code,(p_details->>'availableOn')::date,
      v_unit.unit_type,v_unit.bedrooms,v_unit.bathrooms,v_property.locality,v_property.subdivision_code,v_property.country_code,
      coalesce(p_details->>'leaseTermText',''),coalesce(p_details->>'petsText',''),
      coalesce(p_details->>'utilitiesText',''),coalesce(p_details->>'parkingText',''),v_requirements_snapshot,'unlisted',v_actor,v_actor
    ) returning * into v_listing;
  end if;

  v_sort := 0;
  for v_photo in select value from jsonb_array_elements(p_details->'photos') loop
    insert into public.rental_listing_photos(
      organization_id,listing_id,document_version_id,sort_order,alt_text
    ) values (
      p_organization_id,v_listing.id,(v_photo->>'documentVersionId')::uuid,v_sort,coalesce(v_photo->>'altText','')
    );
    v_sort := v_sort + 1;
  end loop;

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
  ) values (
    p_organization_id,v_actor,'user','rental_listing.saved','rental_listing',v_listing.id,v_corr,
    jsonb_build_object('unitId',p_unit_id,'status',v_listing.status,'visibility',v_listing.visibility,
      'version',v_listing.version,'photoCount',cardinality(v_photo_ids),
      'applicationRequirements',v_listing.application_requirements)
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (
    p_organization_id,'rental_listing.saved','rental_listing',v_listing.id,v_corr,
    jsonb_build_object('listingId',v_listing.id,'unitId',p_unit_id,'version',v_listing.version)
  );

  v_response := jsonb_build_object(
    'listingId',v_listing.id,'publicId',v_listing.public_id,'unitId',v_listing.unit_id,
    'status',v_listing.status,'visibility',v_listing.visibility,'version',v_listing.version,
    'photoCount',cardinality(v_photo_ids),
    'applicationRequirements',v_listing.application_requirements
  );
  update private.idempotency_records r set
    state='completed',response_status=200,response_body=v_response,
    resource_type='rental_listing',resource_id=v_listing.id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor
    and r.route='SaveRentalListing' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.save_rental_listing(uuid,uuid,integer,jsonb,text) from public,anon;
grant execute on function public.save_rental_listing(uuid,uuid,integer,jsonb,text) to authenticated;

create or replace function public.get_public_rental_listing(p_public_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'publicId',l.public_id,
    'title',l.title,
    'summary',l.summary,
    'rentAmountMinor',l.rent_amount_minor,
    'currencyCode',l.currency_code,
    'availableOn',l.available_on,
    'unitType',l.unit_type,
    'bedrooms',l.bedrooms,
    'bathrooms',l.bathrooms,
    'timeZone',p.time_zone,
    'location',jsonb_build_object(
      'locality',l.locality,
      'subdivisionCode',l.subdivision_code,
      'countryCode',l.country_code
    ),
    'leaseTermText',l.lease_term_text,
    'petsText',l.pets_text,
    'utilitiesText',l.utilities_text,
    'parkingText',l.parking_text,
    'applicationRequirements',l.application_requirements,
    'visibility',l.visibility,
    'publishedAt',l.published_at,
    'discoveredAt',l.discovered_at,
    'photos',coalesce((

      select jsonb_agg(jsonb_build_object(
        'documentVersionId',lp.document_version_id,
        'storageBucket',dv.storage_bucket,
        'storagePath',dv.storage_path,
        'mimeType',dv.mime_type,
        'altText',lp.alt_text,
        'sortOrder',lp.sort_order
      ) order by lp.sort_order)
      from public.rental_listing_photos lp
      join public.document_versions dv
        on dv.id=lp.document_version_id and dv.organization_id=lp.organization_id
      join public.documents d
        on d.id=dv.document_id and d.organization_id=dv.organization_id
      where lp.listing_id=l.id and lp.organization_id=l.organization_id
        and dv.upload_status='clean'
        and d.status='active'
        and d.document_type='rental_listing_photo'
        and d.property_id=l.property_id and d.unit_id=l.unit_id
    ),'[]'::jsonb)
  )
  from public.rental_listings l
  join public.properties p
    on p.id=l.property_id and p.organization_id=l.organization_id
  where l.public_id=p_public_id
    and l.status='published'
    and l.visibility in ('unlisted','discoverable')
    and exists (
      select 1
      from public.rental_listing_photos lp
      join public.document_versions dv
        on dv.id=lp.document_version_id and dv.organization_id=lp.organization_id
      join public.documents d
        on d.id=dv.document_id and d.organization_id=dv.organization_id
      where lp.listing_id=l.id and lp.organization_id=l.organization_id
        and dv.upload_status='clean'
        and d.status='active'
        and d.document_type='rental_listing_photo'
        and d.property_id=l.property_id and d.unit_id=l.unit_id
    )
$$;
revoke all on function public.get_public_rental_listing(uuid)
  from public,anon,authenticated;
grant execute on function public.get_public_rental_listing(uuid) to service_role;

commit;
