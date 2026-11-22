begin;

-- A future signed term reserves contiguous possession on the existing
-- tenancy. Activation may extend the existing contractual rent cadence;
-- it never creates a new resident, tenancy, balance, or journal.
create table private.tenancy_renewals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  tenancy_id uuid not null,
  prior_lease_id uuid not null,
  lease_id uuid,
  document_id uuid not null,
  document_version_id uuid not null,
  prior_schedule_id uuid not null,
  start_on date not null,
  end_on date not null check (end_on>=start_on),
  first_charge_on date,
  state text not null default 'scheduled' check (state in ('scheduled','effective','canceled')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  effective_at timestamptz,
  canceled_at timestamptz,
  foreign key (organization_id,tenancy_id) references public.tenancies(organization_id,id) on delete restrict,
  foreign key (organization_id,prior_lease_id) references public.leases(organization_id,id) on delete restrict,
  foreign key (organization_id,lease_id) references public.leases(organization_id,id) on delete restrict,
  foreign key (organization_id,document_id) references public.documents(organization_id,id) on delete restrict,
  foreign key (organization_id,document_version_id) references public.document_versions(organization_id,id) on delete restrict,
  foreign key (organization_id,prior_schedule_id) references public.charge_schedules(organization_id,id) on delete restrict,
  check (first_charge_on is null or first_charge_on between start_on and end_on),
  check ((state='effective')=(lease_id is not null and effective_at is not null)),
  check ((state='canceled')=(canceled_at is not null))
);
create unique index tenancy_one_scheduled_renewal on private.tenancy_renewals(tenancy_id) where state='scheduled';
create unique index tenancy_renewal_document_claim on private.tenancy_renewals(document_id) where state<>'canceled';
create index tenancy_renewal_history on private.tenancy_renewals(organization_id,tenancy_id,start_on desc);
create index tenancy_renewal_prior_lease on private.tenancy_renewals(prior_lease_id) where state='effective';
alter table private.tenancy_renewals enable row level security;
revoke all on private.tenancy_renewals from public,anon,authenticated,service_role;

-- Existing lease RLS anchors to the current lease_id. The home and party
-- remain the same after a renewal, and the prior term keeps that access.
create function private.is_resident_for_prior_renewal_term(p_lease_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.tenancy_renewals r where r.prior_lease_id=p_lease_id and r.state='effective'
    and private.is_resident_for_tenancy(r.tenancy_id))
$$;
revoke all on function private.is_resident_for_prior_renewal_term(uuid) from public,anon,authenticated,service_role;
grant execute on function private.is_resident_for_prior_renewal_term(uuid) to authenticated;
create policy lease_prior_renewal_term_read on public.leases for select to authenticated
  using (private.is_resident_for_prior_renewal_term(id));

-- Only the renewal transition may attach a reserved PDF. It sets the
-- renewal effective in the same transaction, before binding the document.
create function private.guard_reserved_renewal_document()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from private.tenancy_renewals r where r.document_id=new.id
    and (r.state='scheduled' or (r.state='effective' and new.tenancy_id is distinct from r.tenancy_id))) then
    raise exception using errcode='23514',message='RENEWAL_DOCUMENT_RESERVED';
  end if;
  return new;
end
$$;
revoke all on function private.guard_reserved_renewal_document() from public,anon,authenticated,service_role;
create trigger guard_reserved_renewal_document before update of tenancy_id on public.documents
  for each row when (old.tenancy_id is distinct from new.tenancy_id)
  execute function private.guard_reserved_renewal_document();

-- Derive the next occurrence from the original calendar anchor and the
-- existing recurrence helper, including month-end truncation.
create function private.first_renewal_rent_date(p_cadence text,p_anchor date,p_due_day smallint,p_start date)
returns date language plpgsql immutable set search_path='' as $$
declare
  v_step integer;
  v_months integer;
  v_candidate date;
  v_month_start date;
