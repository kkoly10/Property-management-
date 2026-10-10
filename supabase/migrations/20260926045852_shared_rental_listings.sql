-- FD-HR-002–005 / Batch B1: landlord-shared, unlisted rental listings.
-- Public discovery remains disabled. The base tables stay private to authenticated operators;
-- anonymous reads go only through the service-role sanitized DTO below.
begin;

create table public.rental_listings (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 160),
  summary text not null default '' check (length(summary) <= 3000),
  rent_amount_minor bigint not null check (rent_amount_minor >= 0 and rent_amount_minor <= 9007199254740991),
  currency_code char(3) not null check (currency_code in ('USD','CAD','MXN')),
  available_on date not null,
  unit_type text,
  bedrooms numeric(4,1) check (bedrooms is null or bedrooms >= 0),
  bathrooms numeric(4,1) check (bathrooms is null or bathrooms >= 0),
  locality text,
  subdivision_code text,
  country_code char(2) not null check (country_code in ('US','CA','MX')),
  lease_term_text text not null default '' check (length(lease_term_text) <= 500),
  pets_text text not null default '' check (length(pets_text) <= 500),
  utilities_text text not null default '' check (length(utilities_text) <= 1000),
  parking_text text not null default '' check (length(parking_text) <= 1000),
  status text not null default 'draft' check (status in ('draft','published','paused','closed')),
  visibility text not null default 'unlisted' check (visibility in ('unlisted','discoverable')),
  published_at timestamptz,
  closed_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict,
  unique (public_id),
  unique (organization_id,id),
  foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict,
  foreign key (organization_id,property_id,unit_id) references public.units(organization_id,property_id,id) on delete restrict
);
create index rental_listings_property_idx on public.rental_listings(property_id,status);
create index rental_listings_public_status_idx on public.rental_listings(public_id,status);
create unique index rental_listings_open_unit_unique
  on public.rental_listings(organization_id,unit_id) where status<>'closed';

create table public.rental_listing_photos (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  listing_id uuid not null,
  document_version_id uuid not null,
  sort_order smallint not null check (sort_order between 0 and 19),
  alt_text text not null default '' check (length(alt_text) <= 240),
  created_at timestamptz not null default now(),
  primary key (listing_id,document_version_id),
  unique (listing_id,sort_order),
  unique (organization_id,listing_id,document_version_id),
  foreign key (organization_id,listing_id) references public.rental_listings(organization_id,id) on delete cascade,
  foreign key (organization_id,document_version_id) references public.document_versions(organization_id,id) on delete restrict
);
create index rental_listing_photos_version_idx on public.rental_listing_photos(document_version_id);

alter table public.rental_listings enable row level security;
alter table public.rental_listing_photos enable row level security;

create policy rental_listings_operator_read on public.rental_listings
for select to authenticated using (
  private.has_property_access(property_id,'property.read')
  or private.has_property_access(property_id,'property.manage')
);
create policy rental_listing_photos_operator_read on public.rental_listing_photos
for select to authenticated using (
  exists (
    select 1 from public.rental_listings l
    where l.id=rental_listing_photos.listing_id
      and l.organization_id=rental_listing_photos.organization_id
      and (
        private.has_property_access(l.property_id,'property.read')
        or private.has_property_access(l.property_id,'property.manage')
      )
  )
);

grant select on public.rental_listings,public.rental_listing_photos to authenticated;
revoke insert,update,delete on public.rental_listings,public.rental_listing_photos from anon,authenticated;
revoke all on public.rental_listings,public.rental_listing_photos from anon;

-- The shared document command remains the one upload path. This trigger narrows the new document type
-- even if a caller bypasses the HTTP zod layer and calls create_document_upload_grant directly.
create or replace function private.enforce_rental_listing_photo_grant()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.document_type='rental_listing_photo' then
    if new.parent_resource_type<>'unit' then
      raise exception using errcode='23514',message='LISTING_PHOTO_UNIT_REQUIRED';
    end if;
    if new.requested_mime_type not in ('image/png','image/jpeg') then
      raise exception using errcode='23514',message='LISTING_PHOTO_MIME_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_rental_listing_photo_grant() from public,anon,authenticated;
create trigger enforce_rental_listing_photo_grant
before insert on private.upload_grants
for each row execute function private.enforce_rental_listing_photo_grant();

-- Listing media is advertising media, not a recipient document. Keep it out of every delivery path,
-- including direct service-role insertion, so it can never become a resident/owner document by mistake.
create or replace function private.prevent_rental_listing_photo_delivery()
returns trigger language plpgsql set search_path='' as $$
begin
  if exists (
    select 1
    from public.document_versions dv
    join public.documents d on d.id=dv.document_id and d.organization_id=dv.organization_id
    where dv.id=new.document_version_id
      and dv.organization_id=new.organization_id
      and d.document_type='rental_listing_photo'
  ) then
    raise exception using errcode='23514',message='LISTING_PHOTO_NOT_DELIVERABLE';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_rental_listing_photo_delivery() from public,anon,authenticated;
