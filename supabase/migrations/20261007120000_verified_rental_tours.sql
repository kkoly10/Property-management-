-- FD-HR-002–005 / Batch B3: verified tour requests for published unlisted listings.
-- Tour confirmation is logistics only; no screening, scoring, ranking or application decision is introduced.
begin;

create table public.rental_tour_requests (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null unique,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  listing_id uuid not null,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  last_name text not null check (length(trim(last_name)) between 1 and 80),
  email citext not null check (length(trim(email::text)) between 3 and 320),
  property_time_zone text not null check (length(trim(property_time_zone)) between 1 and 80),
  source text not null default 'shared_link' check (source='shared_link'),
  status text not null default 'pending_verification'
    check (status in ('pending_verification','requested','confirmed','expired')),
  verified_at timestamptz,
  confirmed_preference_position smallint check (confirmed_preference_position between 0 and 2),
  confirmed_start_at timestamptz,
  confirmed_end_at timestamptz,
  confirmed_at timestamptz,
  confirmed_meeting_location text check (
    confirmed_meeting_location is null or length(trim(confirmed_meeting_location)) between 3 and 500
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version>0),
  unique (organization_id,id),
  foreign key (organization_id,listing_id)
    references public.rental_listings(organization_id,id) on delete restrict,
  foreign key (organization_id,property_id)
    references public.properties(organization_id,id) on delete restrict,
  foreign key (organization_id,property_id,unit_id)
    references public.units(organization_id,property_id,id) on delete restrict,
  check (
    (status='pending_verification' and verified_at is null and confirmed_at is null)
    or (status='requested' and verified_at is not null and confirmed_at is null)
    or (
      status='confirmed' and verified_at is not null and confirmed_at is not null
      and confirmed_preference_position is not null
      and confirmed_start_at is not null and confirmed_end_at is not null
      and confirmed_meeting_location is not null
      and confirmed_end_at=confirmed_start_at+interval '30 minutes'
    )
    or (status='expired' and verified_at is null and confirmed_at is null)
  )
);
create index rental_tour_requests_unit_status_idx
  on public.rental_tour_requests(organization_id,unit_id,status,created_at desc);
create index rental_tour_requests_listing_email_idx
  on public.rental_tour_requests(listing_id,email,created_at desc);

create table public.rental_tour_preferences (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  tour_request_id uuid not null,
  position smallint not null check (position between 0 and 2),
  local_start timestamp without time zone not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (tour_request_id,position),
  unique (organization_id,tour_request_id,position),
  foreign key (organization_id,tour_request_id)
    references public.rental_tour_requests(organization_id,id) on delete cascade,
  check (ends_at=starts_at+interval '30 minutes')
);
create index rental_tour_preferences_start_idx
  on public.rental_tour_preferences(starts_at,tour_request_id);

create table private.rental_tour_verifications (
  tour_request_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  notification_job_id uuid references private.notification_jobs(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (organization_id,tour_request_id)
    references public.rental_tour_requests(organization_id,id) on delete cascade,
  check (expires_at>created_at),
  check (consumed_at is null or consumed_at>=created_at)
);
create index rental_tour_verifications_expiry_idx
  on private.rental_tour_verifications(expires_at) where consumed_at is null;

create table private.rental_tour_attempts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.rental_listings(id) on delete cascade,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  network_hash text check (network_hash is null or network_hash ~ '^[0-9a-f]{64}$'),
  attempted_at timestamptz not null default now()
);
create index rental_tour_attempts_email_idx
  on private.rental_tour_attempts(listing_id,email_hash,attempted_at desc);
create index rental_tour_attempts_network_idx
  on private.rental_tour_attempts(network_hash,attempted_at desc)
  where network_hash is not null;

