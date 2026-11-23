begin;

alter table public.rental_tour_requests
  add column renter_preferences_updated_at timestamptz,
  add column renter_change_pending boolean not null default false;

create function private.clear_renter_tour_change()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.cancelled_at is not null or new.confirmed_preference_position is distinct from old.confirmed_preference_position then
    new.renter_change_pending:=false;
  end if;
  return new;
end; $$;
revoke all on function private.clear_renter_tour_change() from public,anon,authenticated,service_role;
create trigger clear_renter_tour_change before update of cancelled_at,confirmed_preference_position
on public.rental_tour_requests for each row execute function private.clear_renter_tour_change();

create function private.rental_prospect_tour_snapshot(p_tour public.rental_tour_requests)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'version',p_tour.version,
    'status',case when p_tour.cancelled_at is not null then 'cancelled' else p_tour.status end,
    'timeZone',p_tour.property_time_zone,
    'confirmedStartAt',case when p_tour.cancelled_at is null then p_tour.confirmed_start_at end,
    'meetingLocation',case when p_tour.cancelled_at is null then p_tour.confirmed_meeting_location end,
    'canManage',p_tour.cancelled_at is null and (p_tour.confirmed_start_at is null or p_tour.confirmed_start_at>now()),
    'changePending',p_tour.renter_change_pending,
    'preferences',coalesce((select jsonb_agg(p.starts_at order by p.position)
      from public.rental_tour_preferences p where p.organization_id=p_tour.organization_id
        and p.tour_request_id=p_tour.id and p.position is distinct from p_tour.confirmed_preference_position),'[]'::jsonb)
  );
$$;
revoke all on function private.rental_prospect_tour_snapshot(public.rental_tour_requests) from public,anon,authenticated,service_role;

