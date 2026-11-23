begin;

alter table public.rental_tour_requests add column cancelled_at timestamptz
  constraint rental_tour_cancellation_verified check (cancelled_at is null or verified_at is not null);

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
  v_event text := 'rental_tour.confirmed';
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
  if v_tour.status not in ('requested','confirmed') or v_tour.cancelled_at is not null then
    raise exception using errcode='23514',message='TOUR_NOT_REQUESTED';
  end if;

  if v_tour.status='confirmed' then v_event:='rental_tour.rescheduled'; end if;
  if v_tour.status='confirmed' and v_tour.confirmed_preference_position=p_preference_position
    and v_tour.confirmed_meeting_location=v_meeting_location then
    raise exception using errcode='23514',message='TOUR_CONFIRMATION_UNCHANGED';
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
      and r.cancelled_at is null
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

  if v_event='rental_tour.confirmed' then
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
  end if;

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,
    correlation_id,after_data
  ) values (
    p_organization_id,v_actor,'user',v_event,
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
    p_organization_id,v_event,
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

create function public.cancel_rental_tour(p_organization_id uuid,p_tour_request_id uuid,p_expected_version integer,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_tour public.rental_tour_requests%rowtype;
  v_scope text;
  v_hash text;
  v_previous private.idempotency_records%rowtype;
  v_corr uuid:=gen_random_uuid();
  v_response jsonb;
begin
  if v_actor is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_expected_version is null or p_expected_version<1
    or p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='22023',message='INVALID_TOUR_CANCEL_REQUEST';
  end if;
  perform private.enter_organization_context(p_organization_id);
  select * into v_tour from public.rental_tour_requests r
  where r.organization_id=p_organization_id and r.id=p_tour_request_id for update;
  if not found then raise exception using errcode='P0002',message='TOUR_NOT_FOUND'; end if;
  if not (private.has_property_access(v_tour.property_id,'lease.manage')
    or private.has_property_access(v_tour.property_id,'property.manage')) then
    raise exception using errcode='42501',message='TOUR_SCOPE_DENIED';
  end if;
  v_scope:='user:'||v_actor::text;
  v_hash:=encode(sha256(convert_to(jsonb_build_array(p_organization_id,p_tour_request_id,p_expected_version)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_organization_id,v_scope,'CancelRentalTour',btrim(p_idempotency_key)),0));
  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_scope=v_scope and r.route='CancelRentalTour'
    and r.idempotency_key=btrim(p_idempotency_key);
  if found then
    if v_previous.request_hash<>v_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;
  if v_tour.version<>p_expected_version then raise exception using errcode='40001',message='TOUR_VERSION_CONFLICT'; end if;
  if v_tour.status not in ('requested','confirmed') or v_tour.cancelled_at is not null
    or (v_tour.confirmed_start_at is not null and v_tour.confirmed_start_at<=now()) then
    raise exception using errcode='23514',message='TOUR_NOT_CANCELLABLE';
  end if;

  update public.rental_tour_requests set cancelled_at=now(),version=version+1,updated_at=now()
  where id=v_tour.id and organization_id=p_organization_id returning * into v_tour;
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values(p_organization_id,v_actor,'user','rental_tour.cancelled','rental_tour',v_tour.id,v_corr,jsonb_build_object('unitId',v_tour.unit_id));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values(p_organization_id,'rental_tour.cancelled','rental_tour',v_tour.id,v_corr,jsonb_build_object('unitId',v_tour.unit_id));
  v_response:=jsonb_build_object('tourRequestId',v_tour.id,'status','cancelled','version',v_tour.version);
  insert into private.idempotency_records(organization_id,actor_user_id,actor_scope,route,idempotency_key,request_hash,
    state,response_status,response_body,resource_type,resource_id,completed_at,expires_at)
  values(p_organization_id,v_actor,v_scope,'CancelRentalTour',btrim(p_idempotency_key),v_hash,
    'completed',200,v_response,'rental_tour',v_tour.id,now(),'infinity'::timestamptz);
  return v_response;
end;
$$;
revoke all on function public.cancel_rental_tour(uuid,uuid,integer,text) from public,anon;
grant execute on function public.cancel_rental_tour(uuid,uuid,integer,text) to authenticated;

commit;