alter table public.rental_tour_requests enable row level security;
alter table public.rental_tour_preferences enable row level security;
create policy rental_tour_requests_verified_operator_read
on public.rental_tour_requests for select to authenticated
using (
  status in ('requested','confirmed')
  and (
    private.has_property_access(property_id,'lease.manage')
    or private.has_property_access(property_id,'property.manage')
  )
);
create policy rental_tour_preferences_parent_read
on public.rental_tour_preferences for select to authenticated
using (
  exists (
    select 1 from public.rental_tour_requests r
    where r.id=tour_request_id
      and r.organization_id=rental_tour_preferences.organization_id
      and r.status in ('requested','confirmed')
      and (
        private.has_property_access(r.property_id,'lease.manage')
        or private.has_property_access(r.property_id,'property.manage')
      )
  )
);
grant select on public.rental_tour_requests,public.rental_tour_preferences to authenticated;
revoke insert,update,delete on public.rental_tour_requests,public.rental_tour_preferences
  from anon,authenticated;
revoke all on public.rental_tour_requests,public.rental_tour_preferences from anon;
revoke all on private.rental_tour_verifications,private.rental_tour_attempts
  from public,anon,authenticated,service_role;

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
  where l.public_id=p_public_id and l.status='published' and l.visibility='unlisted'
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
revoke all on function public.submit_public_rental_tour_request(
  uuid,text,text,text,jsonb,text,text,text
) from public,anon,authenticated;
grant execute on function public.submit_public_rental_tour_request(
  uuid,text,text,text,jsonb,text,text,text
) to service_role;

create or replace function private.scrub_rental_tour_verification_token()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.template_code='rental_tour_verification'
    and new.status in ('sent','dead_letter','canceled') then
    new.payload := new.payload - 'verificationToken';
  end if;
  return new;
end;
$$;
revoke all on function private.scrub_rental_tour_verification_token()
  from public,anon,authenticated,service_role;
create trigger scrub_rental_tour_verification_token
before insert or update of status on private.notification_jobs
for each row execute function private.scrub_rental_tour_verification_token();