create function public.manage_rental_prospect_tour(
  p_session text,p_reference text,p_action text default 'read',
  p_expected_version integer default null,p_operation uuid default null,p_preferences jsonb default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_tour public.rental_tour_requests%rowtype;
  v_previous private.idempotency_records%rowtype;
  v_scope text;
  v_hash text;
  v_event text;
  v_message text;
  v_correlation uuid:=gen_random_uuid();
  v_result jsonb;
  v_raw text;
  v_local timestamp;
  v_start timestamptz;
  v_starts timestamptz[]:='{}';
  v_local_times timestamp[]:='{}';
  v_positions smallint[];
begin
  if p_session is null or p_session !~ '^[0-9a-f]{64}$'
    or p_reference is null or p_reference !~ '^TOUR-[0-9A-F]{12}$' then return null; end if;
  if p_action is null or p_action not in ('read','cancel','reschedule') then
    raise exception using errcode='22023',message='INVALID_TOUR_CHANGE';
  end if;

  if p_action='read' then
    select t.* into v_tour from private.rental_prospect_access a
    join public.rental_tour_requests t on t.id=a.case_id and t.organization_id=a.organization_id
    where a.case_kind='tour' and a.session_hash=encode(sha256(convert_to(p_session,'UTF8')),'hex')
      and a.session_expires_at>now() and t.public_reference=p_reference and t.verified_at is not null;
    return case when found then private.rental_prospect_tour_snapshot(v_tour) end;
  end if;

  select t.* into v_tour from private.rental_prospect_access a
  join public.rental_tour_requests t on t.id=a.case_id and t.organization_id=a.organization_id
  where a.case_kind='tour' and a.session_hash=encode(sha256(convert_to(p_session,'UTF8')),'hex')
    and a.session_expires_at>now() and t.public_reference=p_reference and t.verified_at is not null
  for update of t;
  if not found then return null; end if;
  if p_expected_version is null or p_expected_version<1 or p_operation is null
    or (p_action='cancel' and p_preferences is not null) then
    raise exception using errcode='22023',message='INVALID_TOUR_CHANGE';
  end if;
  v_scope:='tour-renter:'||v_tour.id::text;
  v_hash:=encode(sha256(convert_to(jsonb_build_array(p_action,p_expected_version,p_preferences)::text,'UTF8')),'hex');
  select * into v_previous from private.idempotency_records
  where organization_id=v_tour.organization_id and actor_scope=v_scope
    and route='ManageRentalProspectTour' and idempotency_key=p_operation::text;
  if found then
    if v_previous.request_hash<>v_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    return v_previous.response_body;
  end if;
  if v_tour.version<>p_expected_version then
    raise exception using errcode='40001',message='TOUR_VERSION_CONFLICT';
  end if;
  if v_tour.status not in ('requested','confirmed') or v_tour.cancelled_at is not null
    or (v_tour.confirmed_start_at is not null and v_tour.confirmed_start_at<=now()) then
    raise exception using errcode='23514',message='TOUR_CHANGE_UNAVAILABLE';
  end if;

  if p_action='cancel' then
    update public.rental_tour_requests set cancelled_at=now(),version=version+1,updated_at=now()
    where id=v_tour.id returning * into v_tour;
    v_event:='rental_tour.cancelled';
    v_message:='I canceled this tour.';
  else
    if v_tour.renter_preferences_updated_at>now()-interval '2 minutes' then
      raise exception using errcode='23514',message='TOUR_CHANGE_WAIT';
    end if;
    if not exists(select 1 from public.rental_listings l where l.id=v_tour.listing_id
        and l.organization_id=v_tour.organization_id and l.status='published') then
      raise exception using errcode='23514',message='TOUR_RESCHEDULE_UNAVAILABLE';
    end if;
    if jsonb_typeof(p_preferences) is distinct from 'array'
      or jsonb_array_length(p_preferences) not between 1 and (case when v_tour.confirmed_start_at is null then 3 else 2 end) then
      raise exception using errcode='22023',message='INVALID_TOUR_PREFERENCES';
    end if;
    for v_raw in select jsonb_array_elements_text(p_preferences) loop
      if v_raw is null or v_raw !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$' then
        raise exception using errcode='22023',message='INVALID_TOUR_PREFERENCE';
      end if;
      v_local:=v_raw::timestamp;
      v_start:=v_local at time zone v_tour.property_time_zone;
      if (v_start at time zone v_tour.property_time_zone)<>v_local or v_start<=now()
        or v_start>now()+interval '60 days' or v_start=v_tour.confirmed_start_at or v_start=any(v_starts) then
        raise exception using errcode='22023',message='INVALID_TOUR_LOCAL_TIME';
      end if;
      v_starts:=array_append(v_starts,v_start);
      v_local_times:=array_append(v_local_times,v_local);
    end loop;
    select array_agg(position::smallint order by position) into v_positions from generate_series(0,2) as slots(position)
    where position is distinct from v_tour.confirmed_preference_position;

    delete from public.rental_tour_preferences p where p.organization_id=v_tour.organization_id
      and p.tour_request_id=v_tour.id and p.position is distinct from v_tour.confirmed_preference_position;
    insert into public.rental_tour_preferences(organization_id,tour_request_id,position,local_start,starts_at,ends_at)
    select v_tour.organization_id,v_tour.id,v_positions[i],v_local_times[i],v_starts[i],v_starts[i]+interval '30 minutes'
    from generate_subscripts(v_starts,1) as slots(i);
    update public.rental_tour_requests set renter_preferences_updated_at=now(),renter_change_pending=true,
      version=version+1,updated_at=now()
    where id=v_tour.id returning * into v_tour;
    v_event:='rental_tour.change_requested';
    v_message:='I proposed new tour times. Please review the updated choices.';
  end if;

  perform private.append_rental_prospect_message(v_tour.organization_id,'tour',v_tour.id,'renter',v_message,p_operation);
  insert into audit.audit_events(organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values(v_tour.organization_id,'system',v_event,'rental_tour',v_tour.id,v_correlation,
    jsonb_build_object('unitId',v_tour.unit_id,'source','verified_renter'));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values(v_tour.organization_id,v_event,'rental_tour',v_tour.id,v_correlation,
    jsonb_build_object('unitId',v_tour.unit_id,'source','verified_renter'));
  insert into private.notification_jobs(organization_id,template_code,locale,channel,recipient_user_id,payload,idempotency_key)
  select v_tour.organization_id,'message_rental_tour_reply',o.locale,'email',o.user_id,
    jsonb_build_object('unitId',v_tour.unit_id,'tourReference',v_tour.public_reference),
    'renter-tour-update:'||v_correlation::text
  from private.rental_notification_operator(v_tour.organization_id,v_tour.property_id,v_tour.listing_id) o;
  v_result:=private.rental_prospect_tour_snapshot(v_tour);
  insert into private.idempotency_records(organization_id,actor_scope,route,idempotency_key,request_hash,
    state,response_status,response_body,resource_type,resource_id,completed_at,expires_at)
  values(v_tour.organization_id,v_scope,'ManageRentalProspectTour',p_operation::text,v_hash,'completed',200,
    v_result,'rental_tour',v_tour.id,now(),'infinity'::timestamptz);
  return v_result;
end; $$;
revoke all on function public.manage_rental_prospect_tour(text,text,text,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.manage_rental_prospect_tour(text,text,text,integer,uuid,jsonb) to service_role;

commit;
