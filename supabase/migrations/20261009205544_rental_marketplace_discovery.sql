-- FD-HR-005 / B5: explicit rental marketplace discovery over the existing listing pipeline.
-- No listing becomes discoverable automatically; no alternate lead/application model is introduced.
begin;

alter table public.rental_listings
  add column discovered_at timestamptz;

create index rental_listings_discovery_idx
  on public.rental_listings(discovered_at desc,id desc)
  where status='published' and visibility='discoverable';

create or replace function private.rental_listing_visibility_fail_safe()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('paused','closed') then
    new.visibility := 'unlisted';
    new.discovered_at := null;
  elsif new.status='draft' and old.status in ('published','paused') then
    new.visibility := 'unlisted';
    new.discovered_at := null;
  end if;
  return new;
end;
$$;
revoke all on function private.rental_listing_visibility_fail_safe()
  from public,anon,authenticated,service_role;
create trigger rental_listing_visibility_fail_safe
before update of status on public.rental_listings
for each row execute function private.rental_listing_visibility_fail_safe();

create or replace function public.set_rental_listing_visibility(
  p_organization_id uuid,
  p_listing_id uuid,
  p_expected_version integer,
  p_visibility text,
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
  v_actor_scope text;
  v_hash text;
  v_previous private.idempotency_records%rowtype;
  v_corr uuid := gen_random_uuid();
  v_response jsonb;
  v_photo_count integer;
begin
  if v_actor is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_visibility not in ('unlisted','discoverable') then
    raise exception using errcode='22023',message='INVALID_LISTING_VISIBILITY';
  end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception using errcode='22023',message='INVALID_EXPECTED_VERSION';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='22023',message='INVALID_IDEMPOTENCY_KEY';
  end if;

  select * into v_listing
  from public.rental_listings l
  where l.id=p_listing_id and l.organization_id=p_organization_id
  for update;
  if not found then
    raise exception using errcode='P0002',message='LISTING_NOT_FOUND';
  end if;
  if not private.has_property_access(v_listing.property_id,'property.manage') then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  if not exists(
    select 1 from public.organizations o
    where o.id=p_organization_id and o.customer_path='self_managing'
  ) then
    raise exception using errcode='42501',message='SELF_MANAGING_WORKSPACE_REQUIRED';
  end if;

  v_actor_scope := 'user:'||v_actor::text;
  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'organizationId',p_organization_id,'listingId',p_listing_id,
    'expectedVersion',p_expected_version,'visibility',p_visibility
  )::text,'UTF8')),'hex');

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',p_organization_id,v_actor_scope,'SetRentalListingVisibility',trim(p_idempotency_key)
  ),0));

  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=p_organization_id
    and r.actor_scope=v_actor_scope
    and r.route='SetRentalListingVisibility'
    and r.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_previous.request_hash<>v_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  if v_listing.version<>p_expected_version then
    raise exception using errcode='40001',message='LISTING_VERSION_CONFLICT';
  end if;
  if v_listing.status='closed' then
    raise exception using errcode='23514',message='LISTING_CLOSED';
  end if;
  if p_visibility='discoverable' then
    if v_listing.status<>'published' then
      raise exception using errcode='23514',message='LISTING_MUST_BE_PUBLISHED_FOR_DISCOVERY';
    end if;
    if length(trim(v_listing.summary))<20 then
      raise exception using errcode='23514',message='LISTING_SUMMARY_REQUIRED';
    end if;
    select count(*)::integer into v_photo_count
    from public.rental_listing_photos lp
    join public.document_versions dv
      on dv.id=lp.document_version_id and dv.organization_id=lp.organization_id
    join public.documents d
      on d.id=dv.document_id and d.organization_id=dv.organization_id
    where lp.listing_id=v_listing.id and lp.organization_id=p_organization_id
      and dv.upload_status='clean' and d.status='active'
      and d.document_type='rental_listing_photo'
      and d.property_id=v_listing.property_id and d.unit_id=v_listing.unit_id;
    if v_photo_count<1 then
      raise exception using errcode='23514',message='LISTING_PHOTO_REQUIRED';
    end if;
  end if;

  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,request_hash,expires_at
  ) values (
    p_organization_id,v_actor,v_actor_scope,'SetRentalListingVisibility',
    trim(p_idempotency_key),v_hash,'infinity'::timestamptz
  );

  update public.rental_listings
  set visibility=p_visibility,
      discovered_at=case
        when p_visibility='discoverable' then coalesce(discovered_at,now())
        else null
      end,
      version=version+1,
      updated_at=now(),
      updated_by=v_actor
  where id=v_listing.id
  returning * into v_listing;

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,
    correlation_id,after_data
  ) values (
    p_organization_id,v_actor,'user','rental_listing.visibility_changed',
    'rental_listing',v_listing.id,v_corr,
    jsonb_build_object(
      'status',v_listing.status,'visibility',v_listing.visibility,
      'version',v_listing.version,'discoveredAt',v_listing.discovered_at
    )
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (
    p_organization_id,'rental_listing.visibility_changed',
    'rental_listing',v_listing.id,v_corr,
    jsonb_build_object(
      'listingId',v_listing.id,'unitId',v_listing.unit_id,
      'visibility',v_listing.visibility,'version',v_listing.version
    )
  );

  v_response := jsonb_build_object(
    'listingId',v_listing.id,
    'publicId',v_listing.public_id,
    'status',v_listing.status,
    'visibility',v_listing.visibility,
    'version',v_listing.version,
    'discoveredAt',v_listing.discovered_at
  );

  update private.idempotency_records r
  set state='completed',response_status=200,response_body=v_response,
      resource_type='rental_listing',resource_id=v_listing.id,completed_at=now()
  where r.organization_id=p_organization_id
    and r.actor_scope=v_actor_scope
    and r.route='SetRentalListingVisibility'
    and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;
revoke all on function public.set_rental_listing_visibility(
  uuid,uuid,integer,text,text
) from public,anon;
grant execute on function public.set_rental_listing_visibility(
  uuid,uuid,integer,text,text
) to authenticated;

create or replace function public.search_public_rental_listings(
  p_country_code text default null,
  p_subdivision_code text default null,
  p_locality text default null,
  p_min_rent_minor bigint default null,
  p_max_rent_minor bigint default null,
  p_min_bedrooms numeric default null,
  p_unit_type text default null,
  p_available_by date default null,
  p_after_discovered_at timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_country text := nullif(upper(trim(coalesce(p_country_code,''))),'');
  v_subdivision text := nullif(trim(coalesce(p_subdivision_code,'')),'');
  v_locality text := nullif(trim(coalesce(p_locality,'')),'');
  v_unit_type text := nullif(trim(coalesce(p_unit_type,'')),'');
  v_items jsonb;
  v_has_more boolean;
  v_next_at timestamptz;
  v_next_id uuid;
begin
  if p_limit is null or p_limit not between 1 and 24 then
    raise exception using errcode='22023',message='INVALID_DISCOVERY_LIMIT';
  end if;
  if v_country is not null and v_country not in ('US','CA','MX') then
    raise exception using errcode='22023',message='INVALID_DISCOVERY_COUNTRY';
  end if;
  if (v_subdivision is not null and length(v_subdivision)>100)
    or (v_locality is not null and length(v_locality)>200)
    or (v_unit_type is not null and length(v_unit_type)>100) then
    raise exception using errcode='22023',message='INVALID_DISCOVERY_FILTER';
  end if;
  if p_min_rent_minor is not null and p_min_rent_minor<0
    or p_max_rent_minor is not null and p_max_rent_minor<0
    or p_min_rent_minor is not null and p_max_rent_minor is not null
      and p_min_rent_minor>p_max_rent_minor then
    raise exception using errcode='22023',message='INVALID_DISCOVERY_RENT_RANGE';
  end if;

  if p_min_bedrooms is not null and (p_min_bedrooms<0 or p_min_bedrooms>100) then
    raise exception using errcode='22023',message='INVALID_DISCOVERY_BEDROOMS';
  end if;
  if (p_after_discovered_at is null) <> (p_after_id is null) then
    raise exception using errcode='22023',message='INVALID_DISCOVERY_CURSOR';
  end if;

  with matches as (
    select l.*,p.time_zone
    from public.rental_listings l
    join public.properties p
      on p.id=l.property_id and p.organization_id=l.organization_id
    where l.status='published'
      and l.visibility='discoverable'
      and l.discovered_at is not null
      and (v_country is null or l.country_code=v_country)
      and (v_subdivision is null or lower(l.subdivision_code)=lower(v_subdivision))
      and (v_locality is null or lower(l.locality)=lower(v_locality))
      and (p_min_rent_minor is null or l.rent_amount_minor>=p_min_rent_minor)
      and (p_max_rent_minor is null or l.rent_amount_minor<=p_max_rent_minor)
      and (p_min_bedrooms is null or l.bedrooms>=p_min_bedrooms)
      and (v_unit_type is null or lower(l.unit_type)=lower(v_unit_type))
      and (p_available_by is null or l.available_on<=p_available_by)
      and (
        p_after_discovered_at is null
        or (l.discovered_at,l.id)<(p_after_discovered_at,p_after_id)
      )
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
    order by l.discovered_at desc,l.id desc
    limit p_limit+1
  ),
  page as (
    select * from matches
    order by discovered_at desc,id desc
    limit p_limit
  )

  select
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'publicId',q.public_id,
          'title',q.title,
          'summary',left(q.summary,360),
          'rentAmountMinor',q.rent_amount_minor,
          'currencyCode',q.currency_code,
          'availableOn',q.available_on,
          'unitType',q.unit_type,
          'bedrooms',q.bedrooms,
          'bathrooms',q.bathrooms,
          'timeZone',q.time_zone,
          'location',jsonb_build_object(
            'locality',q.locality,
            'subdivisionCode',q.subdivision_code,
            'countryCode',q.country_code
          ),
          'discoveredAt',q.discovered_at,
          'heroPhoto',(
            select jsonb_build_object(
              'storageBucket',dv.storage_bucket,
              'storagePath',dv.storage_path,
              'mimeType',dv.mime_type,
              'altText',lp.alt_text
            )
            from public.rental_listing_photos lp
            join public.document_versions dv
              on dv.id=lp.document_version_id and dv.organization_id=lp.organization_id
            join public.documents d
              on d.id=dv.document_id and d.organization_id=dv.organization_id
            where lp.listing_id=q.id and lp.organization_id=q.organization_id
              and dv.upload_status='clean'
              and d.status='active'
              and d.document_type='rental_listing_photo'
              and d.property_id=q.property_id and d.unit_id=q.unit_id
            order by lp.sort_order
            limit 1
          )
        )
        order by q.discovered_at desc,q.id desc
      )
      from page q
    ),'[]'::jsonb),
    (select count(*)>p_limit from matches),
    (select q.discovered_at from page q order by q.discovered_at desc,q.id desc offset p_limit-1 limit 1),
    (select q.id from page q order by q.discovered_at desc,q.id desc offset p_limit-1 limit 1)
  into v_items,v_has_more,v_next_at,v_next_id;

  return jsonb_build_object(
    'items',v_items,
    'nextCursor',case when v_has_more then jsonb_build_object(
      'discoveredAt',v_next_at,
      'id',v_next_id
    ) else null end
  );