create or replace function public.verify_public_rental_tour(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := lower(trim(coalesce(p_token,'')));
  v_token_hash text;
  v_verification private.rental_tour_verifications%rowtype;
  v_tour public.rental_tour_requests%rowtype;
  v_corr uuid := gen_random_uuid();
begin
  if v_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('verified',false);
  end if;
  v_token_hash := encode(sha256(convert_to(v_token,'UTF8')),'hex');

  select * into v_verification
  from private.rental_tour_verifications v
  where v.token_hash=v_token_hash
  for update;
  if not found then
    return jsonb_build_object('verified',false);
  end if;

  select * into v_tour
  from public.rental_tour_requests r
  where r.id=v_verification.tour_request_id
    and r.organization_id=v_verification.organization_id
  for update;
  if not found then
    return jsonb_build_object('verified',false);
  end if;

  if v_verification.consumed_at is not null then
    if v_tour.status in ('requested','confirmed') and v_tour.verified_at is not null then
      return jsonb_build_object(
        'verified',true,
        'tourReference',v_tour.public_reference,
        'status',v_tour.status
      );
    end if;
    return jsonb_build_object('verified',false);
  end if;

  if v_verification.expires_at<=now() then
    if v_tour.status='pending_verification' then
      update public.rental_tour_requests
      set status='expired',updated_at=now(),version=version+1
      where id=v_tour.id;
    end if;
    update private.rental_tour_verifications
    set consumed_at=now()
    where tour_request_id=v_tour.id;
    update private.notification_jobs
    set status='canceled',last_error='VERIFICATION_EXPIRED'
    where id=v_verification.notification_job_id
      and status in ('queued','failed');
    return jsonb_build_object('verified',false);
  end if;

  if v_tour.status<>'pending_verification' then
    return jsonb_build_object('verified',false);
  end if;

  update public.rental_tour_requests
  set status='requested',verified_at=now(),updated_at=now(),version=version+1
  where id=v_tour.id
  returning * into v_tour;

  update private.rental_tour_verifications
  set consumed_at=now()
  where tour_request_id=v_tour.id;

  insert into audit.audit_events(
    organization_id,actor_type,action_code,resource_type,resource_id,
    correlation_id,after_data
  ) values (
    v_tour.organization_id,'system','rental_tour.verified',
    'rental_tour',v_tour.id,v_corr,
    jsonb_build_object(
      'listingId',v_tour.listing_id,'unitId',v_tour.unit_id,'status','requested'
    )
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (
    v_tour.organization_id,'rental_tour.verified',
    'rental_tour',v_tour.id,v_corr,
    jsonb_build_object(
      'tourRequestId',v_tour.id,'listingId',v_tour.listing_id,'unitId',v_tour.unit_id
    )
  );

  return jsonb_build_object(
    'verified',true,
    'tourReference',v_tour.public_reference,
    'status',v_tour.status
  );
end;
$$;
revoke all on function public.verify_public_rental_tour(text)
  from public,anon,authenticated;
grant execute on function public.verify_public_rental_tour(text) to service_role;

create or replace function public.confirm_rental_tour(
  p_organization_id uuid,
  p_tour_request_id uuid,
  p_expected_version integer,
  p_preference_position integer,
  p_meeting_location text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_scope text;
  v_tour public.rental_tour_requests%rowtype;
  v_pref public.rental_tour_preferences%rowtype;
  v_listing public.rental_listings%rowtype;
  v_hash text;
  v_previous private.idempotency_records%rowtype;
  v_corr uuid := gen_random_uuid();
  v_notification_job_id uuid;
  v_meeting_location text := trim(coalesce(p_meeting_location,''));
  v_response jsonb;
begin
  if v_actor is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception using errcode='22023',message='INVALID_EXPECTED_VERSION';
  end if;
  if p_preference_position is null or p_preference_position not between 0 and 2 then
    raise exception using errcode='22023',message='INVALID_TOUR_PREFERENCE';
  end if;
  if length(v_meeting_location) not between 3 and 500 then
    raise exception using errcode='22023',message='INVALID_TOUR_MEETING_LOCATION';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='22023',message='INVALID_IDEMPOTENCY_KEY';
  end if;

  select * into v_tour
  from public.rental_tour_requests r
  where r.id=p_tour_request_id and r.organization_id=p_organization_id
  for update;
  if not found then
    raise exception using errcode='P0002',message='TOUR_NOT_FOUND';
  end if;
  if not (
    private.has_property_access(v_tour.property_id,'lease.manage')
    or private.has_property_access(v_tour.property_id,'property.manage')
  ) then
    raise exception using errcode='42501',message='TOUR_SCOPE_DENIED';
  end if;

  v_actor_scope := 'user:'||v_actor::text;
  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'organizationId',p_organization_id,'tourRequestId',p_tour_request_id,
    'expectedVersion',p_expected_version,'preferencePosition',p_preference_position,
    'meetingLocation',v_meeting_location
  )::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',p_organization_id,v_actor_scope,'ConfirmRentalTour',trim(p_idempotency_key)
  ),0));
  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=p_organization_id
    and r.actor_scope=v_actor_scope
    and r.route='ConfirmRentalTour'
    and r.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_previous.request_hash<>v_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  if v_tour.version<>p_expected_version then
    raise exception using errcode='40001',message='TOUR_VERSION_CONFLICT';
  end if;
  if v_tour.status<>'requested' then
    raise exception using errcode='23514',message='TOUR_NOT_REQUESTED';
  end if;

  select * into v_pref
  from public.rental_tour_preferences p
  where p.tour_request_id=v_tour.id
    and p.organization_id=p_organization_id
    and p.position=p_preference_position;
  if not found then
    raise exception using errcode='P0002',message='TOUR_PREFERENCE_NOT_FOUND';
  end if;
  if v_pref.starts_at<=now() then
    raise exception using errcode='23514',message='TOUR_PREFERENCE_PAST';
  end if;

  -- Every confirmation for this unit serializes through one lock. The overlap test therefore cannot
  -- race another confirmed 30-minute slot even though direct browser writes are also revoked.
  perform pg_advisory_xact_lock(hashtextextended(
    'rental-tour-confirm:'||v_tour.unit_id::text,0
  ));
  if exists (
    select 1 from public.rental_tour_requests r
    where r.organization_id=p_organization_id
      and r.unit_id=v_tour.unit_id
      and r.status='confirmed'
      and r.id<>v_tour.id
      and r.confirmed_start_at<v_pref.ends_at
      and r.confirmed_end_at>v_pref.starts_at
  ) then
    raise exception using errcode='23514',message='TOUR_SLOT_CONFLICT';
  end if;

  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,request_hash,expires_at
  ) values (
    p_organization_id,v_actor,v_actor_scope,'ConfirmRentalTour',
    trim(p_idempotency_key),v_hash,'infinity'::timestamptz
  );

  update public.rental_tour_requests
  set status='confirmed',
      confirmed_preference_position=p_preference_position,
      confirmed_start_at=v_pref.starts_at,
      confirmed_end_at=v_pref.ends_at,
      confirmed_at=now(),
      confirmed_meeting_location=v_meeting_location,
      updated_at=now(),
      version=version+1
  where id=v_tour.id
  returning * into v_tour;

  select * into v_listing
  from public.rental_listings l
  where l.id=v_tour.listing_id and l.organization_id=p_organization_id;

  insert into private.notification_jobs(
    organization_id,template_code,locale,channel,recipient_address,payload,idempotency_key
  ) values (
    p_organization_id,'rental_tour_confirmed','en-US','email',v_tour.email,
    jsonb_build_object(
      'tourReference',v_tour.public_reference,
      'listingTitle',coalesce(v_listing.title,'your rental tour'),
      'confirmedStartAt',v_tour.confirmed_start_at,
      'timeZone',v_tour.property_time_zone,
      'meetingLocation',v_tour.confirmed_meeting_location
    ),
    'rental-tour-confirmed:'||v_tour.id::text
  )
  returning id into v_notification_job_id;

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,
    correlation_id,after_data
  ) values (
    p_organization_id,v_actor,'user','rental_tour.confirmed',
    'rental_tour',v_tour.id,v_corr,
    jsonb_build_object(
      'listingId',v_tour.listing_id,'unitId',v_tour.unit_id,
      'confirmedStartAt',v_tour.confirmed_start_at,
      'timeZone',v_tour.property_time_zone,
      'notificationJobId',v_notification_job_id
    )
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (
    p_organization_id,'rental_tour.confirmed',
    'rental_tour',v_tour.id,v_corr,
    jsonb_build_object(
      'tourRequestId',v_tour.id,'listingId',v_tour.listing_id,'unitId',v_tour.unit_id,
      'confirmedStartAt',v_tour.confirmed_start_at
    )
  );

  v_response := jsonb_build_object(
    'tourRequestId',v_tour.id,
    'publicReference',v_tour.public_reference,
    'status',v_tour.status,
    'version',v_tour.version,
    'confirmedPreferencePosition',v_tour.confirmed_preference_position,
    'confirmedStartAt',v_tour.confirmed_start_at,
    'timeZone',v_tour.property_time_zone,
    'meetingLocation',v_tour.confirmed_meeting_location
  );
  update private.idempotency_records r
  set state='completed',response_status=200,response_body=v_response,
      resource_type='rental_tour',resource_id=v_tour.id,completed_at=now()
  where r.organization_id=p_organization_id
    and r.actor_scope=v_actor_scope
    and r.route='ConfirmRentalTour'
    and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;
revoke all on function public.confirm_rental_tour(
  uuid,uuid,integer,integer,text,text
) from public,anon;
grant execute on function public.confirm_rental_tour(
  uuid,uuid,integer,integer,text,text
) to authenticated;

-- B3 exposes only the property's scheduling zone in the existing sanitized listing DTO.
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
  join public.properties p
    on p.id=l.property_id and p.organization_id=l.organization_id
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
