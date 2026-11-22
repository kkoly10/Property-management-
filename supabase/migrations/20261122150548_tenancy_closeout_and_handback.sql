begin;

create table private.tenancy_closeouts (
  tenancy_id uuid primary key,
  organization_id uuid not null,
  state text not null check (state in ('planned','canceled','returned')),
  planned_return_on date,
  returned_on date,
  version integer not null check (version>0),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  foreign key (organization_id,tenancy_id) references public.tenancies(organization_id,id) on delete restrict,
  check ((state='returned')=(returned_on is not null)),
  check (state<>'planned' or planned_return_on is not null),
  check (state<>'canceled' or planned_return_on is null)
);
alter table private.tenancy_closeouts enable row level security;
revoke all on private.tenancy_closeouts from public,anon,authenticated,service_role;

create index tenancies_org_unit_idx on public.tenancies(organization_id,unit_id);

create function private.unit_handback_blocks_start(
  p_organization_id uuid,p_unit_id uuid,p_day date
) returns boolean language sql stable set search_path='' as $$
  select exists (
    select 1
    from public.tenancies t join private.tenancy_closeouts c
      on c.organization_id=t.organization_id and c.tenancy_id=t.id
    where t.organization_id=p_organization_id and t.unit_id=p_unit_id
      and c.returned_on>=p_day
  )
$$;
revoke all on function private.unit_handback_blocks_start(uuid,uuid,date) from public,anon,authenticated,service_role;

-- The earlier INSERT trigger normalizes status and locks the same unit first.
-- A current occupancy recorded through an import or manual setup must also
-- respect any already recorded prior possession at that location.
create function private.guard_recorded_tenancy_handback()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('active','notice_given','move_out_in_progress') and exists (
    select 1
    from public.tenancies prior join private.tenancy_closeouts c
      on c.organization_id=prior.organization_id and c.tenancy_id=prior.id
    where prior.organization_id=new.organization_id and prior.unit_id=new.unit_id
      and c.returned_on is not null
      and daterange(prior.possession_start,c.returned_on,'[]')
        && daterange(new.possession_start,new.possession_end,'[]')
  ) then
    raise exception using errcode='23P01',message='TENANCY_HANDBACK_OVERLAP';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_recorded_tenancy_handback() from public,anon,authenticated,service_role;
create trigger guard_recorded_tenancy_handback_before_insert
  before insert on public.tenancies for each row execute function private.guard_recorded_tenancy_handback();