create trigger prevent_rental_listing_photo_delivery
before insert on public.document_deliveries
for each row execute function private.prevent_rental_listing_photo_delivery();

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
    ('title','summary','rentAmountMinor','availableOn','leaseTermText','petsText','utilitiesText','parkingText','visibility','photos')) then
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
      lease_term_text,pets_text,utilities_text,parking_text,visibility,created_by,updated_by
    ) values (
      p_organization_id,v_property.id,p_unit_id,trim(p_details->>'title'),p_details->>'summary',
      (p_details->>'rentAmountMinor')::bigint,v_book.functional_currency_code,(p_details->>'availableOn')::date,
      v_unit.unit_type,v_unit.bedrooms,v_unit.bathrooms,v_property.locality,v_property.subdivision_code,v_property.country_code,
      coalesce(p_details->>'leaseTermText',''),coalesce(p_details->>'petsText',''),
      coalesce(p_details->>'utilitiesText',''),coalesce(p_details->>'parkingText',''),'unlisted',v_actor,v_actor
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
      'version',v_listing.version,'photoCount',cardinality(v_photo_ids))
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
    'photoCount',cardinality(v_photo_ids)
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

create or replace function public.set_rental_listing_status(
  p_organization_id uuid,
  p_listing_id uuid,
  p_expected_version integer,
  p_status text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_listing public.rental_listings%rowtype;
  v_hash text;
  v_previous private.idempotency_records%rowtype;
  v_corr uuid := gen_random_uuid();
  v_response jsonb;
  v_photo_count integer;
begin
  if v_actor is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_status not in ('published','paused','closed') then raise exception using errcode='22023',message='INVALID_LISTING_STATUS'; end if;
  if p_expected_version is null or p_expected_version<1 then raise exception using errcode='22023',message='INVALID_EXPECTED_VERSION'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='22023',message='INVALID_IDEMPOTENCY_KEY';
  end if;

  select * into v_listing from public.rental_listings l
  where l.id=p_listing_id and l.organization_id=p_organization_id for update;
  if not found then raise exception using errcode='P0002',message='LISTING_NOT_FOUND'; end if;
  if not private.has_property_access(v_listing.property_id,'property.manage') then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  if not exists(select 1 from public.organizations o where o.id=p_organization_id and o.customer_path='self_managing') then
    raise exception using errcode='42501',message='SELF_MANAGING_WORKSPACE_REQUIRED';
  end if;
  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'organizationId',p_organization_id,'listingId',p_listing_id,
    'expectedVersion',p_expected_version,'status',p_status
  )::text,'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor
    and r.route='SetRentalListingStatus' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  if v_listing.version<>p_expected_version then raise exception using errcode='40001',message='LISTING_VERSION_CONFLICT'; end if;
  if v_listing.status='closed' then raise exception using errcode='23514',message='LISTING_CLOSED'; end if;

  if p_status='published' then
    if v_listing.visibility<>'unlisted' then raise exception using errcode='23514',message='DISCOVERY_NOT_ENABLED'; end if;
    if length(trim(v_listing.summary))<20 then raise exception using errcode='23514',message='LISTING_SUMMARY_REQUIRED'; end if;
    select count(*)::integer into v_photo_count
    from public.rental_listing_photos lp
    join public.document_versions dv on dv.id=lp.document_version_id and dv.organization_id=lp.organization_id
    join public.documents d on d.id=dv.document_id and d.organization_id=dv.organization_id
    where lp.listing_id=v_listing.id and lp.organization_id=p_organization_id
      and dv.upload_status='clean'
      and d.document_type='rental_listing_photo' and d.status='active'
      and d.property_id=v_listing.property_id and d.unit_id=v_listing.unit_id;
    if v_photo_count<1 then raise exception using errcode='23514',message='LISTING_PHOTO_REQUIRED'; end if;
    if v_listing.status not in ('draft','paused') then raise exception using errcode='23514',message='LISTING_STATUS_TRANSITION_INVALID'; end if;
  elsif p_status='paused' and v_listing.status<>'published' then
    raise exception using errcode='23514',message='LISTING_STATUS_TRANSITION_INVALID';
  end if;

  insert into private.idempotency_records(
    organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at
  ) values (
    p_organization_id,v_actor,'SetRentalListingStatus',p_idempotency_key,v_hash,'infinity'::timestamptz
  );

  update public.rental_listings set
    status=p_status,
    published_at=case when p_status='published' then coalesce(published_at,now()) else published_at end,
    closed_at=case when p_status='closed' then now() else null end,
    version=version+1,
    updated_at=now(),
    updated_by=v_actor
  where id=v_listing.id
  returning * into v_listing;

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
  ) values (
    p_organization_id,v_actor,'user','rental_listing.status_changed','rental_listing',v_listing.id,v_corr,
    jsonb_build_object('status',v_listing.status,'visibility',v_listing.visibility,'version',v_listing.version)
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (
    p_organization_id,'rental_listing.status_changed','rental_listing',v_listing.id,v_corr,
    jsonb_build_object('listingId',v_listing.id,'status',v_listing.status,'version',v_listing.version)
  );

  v_response := jsonb_build_object(
    'listingId',v_listing.id,'publicId',v_listing.public_id,'status',v_listing.status,
    'visibility',v_listing.visibility,'version',v_listing.version
  );
  update private.idempotency_records r set
    state='completed',response_status=200,response_body=v_response,
    resource_type='rental_listing',resource_id=v_listing.id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor
    and r.route='SetRentalListingStatus' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.set_rental_listing_status(uuid,uuid,integer,text,text) from public,anon;
grant execute on function public.set_rental_listing_status(uuid,uuid,integer,text,text) to authenticated;

create or replace function public.rotate_rental_listing_link(
  p_organization_id uuid,
  p_listing_id uuid,
  p_expected_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_listing public.rental_listings%rowtype;
  v_hash text;
  v_previous private.idempotency_records%rowtype;
  v_old_public_id uuid;
  v_corr uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_expected_version is null or p_expected_version<1 then raise exception using errcode='22023',message='INVALID_EXPECTED_VERSION'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='22023',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  select * into v_listing from public.rental_listings l
  where l.id=p_listing_id and l.organization_id=p_organization_id for update;
  if not found then raise exception using errcode='P0002',message='LISTING_NOT_FOUND'; end if;
  if not private.has_property_access(v_listing.property_id,'property.manage') then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  if not exists(select 1 from public.organizations o where o.id=p_organization_id and o.customer_path='self_managing') then
    raise exception using errcode='42501',message='SELF_MANAGING_WORKSPACE_REQUIRED';
  end if;

  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'organizationId',p_organization_id,'listingId',p_listing_id,'expectedVersion',p_expected_version
  )::text,'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor
    and r.route='RotateRentalListingLink' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  if v_listing.version<>p_expected_version then raise exception using errcode='40001',message='LISTING_VERSION_CONFLICT'; end if;
  if v_listing.status='closed' then raise exception using errcode='23514',message='LISTING_CLOSED'; end if;

  insert into private.idempotency_records(
    organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at
  ) values (
    p_organization_id,v_actor,'RotateRentalListingLink',p_idempotency_key,v_hash,'infinity'::timestamptz
  );
  v_old_public_id := v_listing.public_id;
  update public.rental_listings set
    public_id=gen_random_uuid(),version=version+1,updated_at=now(),updated_by=v_actor
  where id=v_listing.id
  returning * into v_listing;

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
  ) values (
    p_organization_id,v_actor,'user','rental_listing.link_rotated','rental_listing',v_listing.id,v_corr,
    jsonb_build_object('version',v_listing.version)
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (
    p_organization_id,'rental_listing.link_rotated','rental_listing',v_listing.id,v_corr,
    jsonb_build_object('listingId',v_listing.id,'version',v_listing.version)
  );

  v_response := jsonb_build_object(
    'listingId',v_listing.id,'publicId',v_listing.public_id,'previousPublicId',v_old_public_id,
    'status',v_listing.status,'visibility',v_listing.visibility,'version',v_listing.version
  );
  update private.idempotency_records r set
    state='completed',response_status=200,response_body=v_response,
    resource_type='rental_listing',resource_id=v_listing.id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor
    and r.route='RotateRentalListingLink' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.rotate_rental_listing_link(uuid,uuid,integer,text) from public,anon;
grant execute on function public.rotate_rental_listing_link(uuid,uuid,integer,text) to authenticated;

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
    'location',jsonb_build_object(
      'locality',l.locality,
      'subdivisionCode',l.subdivision_code,
      'countryCode',l.country_code
    ),
    'leaseTermText',l.lease_term_text,
    'petsText',l.pets_text,
    'utilitiesText',l.utilities_text,
    'parkingText',l.parking_text,
    'visibility',l.visibility,
    'publishedAt',l.published_at,
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
        and d.status='active' and d.document_type='rental_listing_photo'
        and d.property_id=l.property_id and d.unit_id=l.unit_id
    ),'[]'::jsonb)
  )
  from public.rental_listings l
  where l.public_id=p_public_id
    and l.status='published'
    and l.visibility='unlisted'
    and exists (
      select 1 from public.rental_listing_photos lp
      join public.document_versions dv
        on dv.id=lp.document_version_id and dv.organization_id=lp.organization_id
      join public.documents d
        on d.id=dv.document_id and d.organization_id=dv.organization_id
      where lp.listing_id=l.id and lp.organization_id=l.organization_id
        and dv.upload_status='clean' and d.status='active'
        and d.document_type='rental_listing_photo'
        and d.property_id=l.property_id and d.unit_id=l.unit_id
    )
$$;
revoke all on function public.get_public_rental_listing(uuid) from public,anon,authenticated;
grant execute on function public.get_public_rental_listing(uuid) to service_role;

commit;
