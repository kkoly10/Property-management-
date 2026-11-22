begin;

create table private.tenancy_move_in (
  organization_id uuid not null,
  tenancy_id uuid primary key,
  version integer not null check (version>0),
  state text not null check (state in ('planned','no_show','handed_over')),
  planned_on date,
  handed_over_on date,
  keys_transferred integer check (keys_transferred between 0 and 100),
  condition_reference text check (length(condition_reference) between 1 and 240),
  check ((state='handed_over')=(handed_over_on is not null and keys_transferred is not null and condition_reference is not null)),
  check (state='handed_over' or planned_on is not null),
  foreign key (organization_id,tenancy_id) references public.tenancies(organization_id,id)
);

create table private.tenancy_move_in_events (
  tenancy_id uuid not null references private.tenancy_move_in(tenancy_id),
  version integer not null,
  operation_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  request_digest text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  action text not null check (action in ('plan','no_show','handover')),
  event_on date not null,
  receipt jsonb not null,
  primary key (tenancy_id,version),
  unique (tenancy_id,operation_id)
);
alter table private.tenancy_move_in enable row level security;
alter table private.tenancy_move_in_events enable row level security;
revoke all on table private.tenancy_move_in,private.tenancy_move_in_events from public,anon,authenticated,service_role;

create function public.get_tenancy_move_in(p_organization_id uuid,p_tenancy_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_tenancy public.tenancies%rowtype;
  v_property public.properties%rowtype;
  v_state private.tenancy_move_in%rowtype;
begin
  perform private.enter_organization_context(p_organization_id);
  select * into v_tenancy from public.tenancies t where t.id=p_tenancy_id and t.organization_id=p_organization_id
    and (private.has_property_access(t.property_id,'lease.read') or private.has_property_access(t.property_id,'lease.manage'));
  if not found then raise exception using errcode='P0002',message='MOVE_IN_TENANCY_NOT_FOUND'; end if;
  select * into strict v_property from public.properties p where p.id=v_tenancy.property_id and p.organization_id=p_organization_id;
  select * into v_state from private.tenancy_move_in m where m.tenancy_id=p_tenancy_id and m.organization_id=p_organization_id;
  return jsonb_build_object(
    'tenancyId',p_tenancy_id,'status',v_tenancy.status,'localToday',(now() at time zone v_property.time_zone)::date,
    'startOn',v_tenancy.possession_start,'endOn',v_tenancy.possession_end,'canManage',private.has_property_access(v_tenancy.property_id,'lease.manage'),
    'version',coalesce(v_state.version,0),'state',coalesce(v_state.state,'unplanned'),'plannedOn',v_state.planned_on,
    'handedOverOn',v_state.handed_over_on,'keysTransferred',v_state.keys_transferred,'conditionReference',v_state.condition_reference,
    'events',(
      select coalesce(jsonb_agg(jsonb_build_object('action',e.action,'date',e.event_on,'version',e.version)
        order by e.version desc),'[]'::jsonb)
      from (
        select m.action,m.event_on,m.version from private.tenancy_move_in_events m
        where m.tenancy_id=p_tenancy_id order by m.version desc limit 25
      ) e
    )
  );
end
$$;
revoke all on function public.get_tenancy_move_in(uuid,uuid) from public,anon,service_role;
grant execute on function public.get_tenancy_move_in(uuid,uuid) to authenticated;

create function public.record_tenancy_move_in(
  p_organization_id uuid,p_tenancy_id uuid,p_expected_version integer,p_operation_id uuid,
  p_action text,p_event_on date,p_keys_transferred integer,p_condition_reference text,p_keep_financial_dates boolean
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_tenancy public.tenancies%rowtype;
  v_state private.tenancy_move_in%rowtype;
  v_existing private.tenancy_move_in_events%rowtype;
  v_today date;
  v_reference text := nullif(trim(p_condition_reference),'');
  v_digest text;
  v_version integer;
  v_next_state text;
  v_receipt jsonb;
begin
  perform private.enter_organization_context(p_organization_id);
  if p_expected_version is null or p_expected_version<0 or p_operation_id is null or p_event_on is null
    or p_action is null or p_action not in ('plan','no_show','handover')
    or (p_action='handover' and (p_keys_transferred is null or p_keys_transferred not between 0 and 100
      or v_reference is null or length(v_reference)>240 or p_keep_financial_dates is distinct from true))
    or (p_action<>'handover' and (p_keys_transferred is not null or p_condition_reference is not null or p_keep_financial_dates is distinct from false))
    then raise exception using errcode='22023',message='MOVE_IN_INVALID_INPUT'; end if;

  select * into v_tenancy from public.tenancies t where t.id=p_tenancy_id and t.organization_id=p_organization_id
    and private.has_property_access(t.property_id,'lease.manage');
  if not found then raise exception using errcode='42501',message='MOVE_IN_ACCESS_DENIED'; end if;
  perform 1 from public.units u where u.id=v_tenancy.unit_id and u.organization_id=p_organization_id for no key update;
  select * into strict v_tenancy from public.tenancies t where t.id=p_tenancy_id and t.organization_id=p_organization_id for no key update;
  if not private.has_property_access(v_tenancy.property_id,'lease.manage') then raise exception using errcode='42501',message='MOVE_IN_ACCESS_DENIED'; end if;
  v_digest := encode(sha256(convert_to(jsonb_build_array(p_expected_version,p_action,p_event_on,p_keys_transferred,v_reference,p_keep_financial_dates)::text,'UTF8')),'hex');
  select * into v_existing from private.tenancy_move_in_events e where e.tenancy_id=p_tenancy_id and e.operation_id=p_operation_id;
  if found then
    if v_existing.actor_user_id is distinct from v_actor or v_existing.request_digest is distinct from v_digest then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    return v_existing.receipt;
  end if;

  select * into v_state from private.tenancy_move_in m where m.tenancy_id=p_tenancy_id and m.organization_id=p_organization_id;
  if coalesce(v_state.version,0)<>p_expected_version then raise exception using errcode='23505',message='MOVE_IN_VERSION_CONFLICT'; end if;
  if v_state.state='handed_over'
    or (p_action in ('plan','no_show') and v_tenancy.status<>'scheduled')
    or (p_action='handover' and v_tenancy.status not in ('scheduled','active'))
    then raise exception using errcode='23514',message='MOVE_IN_ACTION_UNAVAILABLE'; end if;
  select (clock_timestamp() at time zone p.time_zone)::date into strict v_today
    from public.properties p where p.id=v_tenancy.property_id and p.organization_id=p_organization_id;
  if p_event_on<v_tenancy.possession_start or (v_tenancy.possession_end is not null and p_event_on>v_tenancy.possession_end)
    or (p_action='plan' and p_event_on<v_today)
    or (p_action<>'plan' and p_event_on>v_today)
    then raise exception using errcode='23514',message='MOVE_IN_INVALID_DATE'; end if;
  if p_action='no_show' and (v_state.state is distinct from 'planned' or p_event_on<>v_state.planned_on) then
    raise exception using errcode='23514',message='MOVE_IN_NO_APPOINTMENT';
  end if;
  if p_action='handover' and (
    private.unit_handback_blocks_start(p_organization_id,v_tenancy.unit_id,p_event_on)
    or exists (
      select 1 from public.tenancies t where t.organization_id=p_organization_id and t.unit_id=v_tenancy.unit_id
        and t.id<>p_tenancy_id and t.status in ('active','notice_given','move_out_in_progress')
    )
  ) then raise exception using errcode='23514',message='MOVE_IN_POSSESSION_UNAVAILABLE'; end if;

  v_version:=p_expected_version+1;
  v_next_state:=case p_action when 'plan' then 'planned' when 'no_show' then 'no_show' else 'handed_over' end;
  insert into private.tenancy_move_in(organization_id,tenancy_id,version,state,planned_on,handed_over_on,keys_transferred,condition_reference)
    values(p_organization_id,p_tenancy_id,v_version,v_next_state,case when p_action='plan' then p_event_on else v_state.planned_on end,
      case when p_action='handover' then p_event_on else null end,p_keys_transferred,v_reference)
    on conflict (tenancy_id) do update set version=excluded.version,state=excluded.state,planned_on=excluded.planned_on,
      handed_over_on=excluded.handed_over_on,keys_transferred=excluded.keys_transferred,condition_reference=excluded.condition_reference;
  v_receipt:=jsonb_build_object('tenancyId',p_tenancy_id,'version',v_version,'state',v_next_state);
  insert into private.tenancy_move_in_events(tenancy_id,version,operation_id,actor_user_id,request_digest,action,event_on,receipt)
    values(p_tenancy_id,v_version,p_operation_id,v_actor,v_digest,p_action,p_event_on,v_receipt);
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values(p_organization_id,v_actor,'user','tenancy.move_in_'||p_action,'tenancy',p_tenancy_id,p_operation_id,
      jsonb_build_object('version',v_version,'date',p_event_on,'financialDatesAcknowledged',p_keep_financial_dates));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values(p_organization_id,'tenancy.move_in_'||p_action,'tenancy',p_tenancy_id,p_operation_id,
      jsonb_build_object('tenancyId',p_tenancy_id,'date',p_event_on,'version',v_version));
  return v_receipt;
end
$$;
revoke all on function public.record_tenancy_move_in(uuid,uuid,integer,uuid,text,date,integer,text,boolean) from public,anon,service_role;
grant execute on function public.record_tenancy_move_in(uuid,uuid,integer,uuid,text,date,integer,text,boolean) to authenticated;


create function private.scheduled_tenancy_source_available(p_organization_id uuid,p_tenancy_id uuid,p_pinned_version_id uuid)
returns boolean
language sql stable set search_path=''
as $$
  select exists (
    select 1 from public.documents d join public.document_versions dv
      on dv.document_id=d.id and dv.organization_id=d.organization_id
    where d.tenancy_id=p_tenancy_id and d.organization_id=p_organization_id and d.status='active'
      and d.document_type in ('lease','signed_lease') and dv.upload_status='clean' and dv.storage_bucket='private-documents'
      and (p_pinned_version_id is null or dv.id=p_pinned_version_id)
  );
$$;
revoke all on function private.scheduled_tenancy_source_available(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Existing due starts remain compatible. A recorded plan or no-show holds this exact scheduled tenancy.
create or replace function public.start_due_homeowner_tenancies(p_at timestamptz,p_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_candidate record; v_started integer:=0; v_examined integer:=0; v_correlation uuid;
begin
  if p_at is null or p_limit is null or p_limit not between 1 and 500 then
    raise exception using errcode='22023',message='INVALID_START_BATCH';
  end if;
  for v_candidate in
    select t.id,t.organization_id,t.unit_id,t.possession_start,p.time_zone
    from public.tenancies t
    join public.leases l on l.id=t.lease_id and l.organization_id=t.organization_id
    join public.properties p on p.id=t.property_id and p.organization_id=t.organization_id
    join public.units u on u.id=t.unit_id and u.organization_id=t.organization_id
    join public.accounting_books b on b.id=p.accounting_book_id and b.organization_id=t.organization_id
    join pg_timezone_names tz on tz.name=p.time_zone
    where t.status='scheduled' and l.status='active'
      and not exists (
        select 1 from private.tenancy_move_in m where m.tenancy_id=t.id and m.state in ('planned','no_show')
      )
      and t.possession_start<=(p_at at time zone tz.name)::date
      and (t.possession_end is null or t.possession_end>=(p_at at time zone tz.name)::date)
      and u.operational_status='active' and u.archived_at is null and p.archived_at is null
      and p.status<>'archived' and b.status='open'
      and private.scheduled_tenancy_source_available(t.organization_id,t.id,l.signed_document_version_id)
      and not exists (
        select 1 from public.tenancies current_possession
        where current_possession.unit_id=t.unit_id
          and current_possession.status in ('active','notice_given','move_out_in_progress')
      )
      and not private.unit_handback_blocks_start(t.organization_id,t.unit_id,(p_at at time zone tz.name)::date)
    order by t.possession_start,t.unit_id,t.id limit p_limit
  loop
    v_examined:=v_examined+1;
    perform 1 from public.units u where u.id=v_candidate.unit_id
      and u.organization_id=v_candidate.organization_id and u.operational_status='active' and u.archived_at is null
      for update skip locked;
    if not found then continue; end if;
    v_correlation:=gen_random_uuid();
    update public.tenancies t set status='active',updated_at=now()
      where t.id=v_candidate.id and t.status='scheduled'
        and not exists (
          select 1 from private.tenancy_move_in m where m.tenancy_id=t.id and m.state in ('planned','no_show')
        )
        and t.possession_start<=(p_at at time zone v_candidate.time_zone)::date
        and (t.possession_end is null or t.possession_end>=(p_at at time zone v_candidate.time_zone)::date)
        and not exists (
          select 1 from public.tenancies current_possession where current_possession.unit_id=t.unit_id
            and current_possession.status in ('active','notice_given','move_out_in_progress')
        )
        and not private.unit_handback_blocks_start(t.organization_id,t.unit_id,(p_at at time zone v_candidate.time_zone)::date)
        and exists (
          select 1 from public.leases l where l.id=t.lease_id and l.organization_id=t.organization_id and l.status='active'
            and private.scheduled_tenancy_source_available(t.organization_id,t.id,l.signed_document_version_id)
        );
    if not found then continue; end if;
    v_started:=v_started+1;
    insert into audit.audit_events(organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
      values(v_candidate.organization_id,'system','tenancy.started','tenancy',v_candidate.id,v_correlation,
        jsonb_build_object('possessionStart',v_candidate.possession_start,'evaluatedAt',p_at,'timeZone',v_candidate.time_zone));
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
      values(v_candidate.organization_id,'tenancy.started','tenancy',v_candidate.id,v_correlation,
        jsonb_build_object('tenancyId',v_candidate.id,'possessionStart',v_candidate.possession_start));
  end loop;
  return jsonb_build_object('started',v_started,'limitReached',v_examined=p_limit,'evaluatedAt',p_at);
end;
$$;

commit;