begin
  if p_cadence='custom' then return null; end if;
  if p_anchor>=p_start then return p_anchor; end if;
  if p_cadence in ('weekly','biweekly') then
    v_step:=case when p_cadence='weekly' then 7 else 14 end;
    return p_anchor+((p_start-p_anchor+v_step-1)/v_step)*v_step;
  end if;
  v_step:=case p_cadence when 'monthly' then 1 when 'quarterly' then 3 when 'semiannual' then 6 when 'annual' then 12 end;
  if v_step is null then return null; end if;
  v_months:=((extract(year from p_start)::integer-extract(year from p_anchor)::integer)*12
    +extract(month from p_start)::integer-extract(month from p_anchor)::integer)/v_step*v_step;
  v_month_start:=(date_trunc('month',p_anchor)+make_interval(months=>v_months))::date;
  v_candidate:=v_month_start+(least(coalesce(p_due_day,extract(day from p_anchor)::integer),
    extract(day from (v_month_start+interval '1 month - 1 day'))::integer)-1);
  if v_candidate<p_start then
    return private.next_charge_run_on(p_cadence,v_candidate,p_due_day);
  end if;
  return v_candidate;
end
$$;
revoke all on function private.first_renewal_rent_date(text,date,smallint,date) from public,anon,authenticated,service_role;

create function public.get_tenancy_renewal(p_organization_id uuid,p_tenancy_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_t public.tenancies%rowtype;
  v_l public.leases%rowtype;
  v_p public.properties%rowtype;
  v_schedule public.charge_schedules%rowtype;
  v_manage boolean;
  v_today date;
  v_docs jsonb;
begin
  select * into v_t from public.tenancies t where t.organization_id=p_organization_id and t.id=p_tenancy_id
    and (private.has_property_access(t.property_id,'lease.read') or private.has_property_access(t.property_id,'lease.manage'));
  if not found then raise exception using errcode='P0002',message='RENEWAL_TENANCY_NOT_FOUND'; end if;
  select * into strict v_l from public.leases where id=v_t.lease_id and organization_id=p_organization_id;
  select * into strict v_p from public.properties where id=v_t.property_id and organization_id=p_organization_id;
  select * into v_schedule from public.charge_schedules s where s.organization_id=p_organization_id
    and s.tenancy_id=p_tenancy_id and s.charge_type='rent' and s.ends_on=v_l.end_date
    order by s.created_at desc,s.id limit 1;
  v_today:=(now() at time zone v_p.time_zone)::date;
  v_manage:=private.has_property_access(v_t.property_id,'lease.manage')
    and private.has_property_access(v_t.property_id,'finance.manage')
    and private.has_property_access(v_t.property_id,'documents.manage');
  if v_manage and v_t.status='active' then
    select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'label',d.title||' · version '||v.version_number)
      order by d.title,v.version_number),'[]'::jsonb) into v_docs
    from public.documents d join public.document_versions v on v.document_id=d.id and v.organization_id=d.organization_id
    where d.organization_id=p_organization_id and d.property_id=v_t.property_id
      and (d.unit_id is null or d.unit_id=v_t.unit_id) and d.tenancy_id is null and d.status='active'
      and d.document_type='signed_lease' and v.upload_status='clean' and v.mime_type='application/pdf'
      and v.storage_bucket='private-documents' and v.sha256_hex is not null
      and not exists(select 1 from public.document_versions later where later.document_id=d.id and later.version_number>v.version_number)
      and not exists(select 1 from private.rental_agreement_filings f where f.document_id=d.id)
      and not exists(select 1 from private.tenancy_renewals r where r.document_id=d.id and r.state<>'canceled');
  end if;
  return jsonb_build_object('tenancyId',v_t.id,'tenancyStatus',v_t.status,'householdName',(select h.display_name
      from public.households h where h.organization_id=p_organization_id and h.id=v_t.household_id),
    'propertyName',v_p.name,'currentLeaseId',v_l.id,'currentStart',v_l.start_date,'currentEnd',v_l.end_date,
    'renewalStart',v_l.end_date+1,
    'localToday',v_today,'rentMinor',v_l.rent_amount_minor::text,'currency',v_l.currency_code,'cadence',v_l.rent_frequency,
    'firstContinuingChargeOn',case when v_l.rent_amount_minor>0 then
      private.first_renewal_rent_date(v_schedule.cadence,v_schedule.starts_on,v_schedule.due_day,v_l.end_date+1) end,
    'canManage',v_manage,'canSchedule',coalesce(v_manage and v_t.status='active' and v_l.status='active' and v_l.end_date>=v_today
      and v_schedule.id is not null and v_schedule.due_day is not null and v_schedule.cadence<>'custom'
      and v_schedule.status in ('active','ended')
      and v_t.possession_end=v_l.end_date,false),'documents',coalesce(v_docs,'[]'::jsonb),
    'renewals',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'state',r.state,'startOn',r.start_on,'endOn',r.end_on,
      'priorStart',prior.start_date,'priorEnd',prior.end_date,'firstChargeOn',r.first_charge_on,'effectiveAt',r.effective_at)
      order by r.created_at desc,r.id) from private.tenancy_renewals r
      join public.leases prior on prior.organization_id=r.organization_id and prior.id=r.prior_lease_id
      where r.organization_id=p_organization_id and r.tenancy_id=p_tenancy_id),'[]'::jsonb));