end;
$$;
revoke all on function public.search_public_rental_listings(
  text,text,text,bigint,bigint,numeric,text,date,timestamptz,uuid,integer
) from public,anon,authenticated;
grant execute on function public.search_public_rental_listings(
  text,text,text,bigint,bigint,numeric,text,date,timestamptz,uuid,integer
) to service_role;

-- B5 broadens the existing sanitized detail DTO to both public visibility modes.
-- Unlisted remains share-by-link; discoverable is the same record opted into search.
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


-- B5 compatibility: discovery uses the same existing public intake command.
create or replace function public.submit_public_rental_inquiry(
  p_public_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_question text,
  p_network_hash text,
  p_locale text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.rental_listings%rowtype;
  v_first_name text := trim(coalesce(p_first_name,''));
  v_last_name text := trim(coalesce(p_last_name,''));
  v_email text := lower(trim(coalesce(p_email,'')));
  v_question text := trim(coalesce(p_question,''));
  v_email_hash text;
  v_actor_scope text;
  v_request_hash text;
  v_storage_key text;
  v_previous private.idempotency_records%rowtype;
  v_inquiry_id uuid := gen_random_uuid();
  v_reference text;
  v_raw_token text;
  v_token_hash text;
  v_expires_at timestamptz := now()+interval '60 minutes';
  v_notification_job_id uuid;
  v_corr uuid := gen_random_uuid();
  v_response jsonb := jsonb_build_object('accepted',true);
begin
  if p_public_id is null then raise exception using errcode='22023',message='LISTING_REQUIRED'; end if;
  if length(v_first_name) not between 1 and 80 or length(v_last_name) not between 1 and 80 then
    raise exception using errcode='22023',message='INVALID_INQUIRER_NAME';
  end if;
  if length(v_email) not between 3 and 320
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception using errcode='22023',message='INVALID_INQUIRER_EMAIL';
  end if;
  if length(v_question) not between 10 and 2000 then
    raise exception using errcode='22023',message='INVALID_INQUIRY_QUESTION';
  end if;
  if p_network_hash is not null and p_network_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='INVALID_NETWORK_HASH';
  end if;
  if p_locale not in ('en-US','en-CA','es-MX','fr-CA') then
    raise exception using errcode='22023',message='INVALID_INQUIRY_LOCALE';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='22023',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  select * into v_listing
  from public.rental_listings l
  where l.public_id=p_public_id
    and l.status='published'
    and l.visibility in ('unlisted','discoverable')
  for share;
  if not found then
    raise exception using errcode='P0002',message='LISTING_NOT_AVAILABLE';
  end if;

  v_email_hash := encode(sha256(convert_to(v_email,'UTF8')),'hex');
  v_actor_scope := 'public-inquiry:'||p_public_id::text||':'||substr(v_email_hash,1,32);
  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'publicId',p_public_id,'firstName',v_first_name,'lastName',v_last_name,
    'email',v_email,'question',v_question,'locale',p_locale
  )::text,'UTF8')),'hex');
  -- The original v4.1 idempotency table also has a legacy uniqueness constraint whose actor_user_id
  -- is NULL for public calls. Namespace the durable key so unrelated public visitors cannot collide.
  v_storage_key := encode(sha256(convert_to(
    v_actor_scope||'|'||trim(p_idempotency_key),'UTF8'
  )),'hex');

  perform pg_advisory_xact_lock(hashtextextended('rental-inquiry|'||v_listing.id::text,0));
  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=v_listing.organization_id
    and r.actor_scope=v_actor_scope
    and r.route='SubmitPublicRentalInquiry'
    and r.idempotency_key=v_storage_key;
  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then
      return v_previous.response_body;
    end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  insert into private.idempotency_records(
    organization_id,actor_scope,route,idempotency_key,request_hash,expires_at
  ) values (
    v_listing.organization_id,v_actor_scope,'SubmitPublicRentalInquiry',
    v_storage_key,v_request_hash,now()+interval '24 hours'
  );

  if (
    select count(*) from private.rental_inquiry_attempts a
    where a.listing_id=v_listing.id
      and a.email_hash=v_email_hash
      and a.attempted_at>=now()-interval '24 hours'
  ) >= 5 then
    insert into private.rental_inquiry_attempts(listing_id,email_hash,network_hash)
    values (v_listing.id,v_email_hash,p_network_hash);    update private.idempotency_records r
    set state='completed',response_status=202,response_body=v_response,completed_at=now()
    where r.organization_id=v_listing.organization_id
      and r.actor_scope=v_actor_scope
      and r.route='SubmitPublicRentalInquiry'
      and r.idempotency_key=v_storage_key;
    return v_response;
  end if;

  if p_network_hash is not null and (
    select count(*) from private.rental_inquiry_attempts a
    where a.network_hash=p_network_hash
      and a.attempted_at>=now()-interval '1 hour'
  ) >= 20 then
    insert into private.rental_inquiry_attempts(listing_id,email_hash,network_hash)
    values (v_listing.id,v_email_hash,p_network_hash);
    update private.idempotency_records r
    set state='completed',response_status=202,response_body=v_response,completed_at=now()
    where r.organization_id=v_listing.organization_id
      and r.actor_scope=v_actor_scope
      and r.route='SubmitPublicRentalInquiry'
      and r.idempotency_key=v_storage_key;
    return v_response;
  end if;  insert into private.rental_inquiry_attempts(listing_id,email_hash,network_hash)
  values (v_listing.id,v_email_hash,p_network_hash);

  v_reference := 'INQ-'||upper(substr(replace(v_inquiry_id::text,'-',''),1,12));
  v_raw_token := encode(sha256(convert_to(
    gen_random_uuid()::text||gen_random_uuid()::text,'UTF8'
  )),'hex');
  v_token_hash := encode(sha256(convert_to(v_raw_token,'UTF8')),'hex');

  insert into public.rental_inquiries(
    id,public_reference,organization_id,listing_id,property_id,unit_id,
    first_name,last_name,email,question,source,status
  ) values (
    v_inquiry_id,v_reference,v_listing.organization_id,v_listing.id,
    v_listing.property_id,v_listing.unit_id,
    v_first_name,v_last_name,v_email,v_question,'shared_link','pending_verification'
  );

  insert into private.rental_inquiry_verifications(
    inquiry_id,organization_id,token_hash,expires_at
  ) values (
    v_inquiry_id,v_listing.organization_id,v_token_hash,v_expires_at
  );  insert into private.notification_jobs(
    organization_id,template_code,locale,channel,recipient_address,payload,idempotency_key
  ) values (
    v_listing.organization_id,'rental_inquiry_verification',p_locale,'email',v_email,
    jsonb_build_object(
      'inquiryReference',v_reference,
      'listingTitle',v_listing.title,
      'verificationToken',v_raw_token,
      'expiresAt',v_expires_at
    ),
    'rental-inquiry-verification:'||v_inquiry_id::text
  )
  returning id into v_notification_job_id;

  update private.rental_inquiry_verifications
  set notification_job_id=v_notification_job_id
  where inquiry_id=v_inquiry_id;

  insert into audit.audit_events(
    organization_id,actor_type,action_code,resource_type,resource_id,
    correlation_id,ip_hash,after_data
  ) values (
    v_listing.organization_id,'system','rental_inquiry.pending_verification',
    'rental_inquiry',v_inquiry_id,v_corr,p_network_hash,
    jsonb_build_object('listingId',v_listing.id,'unitId',v_listing.unit_id,'source','shared_link')
  );  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (
    v_listing.organization_id,'rental_inquiry.pending_verification',
    'rental_inquiry',v_inquiry_id,v_corr,
    jsonb_build_object('inquiryId',v_inquiry_id,'listingId',v_listing.id,'unitId',v_listing.unit_id)
  );

  update private.idempotency_records r
  set state='completed',response_status=202,response_body=v_response,
      resource_type='rental_inquiry',resource_id=v_inquiry_id,completed_at=now()
  where r.organization_id=v_listing.organization_id
    and r.actor_scope=v_actor_scope
    and r.route='SubmitPublicRentalInquiry'
    and r.idempotency_key=v_storage_key;
  return v_response;