create function public.get_tenancy_closeout(p_organization_id uuid,p_tenancy_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_tenancy public.tenancies%rowtype;
  v_closeout private.tenancy_closeouts%rowtype;
  v_lease public.leases%rowtype;
  v_property public.properties%rowtype;
  v_account public.receivable_accounts%rowtype;
  v_summary jsonb;
  v_can_manage boolean;
begin
  select t.* into v_tenancy from public.tenancies t
  where t.organization_id=p_organization_id and t.id=p_tenancy_id
    and (private.has_property_access(t.property_id,'lease.manage') or private.has_property_access(t.property_id,'lease.read'));
  if not found then raise exception using errcode='P0002',message='CLOSEOUT_TENANCY_NOT_FOUND'; end if;
  v_can_manage:=private.has_property_access(v_tenancy.property_id,'lease.manage');
  select * into strict v_lease from public.leases l
    where l.organization_id=p_organization_id and l.id=v_tenancy.lease_id;
  select * into strict v_property from public.properties p
    where p.organization_id=p_organization_id and p.id=v_tenancy.property_id;
  select * into v_closeout from private.tenancy_closeouts c
    where c.organization_id=p_organization_id and c.tenancy_id=p_tenancy_id;

  if private.has_property_access(v_property.id,'finance.read') or private.has_property_access(v_property.id,'finance.manage') then
    select * into strict v_account from public.receivable_accounts a
      where a.organization_id=p_organization_id and a.id=v_tenancy.receivable_account_id;
    v_summary:=jsonb_build_object(
      'currency',v_account.currency_code,
      'balanceMinor',(select coalesce(sum(j.debit_minor-j.credit_minor),0)::text
        from public.journal_entries j join public.ledger_accounts a
          on a.organization_id=j.organization_id and a.accounting_book_id=j.accounting_book_id
          and a.id=j.ledger_account_id and a.account_code='1100'
        where j.organization_id=p_organization_id and j.accounting_book_id=v_account.accounting_book_id
          and j.receivable_account_id=v_account.id),
      'openCharges',(select count(*) from public.charges c
        where c.organization_id=p_organization_id and c.tenancy_id=p_tenancy_id
          and c.receivable_account_id=v_account.id and c.status in ('open','partially_paid')),
      'unsettledPayments',(select count(*) from public.payments p
        where p.organization_id=p_organization_id and p.tenancy_id=p_tenancy_id
          and p.receivable_account_id=v_account.id and p.status in ('created','pending','disputed'))
    );
  end if;

  return jsonb_build_object('tenancyId',p_tenancy_id,'propertyId',v_property.id,'propertyName',v_property.name,
    'householdName',(select h.display_name from public.households h
      where h.organization_id=p_organization_id and h.id=v_tenancy.household_id),
    'unitCode',(select u.unit_code from public.units u
      where u.organization_id=p_organization_id and u.id=v_tenancy.unit_id),
    'tenancyStatus',v_tenancy.status,'leaseStart',v_lease.start_date,'leaseEnd',v_lease.end_date,'canManage',v_can_manage,
    'possessionStart',v_tenancy.possession_start,'localToday',(now() at time zone v_property.time_zone)::date,
    'state',coalesce(v_closeout.state,'open'),'version',coalesce(v_closeout.version,0),
    'plannedReturnOn',v_closeout.planned_return_on,'returnedOn',v_closeout.returned_on,'accounting',v_summary);
end;
$$;

create function public.transition_tenancy_closeout(
  p_organization_id uuid,p_tenancy_id uuid,p_action text,p_expected_version integer,
  p_effective_on date,p_return_confirmed boolean,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_actor_scope text;
  v_tenancy public.tenancies%rowtype;
  v_closeout private.tenancy_closeouts%rowtype;
  v_previous private.idempotency_records%rowtype;
  v_today date;
  v_time_zone text;
  v_hash text;
  v_response jsonb;
  v_before jsonb;
  v_state text;
  v_event text;
  v_correlation uuid:=gen_random_uuid();
begin
  if v_actor is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_action is null or p_action not in ('plan','cancel','record_return')
    or p_expected_version is null or p_expected_version<0 or p_idempotency_key is null
    or (p_action='cancel')<>(p_effective_on is null)
    or (p_action='record_return')<>coalesce(p_return_confirmed,false)
    or (p_effective_on is not null and not isfinite(p_effective_on))
  then raise exception using errcode='22023',message='INVALID_CLOSEOUT_ACTION'; end if;

  select t.* into v_tenancy from public.tenancies t
  where t.organization_id=p_organization_id and t.id=p_tenancy_id
    and private.has_property_access(t.property_id,'lease.manage');
  if not found then raise exception using errcode='P0002',message='CLOSEOUT_TENANCY_NOT_FOUND'; end if;

  v_actor_scope:='user:'||v_actor::text;
  v_hash:=encode(sha256(convert_to(jsonb_build_array(p_tenancy_id,p_action,p_expected_version,p_effective_on,
    coalesce(p_return_confirmed,false))::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_organization_id,v_actor_scope,
    'TransitionTenancyCloseout',p_idempotency_key),0));
  if not private.has_property_access(v_tenancy.property_id,'lease.manage') then
    raise exception using errcode='P0002',message='CLOSEOUT_TENANCY_NOT_FOUND';
  end if;
  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_scope=v_actor_scope
    and r.route='TransitionTenancyCloseout' and r.idempotency_key=p_idempotency_key::text;
  if found then
    if v_previous.request_hash<>v_hash or v_previous.state<>'completed' then
      raise exception using errcode='23505',message='CLOSEOUT_IDEMPOTENCY_CONFLICT';
    end if;
    return v_previous.response_body;
  end if;

  -- Serialize with reservation writes and starts, while allowing the charge
  -- worker's foreign-key checks to finish if it already holds a schedule lock.
  select p.time_zone into strict v_time_zone
    from public.units u join public.properties p
      on p.organization_id=u.organization_id and p.id=u.property_id
    where u.organization_id=p_organization_id and u.id=v_tenancy.unit_id for no key update of u;
  select * into strict v_tenancy from public.tenancies t
    where t.organization_id=p_organization_id and t.id=p_tenancy_id
      and private.has_property_access(t.property_id,'lease.manage') for no key update;
  v_today:=(clock_timestamp() at time zone v_time_zone)::date;
  select * into v_closeout from private.tenancy_closeouts c
    where c.organization_id=p_organization_id and c.tenancy_id=p_tenancy_id for update;

  if coalesce(v_closeout.version,0)<>p_expected_version then
    raise exception using errcode='23505',message='CLOSEOUT_VERSION_CONFLICT';
  end if;
  if v_tenancy.status not in ('active','notice_given','move_out_in_progress') or v_closeout.state='returned'
    or (p_action='cancel' and v_closeout.state is distinct from 'planned') then
    raise exception using errcode='23514',message='CLOSEOUT_TRANSITION_UNAVAILABLE';
  end if;
  if p_effective_on<v_tenancy.possession_start or (p_action='plan' and p_effective_on<v_today)
    or (p_action='record_return' and p_effective_on>v_today) then
    raise exception using errcode='22023',message='CLOSEOUT_DATE_OUT_OF_RANGE';
  end if;

  v_before:=jsonb_build_object('state',coalesce(v_closeout.state,'open'),'version',p_expected_version,
    'plannedReturnOn',v_closeout.planned_return_on,'returnedOn',v_closeout.returned_on);
  v_state:=case p_action when 'plan' then 'planned' when 'cancel' then 'canceled' else 'returned' end;

  if p_action='record_return' then
    -- Preserve schedule terms and any posted charges. Stop future automation
    -- under the same schedule locks the recurring charge worker uses.
    perform 1 from public.charge_schedules s
      where s.organization_id=p_organization_id and s.tenancy_id=p_tenancy_id order by s.id for update;
    update public.charge_schedules set status='ended',next_run_on=null,updated_at=now()
      where organization_id=p_organization_id and tenancy_id=p_tenancy_id and status<>'ended';
    update public.tenancies set status='closed',updated_at=now() where id=p_tenancy_id;
  end if;

  insert into private.tenancy_closeouts(organization_id,tenancy_id,state,planned_return_on,returned_on,version,updated_by)
  values(p_organization_id,p_tenancy_id,v_state,
    case p_action when 'plan' then p_effective_on when 'record_return' then v_closeout.planned_return_on end,
    case when p_action='record_return' then p_effective_on end,p_expected_version+1,v_actor)
  on conflict (tenancy_id) do update set state=excluded.state,planned_return_on=excluded.planned_return_on,
    returned_on=excluded.returned_on,version=excluded.version,updated_by=excluded.updated_by,updated_at=now()
  returning * into v_closeout;

  v_response:=jsonb_build_object('tenancyId',p_tenancy_id,'state',v_closeout.state,'version',v_closeout.version,
    'plannedReturnOn',v_closeout.planned_return_on,'returnedOn',v_closeout.returned_on);
  v_event:=case p_action when 'plan' then 'tenancy.closeout_planned' when 'cancel' then 'tenancy.closeout_canceled'
    else 'tenancy.possession_returned' end;
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,
    correlation_id,before_data,after_data)
    values(p_organization_id,v_actor,'user',v_event,'tenancy',p_tenancy_id,v_correlation,v_before,v_response);
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values(p_organization_id,v_event,'tenancy',p_tenancy_id,v_correlation,v_response);
  insert into private.idempotency_records(organization_id,actor_user_id,actor_scope,route,idempotency_key,request_hash,
    response_status,response_body,resource_type,resource_id,state,completed_at,expires_at)
    values(p_organization_id,v_actor,v_actor_scope,'TransitionTenancyCloseout',p_idempotency_key::text,v_hash,
      200,v_response,'tenancy',p_tenancy_id,'completed',now(),'infinity'::timestamptz);
  return v_response;
end;
$$;

revoke all on function public.get_tenancy_closeout(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.transition_tenancy_closeout(uuid,uuid,text,integer,date,boolean,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_tenancy_closeout(uuid,uuid) to authenticated;
grant execute on function public.transition_tenancy_closeout(uuid,uuid,text,integer,date,boolean,uuid) to authenticated;

-- Keep the scheduler RPC contract. The worker starts a due reservation only if
-- possession is available when checked under the unit lock.
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
      and t.possession_start<=(p_at at time zone tz.name)::date
      and (t.possession_end is null or t.possession_end>=(p_at at time zone tz.name)::date)
      and u.operational_status='active' and u.archived_at is null and p.archived_at is null
      and p.status<>'archived' and b.status='open'
      and (
        l.signed_document_version_id is not null
        or exists (
          select 1 from public.documents d join public.document_versions dv
            on dv.document_id=d.id and dv.organization_id=d.organization_id
          where d.tenancy_id=t.id and d.organization_id=t.organization_id
            and d.status='active' and d.document_type in ('lease','signed_lease') and dv.upload_status='clean'
        )
      )
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
        and t.possession_start<=(p_at at time zone v_candidate.time_zone)::date
        and (t.possession_end is null or t.possession_end>=(p_at at time zone v_candidate.time_zone)::date)
        and not exists (
          select 1 from public.tenancies current_possession where current_possession.unit_id=t.unit_id
            and current_possession.status in ('active','notice_given','move_out_in_progress')
        )
        and not private.unit_handback_blocks_start(t.organization_id,t.unit_id,(p_at at time zone v_candidate.time_zone)::date);
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