end
$$;

create function public.transition_tenancy_renewal(
  p_organization_id uuid,p_tenancy_id uuid,p_action text,p_operation_key uuid,p_renewal_id uuid,
  p_prior_lease_id uuid,p_end_on date,p_first_charge_on date,p_document_version_id uuid,p_confirmed boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_t public.tenancies%rowtype;
  v_l public.leases%rowtype;
  v_p public.properties%rowtype;
  v_s public.charge_schedules%rowtype;
  v_r private.tenancy_renewals%rowtype;
  v_previous private.idempotency_records%rowtype;
  v_document_id uuid;
  v_version_id uuid;
  v_new_lease uuid;
  v_new_schedule uuid;
  v_today date;
  v_start date;
  v_hash text;
  v_scope text;
  v_event text;
  v_response jsonb;
begin
  if v_actor is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_operation_key is null or p_action is null or p_action not in ('schedule','apply','cancel')
    or (p_action='schedule' and (p_renewal_id is not null or p_prior_lease_id is null or p_end_on is null
      or p_end_on not between date '0001-01-01' and date '9999-12-31'
      or p_document_version_id is null or p_confirmed is distinct from true))
    or (p_action<>'schedule' and (p_renewal_id is null or p_prior_lease_id is not null or p_end_on is not null
      or p_first_charge_on is not null or p_document_version_id is not null or coalesce(p_confirmed,false)))
    or (p_first_charge_on is not null and not isfinite(p_first_charge_on))
  then raise exception using errcode='22023',message='INVALID_RENEWAL_REQUEST'; end if;

  select * into v_t from public.tenancies t where t.organization_id=p_organization_id and t.id=p_tenancy_id
    and private.has_property_access(t.property_id,'lease.manage') and private.has_property_access(t.property_id,'finance.manage')
    and private.has_property_access(t.property_id,'documents.manage');
  if not found then raise exception using errcode='P0002',message='RENEWAL_TENANCY_NOT_FOUND'; end if;
  v_scope:='user:'||v_actor::text;
  v_hash:=encode(sha256(convert_to(jsonb_build_array(p_tenancy_id,p_action,p_renewal_id,p_prior_lease_id,p_end_on,
    p_first_charge_on,p_document_version_id,coalesce(p_confirmed,false))::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_organization_id,v_scope,'TransitionTenancyRenewal',p_operation_key),0));
  if not (private.has_property_access(v_t.property_id,'lease.manage') and private.has_property_access(v_t.property_id,'finance.manage')
    and private.has_property_access(v_t.property_id,'documents.manage')) then
    raise exception using errcode='P0002',message='RENEWAL_TENANCY_NOT_FOUND';
  end if;
  select * into v_previous from private.idempotency_records i where i.organization_id=p_organization_id and i.actor_scope=v_scope
    and i.route='TransitionTenancyRenewal' and i.idempotency_key=p_operation_key::text;
  if found then
    if v_previous.request_hash<>v_hash then raise exception using errcode='23505',message='RENEWAL_RETRY_CONFLICT'; end if;
    return v_previous.response_body;
  end if;

  perform 1 from public.units u where u.organization_id=p_organization_id and u.id=v_t.unit_id for no key update;
  select * into strict v_t from public.tenancies t where t.organization_id=p_organization_id and t.id=p_tenancy_id
    and private.has_property_access(t.property_id,'lease.manage') and private.has_property_access(t.property_id,'finance.manage')
    and private.has_property_access(t.property_id,'documents.manage') for no key update;
  select * into strict v_p from public.properties where id=v_t.property_id and organization_id=p_organization_id;
  select * into strict v_l from public.leases where id=v_t.lease_id and organization_id=p_organization_id;
  v_today:=(clock_timestamp() at time zone v_p.time_zone)::date;

  if p_action='schedule' then
    if v_t.status<>'active' or v_l.status<>'active' or v_l.id<>p_prior_lease_id or v_l.end_date is null
      or v_l.end_date<v_today or v_t.possession_end is distinct from v_l.end_date
      or exists(select 1 from private.tenancy_renewals r where r.tenancy_id=v_t.id and r.state='scheduled') then
      raise exception using errcode='23514',message='RENEWAL_TERM_UNAVAILABLE';
    end if;
    v_start:=v_l.end_date+1;
    if p_end_on<v_start then raise exception using errcode='22023',message='RENEWAL_DATE_INVALID'; end if;
    select * into v_s from public.charge_schedules s where s.organization_id=p_organization_id and s.tenancy_id=p_tenancy_id
      and s.charge_type='rent' and s.ends_on=v_l.end_date and s.amount_minor=v_l.rent_amount_minor
      and s.currency_code=v_l.currency_code and s.cadence=v_l.rent_frequency and s.cadence<>'custom'
      and s.receivable_account_id=v_t.receivable_account_id and s.accounting_book_id=v_p.accounting_book_id
      and s.due_day is not null and s.status in ('active','ended') order by s.created_at desc,s.id limit 1 for no key update;
    if not found or exists(select 1 from public.charge_schedules s where s.tenancy_id=v_t.id and s.charge_type='rent'
      and s.id<>v_s.id and (s.ends_on=v_l.end_date or s.status in ('active','paused','draft'))) then
      raise exception using errcode='23514',message='RENEWAL_RENT_SCHEDULE_UNAVAILABLE';
    end if;
    if v_l.rent_amount_minor=0 then
      if p_first_charge_on is not null then raise exception using errcode='22023',message='RENEWAL_FIRST_CHARGE_INVALID'; end if;
    elsif p_first_charge_on is distinct from private.first_renewal_rent_date(v_s.cadence,v_s.starts_on,v_s.due_day,v_start)
      or p_first_charge_on is null or p_first_charge_on>p_end_on then
      raise exception using errcode='22023',message='RENEWAL_FIRST_CHARGE_INVALID';
    end if;
    v_document_id:=(select dv.document_id from public.document_versions dv
      where dv.organization_id=p_organization_id and dv.id=p_document_version_id);
    v_version_id:=p_document_version_id;
  else
    select * into v_r from private.tenancy_renewals r where r.organization_id=p_organization_id and r.tenancy_id=p_tenancy_id
      and r.id=p_renewal_id for update;
    if not found or v_r.state<>'scheduled' or v_r.prior_lease_id<>v_t.lease_id then
      raise exception using errcode='23514',message='RENEWAL_TERM_UNAVAILABLE';
    end if;
    v_document_id:=v_r.document_id;
    v_version_id:=v_r.document_version_id;
  end if;

  if p_action<>'cancel' then
    -- Respect canonical unit and rent scheduling, without taking a stronger
    -- parent lock than required for concurrent charge FK checks.
    if not exists(select 1 from public.accounting_books b join public.receivable_accounts a
      on a.organization_id=b.organization_id and a.accounting_book_id=b.id
      where b.organization_id=p_organization_id and b.id=v_p.accounting_book_id and b.status='open'
        and a.id=v_t.receivable_account_id and a.status='active' and a.currency_code=v_l.currency_code
        and b.functional_currency_code=v_l.currency_code)
      or v_p.archived_at is not null or v_p.status='archived'
      or not exists(select 1 from public.units u where u.id=v_t.unit_id and u.organization_id=p_organization_id
        and u.operational_status='active' and u.archived_at is null) then
      raise exception using errcode='23514',message='RENEWAL_TENANCY_UNAVAILABLE';
    end if;
    perform 1 from public.documents d join public.document_versions dv on dv.document_id=d.id and dv.organization_id=d.organization_id
      where d.id=v_document_id and d.organization_id=p_organization_id and d.property_id=v_t.property_id
        and (d.unit_id is null or d.unit_id=v_t.unit_id) and d.tenancy_id is null and d.status='active'
        and d.document_type='signed_lease' and dv.id=v_version_id and dv.upload_status='clean' and dv.mime_type='application/pdf'
        and dv.storage_bucket='private-documents'
        and dv.sha256_hex is not null and not exists(select 1 from public.document_versions later
          where later.document_id=d.id and later.version_number>dv.version_number)
        and not exists(select 1 from private.rental_agreement_filings f where f.document_id=d.id)
      for no key update of d,dv;
    if not found then raise exception using errcode='23514',message='RENEWAL_DOCUMENT_NOT_READY'; end if;
  end if;

  if p_action='schedule' then
    -- The W3 exclusion constraint makes this reservation race with other
    -- households under the same unit lock. The old signed term is untouched.
    update public.tenancies set possession_end=p_end_on,updated_at=now() where id=v_t.id;
    insert into private.tenancy_renewals(organization_id,tenancy_id,prior_lease_id,document_id,document_version_id,
      prior_schedule_id,start_on,end_on,first_charge_on,created_by)
    values(p_organization_id,v_t.id,v_l.id,v_document_id,v_version_id,v_s.id,v_start,p_end_on,p_first_charge_on,v_actor)
    returning * into v_r;
  elsif p_action='cancel' then
    if v_t.status<>'closed' then
      update public.tenancies set possession_end=v_l.end_date,updated_at=now() where id=v_t.id and possession_end=v_r.end_on;
    end if;
    update private.tenancy_renewals set state='canceled',canceled_at=now() where id=v_r.id returning * into v_r;
  else
    if v_t.status<>'active' or v_l.status<>'active' or v_t.possession_end is distinct from v_r.end_on
      or v_today<v_r.start_on or v_today>v_r.end_on then
      raise exception using errcode='23514',message='RENEWAL_EFFECTIVE_DATE_UNAVAILABLE';
    end if;
    select * into v_s from public.charge_schedules s where s.id=v_r.prior_schedule_id and s.organization_id=p_organization_id
      and s.tenancy_id=v_t.id and s.ends_on=v_l.end_date and s.amount_minor=v_l.rent_amount_minor
      and s.currency_code=v_l.currency_code and s.cadence=v_l.rent_frequency
      and s.receivable_account_id=v_t.receivable_account_id and s.accounting_book_id=v_p.accounting_book_id
      and s.due_day is not null and s.status in ('active','ended') for no key update;
    if not found or (v_r.first_charge_on is not null and (v_r.first_charge_on<v_today
      or v_r.first_charge_on is distinct from private.first_renewal_rent_date(v_s.cadence,v_s.starts_on,v_s.due_day,v_r.start_on)))
      or exists(select 1 from public.charge_schedules s where s.tenancy_id=v_t.id and s.charge_type='rent'
        and s.id<>v_s.id and (s.ends_on=v_l.end_date or s.status in ('active','paused','draft'))) then
      raise exception using errcode='23514',message='RENEWAL_RENT_SCHEDULE_UNAVAILABLE';
    end if;
    insert into public.leases(organization_id,property_id,unit_id,household_id,country_profile_id,source,start_date,end_date,
      rent_amount_minor,currency_code,rent_frequency,status,supersedes_lease_id,signed_document_version_id,created_by)
    values(p_organization_id,v_t.property_id,v_t.unit_id,v_t.household_id,v_l.country_profile_id,'operator_supplied',
      v_r.start_on,v_r.end_on,v_l.rent_amount_minor,v_l.currency_code,v_l.rent_frequency,'active',v_l.id,v_version_id,v_actor)
    returning id into v_new_lease;
    update public.leases set status='superseded',updated_at=now() where id=v_l.id;
    update public.tenancies set lease_id=v_new_lease,updated_at=now() where id=v_t.id;
    update private.tenancy_renewals set state='effective',lease_id=v_new_lease,effective_at=now()
      where id=v_r.id returning * into v_r;
    update public.documents set tenancy_id=p_tenancy_id,unit_id=v_t.unit_id,operator_supplied_unverified=true
      where id=v_document_id;
    -- A pending old-term run can still post within its original dates. The
    -- new schedule starts only on the next confirmed date in the new term.
    insert into public.charge_schedules(organization_id,accounting_book_id,tenancy_id,receivable_account_id,charge_type,
      amount_minor,currency_code,cadence,due_day,starts_on,ends_on,next_run_on,status)
    values(p_organization_id,v_s.accounting_book_id,v_t.id,v_t.receivable_account_id,'rent',v_s.amount_minor,v_s.currency_code,
      v_s.cadence,v_s.due_day,coalesce(v_r.first_charge_on,v_r.start_on),v_r.end_on,v_r.first_charge_on,
      case when v_r.first_charge_on is null then 'ended' else 'active' end) returning id into v_new_schedule;
  end if;

  v_event:='tenancy.renewal_'||v_r.state;
  v_response:=jsonb_build_object('tenancyId',v_t.id,'renewalId',v_r.id,'state',v_r.state,'leaseId',v_r.lease_id,
    'startOn',v_r.start_on,'endOn',v_r.end_on);
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values(p_organization_id,v_actor,'user',v_event,'tenancy_renewal',v_r.id,p_operation_key,
      v_response||jsonb_build_object('documentVersionId',v_r.document_version_id,'chargeScheduleId',v_new_schedule));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values(p_organization_id,v_event,'tenancy_renewal',v_r.id,p_operation_key,v_response);
  insert into private.idempotency_records(organization_id,actor_user_id,actor_scope,route,idempotency_key,request_hash,
    state,response_status,response_body,resource_type,resource_id,completed_at,expires_at)
    values(p_organization_id,v_actor,v_scope,'TransitionTenancyRenewal',p_operation_key::text,v_hash,
      'completed',200,v_response,'tenancy_renewal',v_r.id,now(),'infinity');
  return v_response;
end
$$;

revoke all on function public.get_tenancy_renewal(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.transition_tenancy_renewal(uuid,uuid,text,uuid,uuid,uuid,date,date,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.get_tenancy_renewal(uuid,uuid) to authenticated;
grant execute on function public.transition_tenancy_renewal(uuid,uuid,text,uuid,uuid,uuid,date,date,uuid,boolean) to authenticated;

commit;