end;
$$;

-- B5 compatibility: discovery uses the same existing public intake command.
create or replace function public.submit_public_rental_tour_request(
  p_public_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_preferences jsonb,
  p_network_hash text,
  p_locale text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.rental_listings%rowtype;
  v_property public.properties%rowtype;
  v_first_name text := trim(coalesce(p_first_name,''));
  v_last_name text := trim(coalesce(p_last_name,''));
  v_email text := lower(trim(coalesce(p_email,'')));
  v_email_hash text;
  v_actor_scope text;
  v_request_hash text;
  v_storage_key text;
  v_previous private.idempotency_records%rowtype;
  v_tour_id uuid := gen_random_uuid();
  v_reference text;
  v_raw_token text;
  v_token_hash text;
  v_expires_at timestamptz := now()+interval '60 minutes';
  v_notification_job_id uuid;
  v_corr uuid := gen_random_uuid();
  v_response jsonb := jsonb_build_object('accepted',true);
  v_pref jsonb;
  v_local_raw text;
  v_local_start timestamp without time zone;
  v_start_at timestamptz;
  v_starts timestamptz[] := '{}'::timestamptz[];
  v_position smallint := 0;
begin
  if p_public_id is null then
    raise exception using errcode='22023',message='LISTING_REQUIRED';
  end if;
  if length(v_first_name) not between 1 and 80 or length(v_last_name) not between 1 and 80 then
    raise exception using errcode='22023',message='INVALID_TOUR_NAME';
  end if;
  if length(v_email) not between 3 and 320
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception using errcode='22023',message='INVALID_TOUR_EMAIL';
  end if;
  if jsonb_typeof(p_preferences) is distinct from 'array'
    or jsonb_array_length(p_preferences) not between 1 and 3 then
    raise exception using errcode='22023',message='INVALID_TOUR_PREFERENCES';
  end if;
  if p_network_hash is not null and p_network_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='INVALID_NETWORK_HASH';
  end if;
  if p_locale not in ('en-US','en-CA','es-MX','fr-CA') then
    raise exception using errcode='22023',message='INVALID_TOUR_LOCALE';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='22023',message='INVALID_IDEMPOTENCY_KEY';
  end if;

  select * into v_listing
  from public.rental_listings l
  where l.public_id=p_public_id and l.status='published' and l.visibility in ('unlisted','discoverable')
  for share;
  if not found then
    raise exception using errcode='P0002',message='LISTING_NOT_AVAILABLE';
  end if;
  select * into v_property
  from public.properties p
  where p.id=v_listing.property_id and p.organization_id=v_listing.organization_id
    and p.archived_at is null and p.status<>'archived';
  if not found then
    raise exception using errcode='P0002',message='PROPERTY_NOT_AVAILABLE';
  end if;
  for v_pref in select value from jsonb_array_elements(p_preferences) loop
    if jsonb_typeof(v_pref) is distinct from 'string' then
      raise exception using errcode='22023',message='INVALID_TOUR_PREFERENCE';
    end if;
    v_local_raw := trim(both '"' from v_pref::text);
    if v_local_raw !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$' then
      raise exception using errcode='22023',message='INVALID_TOUR_PREFERENCE';
    end if;
    begin
      v_local_start := replace(v_local_raw,'T',' ')::timestamp;
      v_start_at := v_local_start at time zone v_property.time_zone;
    exception when others then
      raise exception using errcode='22007',message='INVALID_TOUR_PREFERENCE';
    end;
    if (v_start_at at time zone v_property.time_zone)<>v_local_start then
      raise exception using errcode='22007',message='INVALID_TOUR_LOCAL_TIME';
    end if;
    if v_start_at<=now() or v_start_at>now()+interval '60 days' then
      raise exception using errcode='22023',message='TOUR_PREFERENCE_OUT_OF_RANGE';
    end if;
    if v_start_at=any(v_starts) then
      raise exception using errcode='23505',message='DUPLICATE_TOUR_PREFERENCE';
    end if;
    v_starts := array_append(v_starts,v_start_at);
  end loop;

  v_email_hash := encode(sha256(convert_to(v_email,'UTF8')),'hex');
  v_actor_scope := 'public-tour:'||p_public_id::text||':'||substr(v_email_hash,1,32);
  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'publicId',p_public_id,'firstName',v_first_name,'lastName',v_last_name,
    'email',v_email,'preferences',p_preferences,'locale',p_locale
  )::text,'UTF8')),'hex');
  v_storage_key := encode(sha256(convert_to(
    v_actor_scope||'|'||trim(p_idempotency_key),'UTF8'
  )),'hex');

  perform pg_advisory_xact_lock(hashtextextended('rental-tour|'||v_listing.id::text,0));
  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=v_listing.organization_id
    and r.actor_scope=v_actor_scope
    and r.route='SubmitPublicRentalTour'
    and r.idempotency_key=v_storage_key;
  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  insert into private.idempotency_records(
    organization_id,actor_scope,route,idempotency_key,request_hash,expires_at
  ) values (
    v_listing.organization_id,v_actor_scope,'SubmitPublicRentalTour',
    v_storage_key,v_request_hash,now()+interval '24 hours'
  );

  if (
    select count(*) from private.rental_tour_attempts a
    where a.listing_id=v_listing.id
      and a.email_hash=v_email_hash
      and a.attempted_at>=now()-interval '24 hours'
  ) >= 5 then
    insert into private.rental_tour_attempts(listing_id,email_hash,network_hash)
    values (v_listing.id,v_email_hash,p_network_hash);
    update private.idempotency_records r
    set state='completed',response_status=202,response_body=v_response,completed_at=now()
    where r.organization_id=v_listing.organization_id
      and r.actor_scope=v_actor_scope
      and r.route='SubmitPublicRentalTour'
      and r.idempotency_key=v_storage_key;
    return v_response;
  end if;

  if p_network_hash is not null and (
    select count(*) from private.rental_tour_attempts a
    where a.network_hash=p_network_hash
      and a.attempted_at>=now()-interval '1 hour'
  ) >= 20 then
    insert into private.rental_tour_attempts(listing_id,email_hash,network_hash)
    values (v_listing.id,v_email_hash,p_network_hash);
    update private.idempotency_records r
    set state='completed',response_status=202,response_body=v_response,completed_at=now()
    where r.organization_id=v_listing.organization_id
      and r.actor_scope=v_actor_scope
      and r.route='SubmitPublicRentalTour'
      and r.idempotency_key=v_storage_key;
    return v_response;
  end if;

  insert into private.rental_tour_attempts(listing_id,email_hash,network_hash)
  values (v_listing.id,v_email_hash,p_network_hash);

  v_reference := 'TOUR-'||upper(substr(replace(v_tour_id::text,'-',''),1,12));
  v_raw_token := encode(sha256(convert_to(
    gen_random_uuid()::text||gen_random_uuid()::text,'UTF8'
  )),'hex');
  v_token_hash := encode(sha256(convert_to(v_raw_token,'UTF8')),'hex');

  insert into public.rental_tour_requests(
    id,public_reference,organization_id,listing_id,property_id,unit_id,
    first_name,last_name,email,property_time_zone,source,status
  ) values (
    v_tour_id,v_reference,v_listing.organization_id,v_listing.id,
    v_listing.property_id,v_listing.unit_id,v_first_name,v_last_name,v_email,
    v_property.time_zone,'shared_link','pending_verification'
  );

  v_position := 0;
  for v_pref in select value from jsonb_array_elements(p_preferences) loop
    v_local_raw := trim(both '"' from v_pref::text);
    v_local_start := replace(v_local_raw,'T',' ')::timestamp;
    v_start_at := v_local_start at time zone v_property.time_zone;
    insert into public.rental_tour_preferences(
      organization_id,tour_request_id,position,local_start,starts_at,ends_at
    ) values (
      v_listing.organization_id,v_tour_id,v_position,v_local_start,
      v_start_at,v_start_at+interval '30 minutes'
    );
    v_position := v_position+1;
  end loop;

  insert into private.rental_tour_verifications(
    tour_request_id,organization_id,token_hash,expires_at
  ) values (
    v_tour_id,v_listing.organization_id,v_token_hash,v_expires_at
  );

  insert into private.notification_jobs(
    organization_id,template_code,locale,channel,recipient_address,payload,idempotency_key
  ) values (
    v_listing.organization_id,'rental_tour_verification',p_locale,'email',v_email,
    jsonb_build_object(
      'tourReference',v_reference,
      'listingTitle',v_listing.title,
      'verificationToken',v_raw_token,
      'expiresAt',v_expires_at,
      'timeZone',v_property.time_zone
    ),
    'rental-tour-verification:'||v_tour_id::text
  )
  returning id into v_notification_job_id;

  update private.rental_tour_verifications
  set notification_job_id=v_notification_job_id
  where tour_request_id=v_tour_id;

  insert into audit.audit_events(
    organization_id,actor_type,action_code,resource_type,resource_id,
    correlation_id,ip_hash,after_data
  ) values (
    v_listing.organization_id,'system','rental_tour.pending_verification',
    'rental_tour',v_tour_id,v_corr,p_network_hash,
    jsonb_build_object(
      'listingId',v_listing.id,'unitId',v_listing.unit_id,
      'source','shared_link','preferenceCount',jsonb_array_length(p_preferences)
    )
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (
    v_listing.organization_id,'rental_tour.pending_verification',
    'rental_tour',v_tour_id,v_corr,
    jsonb_build_object(
      'tourRequestId',v_tour_id,'listingId',v_listing.id,'unitId',v_listing.unit_id
    )
  );

  update private.idempotency_records r
  set state='completed',response_status=202,response_body=v_response,
      resource_type='rental_tour',resource_id=v_tour_id,completed_at=now()
  where r.organization_id=v_listing.organization_id
    and r.actor_scope=v_actor_scope
    and r.route='SubmitPublicRentalTour'
    and r.idempotency_key=v_storage_key;
  return v_response;
end;
$$;

-- B5 compatibility: discovery uses the same existing public intake command.
create or replace function public.submit_public_rental_application(
  p_public_id uuid, p_first_name text, p_last_name text, p_email text,
  p_desired_move_in_on date, p_lease_term_text text, p_applicant_note text,
  p_network_hash text, p_locale text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_listing public.rental_listings%rowtype;
  v_property public.properties%rowtype;
  v_first text:=trim(coalesce(p_first_name,''));
  v_last text:=trim(coalesce(p_last_name,''));
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_term text:=trim(coalesce(p_lease_term_text,''));
  v_note text:=trim(coalesce(p_applicant_note,''));
  v_email_hash text; v_actor_scope text; v_request_hash text; v_storage_key text;
  v_previous private.idempotency_records%rowtype;
  v_existing public.rental_applications%rowtype;
  v_application_id uuid:=gen_random_uuid(); v_reference text;
  v_raw_token text; v_token_hash text; v_expires_at timestamptz:=now()+interval '60 minutes';
  v_job_id uuid; v_corr uuid:=gen_random_uuid();
  v_response jsonb:=jsonb_build_object('accepted',true);
  v_local_day date;
begin
  if p_public_id is null then raise exception using errcode='22023',message='LISTING_REQUIRED'; end if;
  if length(v_first) not between 1 and 80 or length(v_last) not between 1 and 80 then
    raise exception using errcode='22023',message='INVALID_APPLICANT_NAME';
  end if;  if length(v_email) not between 3 and 320
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception using errcode='22023',message='INVALID_APPLICANT_EMAIL';
  end if;
  if length(v_term)>300 or length(v_note)>2000 then
    raise exception using errcode='22023',message='INVALID_APPLICATION_TEXT';
  end if;
  if p_network_hash is not null and p_network_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='INVALID_NETWORK_HASH';
  end if;
  if p_locale not in ('en-US','en-CA','es-MX','fr-CA') then
    raise exception using errcode='22023',message='INVALID_APPLICATION_LOCALE';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='22023',message='INVALID_IDEMPOTENCY_KEY';
  end if;

  select * into v_listing from public.rental_listings l
  where l.public_id=p_public_id and l.status='published' and l.visibility in ('unlisted','discoverable') for share;
  if not found then raise exception using errcode='P0002',message='LISTING_NOT_AVAILABLE'; end if;
  select * into v_property from public.properties p
  where p.id=v_listing.property_id and p.organization_id=v_listing.organization_id;
  if not found then raise exception using errcode='P0002',message='PROPERTY_NOT_FOUND'; end if;
  v_local_day:=(now() at time zone v_property.time_zone)::date;
  if p_desired_move_in_on is null or p_desired_move_in_on<=v_local_day
    or p_desired_move_in_on<v_listing.available_on
    or p_desired_move_in_on>v_local_day+365 then
    raise exception using errcode='22023',message='INVALID_DESIRED_MOVE_IN_DATE';
  end if;
  v_email_hash:=encode(sha256(convert_to(v_email,'UTF8')),'hex');
  v_actor_scope:='public-application:'||p_public_id::text||':'||substr(v_email_hash,1,32);
  v_request_hash:=encode(sha256(convert_to(jsonb_build_object(
    'publicId',p_public_id,'firstName',v_first,'lastName',v_last,'email',v_email,
    'desiredMoveInOn',p_desired_move_in_on,'leaseTermText',v_term,'applicantNote',v_note,'locale',p_locale
  )::text,'UTF8')),'hex');
  v_storage_key:=encode(sha256(convert_to(v_actor_scope||'|'||trim(p_idempotency_key),'UTF8')),'hex');

  -- Retain more than the 24-hour email budget but prevent indefinite
  -- accumulation of pseudonymous applicant/network attempt signals.
  -- A bounded SKIP LOCKED pass avoids cross-listing lock contention.
  with aged as (
    select a.id from private.rental_application_attempts a
    where a.attempted_at < now()-interval '48 hours'
    order by a.attempted_at
    limit 100
    for update skip locked
  )
  delete from private.rental_application_attempts a
    using aged e where a.id=e.id;

  perform pg_advisory_xact_lock(hashtextextended('rental-application|'||v_listing.id::text,0));
  -- The per-network limit spans listings: serialize its count/insert across
  -- different listings, not merely submissions to the same listing.
  -- Lock order is always listing first, network second.
  if p_network_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended('rental-application-network|'||p_network_hash,0));
  end if;
  select * into v_previous from private.idempotency_records r
  where r.organization_id=v_listing.organization_id and r.actor_scope=v_actor_scope
    and r.route='SubmitPublicRentalApplication' and r.idempotency_key=v_storage_key;
  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;
  insert into private.idempotency_records(
    organization_id,actor_scope,route,idempotency_key,request_hash,expires_at
  ) values (v_listing.organization_id,v_actor_scope,'SubmitPublicRentalApplication',
    v_storage_key,v_request_hash,now()+interval '24 hours');
  if (select count(*) from private.rental_application_attempts a
      where a.listing_id=v_listing.id and a.email_hash=v_email_hash
        and a.attempted_at>=now()-interval '24 hours')>=3 then
    insert into private.rental_application_attempts(listing_id,email_hash,network_hash)
      values(v_listing.id,v_email_hash,p_network_hash);
    update private.idempotency_records r set state='completed',response_status=202,
      response_body=v_response,completed_at=now()
    where r.organization_id=v_listing.organization_id and r.actor_scope=v_actor_scope
      and r.route='SubmitPublicRentalApplication' and r.idempotency_key=v_storage_key;
    return v_response;
  end if;
  if p_network_hash is not null and (select count(*) from private.rental_application_attempts a
      where a.network_hash=p_network_hash and a.attempted_at>=now()-interval '1 hour')>=20 then
    insert into private.rental_application_attempts(listing_id,email_hash,network_hash)
      values(v_listing.id,v_email_hash,p_network_hash);
    update private.idempotency_records r set state='completed',response_status=202,
      response_body=v_response,completed_at=now()
    where r.organization_id=v_listing.organization_id and r.actor_scope=v_actor_scope
      and r.route='SubmitPublicRentalApplication' and r.idempotency_key=v_storage_key;
    return v_response;
  end if;
  insert into private.rental_application_attempts(listing_id,email_hash,network_hash)
    values(v_listing.id,v_email_hash,p_network_hash);

  select * into v_existing from public.rental_applications a
  where a.listing_id=v_listing.id and lower(a.email::text)=v_email
    and a.status in ('pending_verification','submitted','lease_preparation','converted')
  order by a.created_at desc limit 1 for update;  if found then
    if v_existing.status='pending_verification' and exists(
      select 1 from private.rental_application_verifications v
      where v.application_id=v_existing.id and v.expires_at<=now()
    ) then
      update public.rental_applications set status='expired',updated_at=now(),version=version+1
        where id=v_existing.id;
      update private.rental_application_verifications set consumed_at=coalesce(consumed_at,now())
        where application_id=v_existing.id;
      -- A newly submitted application must never leave the expired link queued for delivery.
      update private.notification_jobs
        set status='canceled',last_error='VERIFICATION_EXPIRED'
        where id=(select notification_job_id from private.rental_application_verifications
                  where application_id=v_existing.id)
          and status in ('queued','failed');
    else
      update private.idempotency_records r set state='completed',response_status=202,
        response_body=v_response,resource_type='rental_application',resource_id=v_existing.id,completed_at=now()
      where r.organization_id=v_listing.organization_id and r.actor_scope=v_actor_scope
        and r.route='SubmitPublicRentalApplication' and r.idempotency_key=v_storage_key;
      return v_response;
    end if;
  end if;

  v_reference:='APP-'||upper(substr(replace(v_application_id::text,'-',''),1,12));
  v_raw_token:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  v_token_hash:=encode(sha256(convert_to(v_raw_token,'UTF8')),'hex');
  insert into public.rental_applications(
    id,public_reference,organization_id,listing_id,property_id,unit_id,
    first_name,last_name,email,desired_move_in_on,lease_term_text,applicant_note,
    listing_title_snapshot,listing_rent_amount_minor,currency_code,listing_available_on
  ) values (v_application_id,v_reference,v_listing.organization_id,v_listing.id,
    v_listing.property_id,v_listing.unit_id,v_first,v_last,v_email,p_desired_move_in_on,
    v_term,v_note,v_listing.title,v_listing.rent_amount_minor,v_listing.currency_code,v_listing.available_on);
  insert into private.rental_application_verifications(
    application_id,organization_id,token_hash,expires_at
  ) values (v_application_id,v_listing.organization_id,v_token_hash,v_expires_at);
  insert into private.notification_jobs(
    organization_id,template_code,locale,channel,recipient_address,payload,idempotency_key
  ) values (v_listing.organization_id,'rental_application_verification',p_locale,'email',v_email,
    jsonb_build_object(
      'applicationReference',v_reference,'listingTitle',v_listing.title,
      'verificationToken',v_raw_token,'expiresAt',v_expires_at
    ),'rental-application-verification:'||v_application_id::text
  ) returning id into v_job_id;
  update private.rental_application_verifications set notification_job_id=v_job_id
    where application_id=v_application_id;

  insert into audit.audit_events(
    organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,ip_hash,after_data
  ) values (v_listing.organization_id,'system','rental_application.pending_verification',
    'rental_application',v_application_id,v_corr,p_network_hash,
    jsonb_build_object('listingId',v_listing.id,'unitId',v_listing.unit_id,'source','shared_link'));
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (v_listing.organization_id,'rental_application.pending_verification',
    'rental_application',v_application_id,v_corr,
    jsonb_build_object('applicationId',v_application_id,'listingId',v_listing.id,'unitId',v_listing.unit_id));
  update private.idempotency_records r set state='completed',response_status=202,response_body=v_response,
    resource_type='rental_application',resource_id=v_application_id,completed_at=now()
  where r.organization_id=v_listing.organization_id and r.actor_scope=v_actor_scope
    and r.route='SubmitPublicRentalApplication' and r.idempotency_key=v_storage_key;
  return v_response;
end; $$;
commit;
