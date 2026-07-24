begin;

create table public.owner_entities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  display_name text not null check (length(trim(display_name)) between 1 and 160),
  entity_type text not null check (entity_type in ('person','company','trust','partnership','other')),
  email citext,
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id)
);
create index owner_entities_org_status_idx on public.owner_entities(organization_id,status);
create trigger owner_entities_touch before update on public.owner_entities
for each row execute function private.touch_updated_at();

create table public.ownership_interests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  owner_entity_id uuid not null references public.owner_entities(id) on delete restrict,
  ownership_fraction numeric(9,8) not null check (ownership_fraction > 0 and ownership_fraction <= 1),
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (property_id,owner_entity_id,effective_from),
  foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict,
  foreign key (organization_id,owner_entity_id) references public.owner_entities(organization_id,id) on delete restrict,
  check (effective_to is null or effective_to >= effective_from)
);
create index ownership_interests_owner_dates_idx on public.ownership_interests(owner_entity_id,effective_from,effective_to);
create index ownership_interests_property_dates_idx on public.ownership_interests(property_id,effective_from,effective_to);

create table public.owner_approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  owner_entity_id uuid not null references public.owner_entities(id) on delete restrict,
  work_order_id uuid not null references public.work_orders(id) on delete restrict,
  approval_type text not null check (approval_type in ('work_order_estimate','work_order_actual_cost','other')),
  amount_minor bigint check (amount_minor is null or amount_minor >= 0),
  currency_code char(3) check (currency_code is null or currency_code in ('USD','CAD','MXN')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','canceled','expired')),
  requested_at timestamptz not null default now(),
  requested_by uuid references auth.users(id) on delete restrict,
  decided_at timestamptz,
  version integer not null default 1 check (version > 0),
  unique (organization_id,id),
  unique (work_order_id,owner_entity_id),
  foreign key (organization_id,property_id) references public.properties(organization_id,id) on delete restrict,
  foreign key (organization_id,owner_entity_id) references public.owner_entities(organization_id,id) on delete restrict,
  foreign key (organization_id,property_id,work_order_id) references public.work_orders(organization_id,property_id,id) on delete restrict,
  check ((status in ('approved','rejected')) = (decided_at is not null)),
  check ((amount_minor is null) = (currency_code is null))
);
create index owner_approval_requests_owner_status_idx on public.owner_approval_requests(owner_entity_id,status,requested_at desc);
create index owner_approval_requests_property_status_idx on public.owner_approval_requests(property_id,status,requested_at desc);
create index owner_approval_requests_work_order_idx on public.owner_approval_requests(work_order_id,status);
create index owner_approval_requests_requested_by_idx on public.owner_approval_requests(requested_by) where requested_by is not null;

create table public.owner_approval_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  approval_request_id uuid not null references public.owner_approval_requests(id) on delete restrict,
  owner_entity_id uuid not null references public.owner_entities(id) on delete restrict,
  decision text not null check (decision in ('approved','rejected')),
  reason text check (reason is null or length(trim(reason)) between 3 and 1000),
  decided_by_user_id uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now(),
  expected_request_version integer not null check (expected_request_version > 0),
  unique (organization_id,id),
  unique (approval_request_id),
  foreign key (organization_id,approval_request_id) references public.owner_approval_requests(organization_id,id) on delete restrict,
  foreign key (organization_id,owner_entity_id) references public.owner_entities(organization_id,id) on delete restrict
);
create index owner_approval_decisions_owner_idx on public.owner_approval_decisions(owner_entity_id,decided_at desc);
create index owner_approval_decisions_actor_idx on public.owner_approval_decisions(decided_by_user_id,decided_at desc);

create or replace function private.is_owner_entity(target_owner_entity uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_relationships ur
    join public.owner_entities oe
      on oe.organization_id=ur.organization_id
     and oe.id=ur.relationship_id
     and oe.status='active'
    where ur.user_id=(select auth.uid())
      and ur.relationship_type='owner_entity'
      and ur.relationship_id=target_owner_entity
      and ur.status='active'
  );
$$;

create or replace function private.is_owner_entity_for_property(target_owner_entity uuid,target_property uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ownership_interests oi
    join public.owner_entities oe
      on oe.organization_id=oi.organization_id
     and oe.id=oi.owner_entity_id
     and oe.status='active'
    join public.user_relationships ur
      on ur.organization_id=oi.organization_id
     and ur.relationship_type='owner_entity'
     and ur.relationship_id=oi.owner_entity_id
     and ur.status='active'
    where oi.owner_entity_id=target_owner_entity
      and oi.property_id=target_property
      and ur.user_id=(select auth.uid())
      and oi.effective_from<=current_date
      and (oi.effective_to is null or oi.effective_to>=current_date)
  );
$$;

revoke all on function private.is_owner_entity(uuid) from public,anon,authenticated,service_role;
revoke all on function private.is_owner_entity_for_property(uuid,uuid) from public,anon,authenticated,service_role;

alter table public.owner_entities enable row level security;
alter table public.ownership_interests enable row level security;
alter table public.owner_approval_requests enable row level security;
alter table public.owner_approval_decisions enable row level security;

create policy owner_entities_exact_or_manager_read on public.owner_entities for select to authenticated using (
  (select private.is_owner_entity(id))
  or (select private.has_unscoped_org_permission(organization_id,'owner.manage'))
);
create policy ownership_interests_exact_or_manager_read on public.ownership_interests for select to authenticated using (
  (select private.is_owner_entity_for_property(owner_entity_id,property_id))
  or (select private.has_property_access(property_id,'owner.manage'))
);
create policy owner_approval_requests_scoped_read on public.owner_approval_requests for select to authenticated using (
  (select private.has_property_access(property_id,'maintenance.manage'))
  or (select private.has_property_access(property_id,'owner.manage'))
  or (select private.is_owner_entity_for_property(owner_entity_id,property_id))
);
create policy owner_approval_decisions_parent_read on public.owner_approval_decisions for select to authenticated using (
  exists (
    select 1
    from public.owner_approval_requests r
    where r.id=approval_request_id
      and (
        (select private.has_property_access(r.property_id,'maintenance.manage'))
        or (select private.has_property_access(r.property_id,'owner.manage'))
        or (select private.is_owner_entity_for_property(r.owner_entity_id,r.property_id))
      )
  )
);

revoke all on table public.owner_entities from anon,authenticated;
revoke all on table public.ownership_interests from anon,authenticated;
revoke all on table public.owner_approval_requests from anon,authenticated;
revoke all on table public.owner_approval_decisions from anon,authenticated;
grant all on table public.owner_entities to service_role;
grant all on table public.ownership_interests to service_role;
grant all on table public.owner_approval_requests to service_role;
grant all on table public.owner_approval_decisions to service_role;

create or replace function private.prevent_owner_approval_decision_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode='55000',message='OWNER_APPROVAL_DECISION_APPEND_ONLY';
end;
$$;
revoke all on function private.prevent_owner_approval_decision_mutation() from public,anon,authenticated,service_role;
create trigger owner_approval_decisions_append_only
before update or delete on public.owner_approval_decisions
for each row execute function private.prevent_owner_approval_decision_mutation();

create or replace function private.create_work_order_owner_approval_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer;
begin
  if not new.owner_approval_required then
    return new;
  end if;

  insert into public.owner_approval_requests(
    organization_id,property_id,owner_entity_id,work_order_id,approval_type,
    amount_minor,currency_code,requested_by
  )
  select
    new.organization_id,new.property_id,oi.owner_entity_id,new.id,'work_order_estimate',
    new.estimated_cost_minor,new.currency_code,new.created_by
  from public.ownership_interests oi
  join public.owner_entities oe
    on oe.organization_id=oi.organization_id
   and oe.id=oi.owner_entity_id
   and oe.status='active'
  where oi.organization_id=new.organization_id
    and oi.property_id=new.property_id
    and oi.effective_from<=current_date
    and (oi.effective_to is null or oi.effective_to>=current_date)
  on conflict (work_order_id,owner_entity_id) do nothing;

  get diagnostics v_created = row_count;
  if v_created=0 then
    raise exception using errcode='23514',message='OWNER_APPROVER_NOT_CONFIGURED';
  end if;
  return new;
end;
$$;
revoke all on function private.create_work_order_owner_approval_requests() from public,anon,authenticated,service_role;

insert into public.owner_approval_requests(
  organization_id,property_id,owner_entity_id,work_order_id,approval_type,
  amount_minor,currency_code,requested_by
)
select
  w.organization_id,w.property_id,oi.owner_entity_id,w.id,'work_order_estimate',
  w.estimated_cost_minor,w.currency_code,w.created_by
from public.work_orders w
join public.ownership_interests oi
  on oi.organization_id=w.organization_id
 and oi.property_id=w.property_id
 and oi.effective_from<=w.created_at::date
 and (oi.effective_to is null or oi.effective_to>=w.created_at::date)
join public.owner_entities oe
  on oe.organization_id=oi.organization_id
 and oe.id=oi.owner_entity_id
 and oe.status='active'
where w.owner_approval_required
on conflict (work_order_id,owner_entity_id) do nothing;

create trigger work_orders_create_owner_approval_requests
after insert on public.work_orders
for each row execute function private.create_work_order_owner_approval_requests();

create or replace function public.respond_to_owner_approval(
  p_approval_request_id uuid,
  p_decision text,
  p_reason text,
  p_expected_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_scope text;
  v_request public.owner_approval_requests%rowtype;
  v_work_order public.work_orders%rowtype;
  v_previous private.idempotency_records%rowtype;
  v_request_hash text;
  v_correlation_id uuid := gen_random_uuid();
  v_aggregate_status text;
  v_next_work_order_status public.work_order_status;
  v_work_order_version integer;
  v_response jsonb;
  v_mfa_threshold bigint;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception using errcode='22023',message='INVALID_APPROVAL_DECISION';
  end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception using errcode='22023',message='INVALID_EXPECTED_VERSION';
  end if;
  if p_decision='rejected' and (p_reason is null or length(trim(p_reason))<3) then
    raise exception using errcode='23514',message='REJECTION_REASON_REQUIRED';
  end if;
  if p_reason is not null and length(trim(p_reason))>1000 then
    raise exception using errcode='22001',message='APPROVAL_REASON_TOO_LONG';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then
    raise exception using errcode='22023',message='IDEMPOTENCY_KEY_REQUIRED';
  end if;

  select * into v_request
  from public.owner_approval_requests r
  where r.id=p_approval_request_id;
  if not found then
    raise exception using errcode='P0002',message='OWNER_APPROVAL_NOT_FOUND';
  end if;

  v_actor_scope := 'user:'||v_actor_id::text;
  v_request_hash := encode(sha256(convert_to(concat_ws(
    '|',p_approval_request_id,p_decision,coalesce(trim(p_reason),''),p_expected_version
  ),'UTF8')),'hex');

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',v_request.organization_id,v_actor_scope,'RespondToOwnerApproval',trim(p_idempotency_key)
  ),0));
  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=v_request.organization_id
    and r.actor_scope=v_actor_scope
    and r.route='RespondToOwnerApproval'
    and r.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then
      return v_previous.response_body;
    end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  select * into v_request
  from public.owner_approval_requests r
  where r.id=p_approval_request_id
  for update;
  if not private.is_owner_entity_for_property(v_request.owner_entity_id,v_request.property_id) then
    raise exception using errcode='42501',message='OWNER_APPROVAL_SCOPE_DENIED';
  end if;
  if v_request.version<>p_expected_version then
    raise exception using errcode='40001',message='VERSION_CONFLICT';
  end if;
  if v_request.status<>'pending' then
    raise exception using errcode='55000',message='OWNER_APPROVAL_ALREADY_DECIDED';
  end if;

  select nullif(o.settings->>'work_order_owner_approval_threshold_minor','')::bigint
  into v_mfa_threshold
  from public.organizations o
  where o.id=v_request.organization_id;
  if v_mfa_threshold is not null
     and coalesce(v_request.amount_minor,0)>=v_mfa_threshold
     and coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then
    raise exception using errcode='42501',message='MFA_STEP_UP_REQUIRED';
  end if;

  select * into v_work_order
  from public.work_orders w
  where w.id=v_request.work_order_id
  for update;
  if not found then
    raise exception using errcode='P0002',message='WORK_ORDER_NOT_FOUND';
  end if;

  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,request_hash,expires_at
  ) values (
    v_request.organization_id,v_actor_id,v_actor_scope,'RespondToOwnerApproval',
    trim(p_idempotency_key),v_request_hash,now()+interval '24 hours'
  );

  insert into public.owner_approval_decisions(
    organization_id,approval_request_id,owner_entity_id,decision,reason,
    decided_by_user_id,expected_request_version
  ) values (
    v_request.organization_id,v_request.id,v_request.owner_entity_id,p_decision,
    nullif(trim(p_reason),''),v_actor_id,p_expected_version
  );
  update public.owner_approval_requests
  set status=p_decision,decided_at=now(),version=version+1
  where id=v_request.id;

  select case
    when bool_or(r.status='rejected') then 'rejected'
    when bool_or(r.status='pending') then 'pending'
    else 'approved'
  end
  into v_aggregate_status
  from public.owner_approval_requests r
  where r.work_order_id=v_work_order.id
    and r.status not in ('canceled','expired');

  v_next_work_order_status := v_work_order.status;
  v_work_order_version := v_work_order.version;
  if v_work_order.owner_approval_status is distinct from v_aggregate_status then
    if v_aggregate_status='approved' and v_work_order.status='awaiting_approval' then
      v_next_work_order_status := 'completed';
    end if;
    update public.work_orders
    set owner_approval_status=v_aggregate_status,
        status=v_next_work_order_status,
        completed_at=case when v_next_work_order_status='completed' then coalesce(completed_at,now()) else completed_at end,
        version=version+1
    where id=v_work_order.id
    returning version into v_work_order_version;
  end if;

  if v_next_work_order_status='completed' and v_work_order.status='awaiting_approval' then
    update public.maintenance_requests
    set status='completed'
    where id=v_work_order.maintenance_request_id;

    insert into audit.audit_events(
      organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,
      correlation_id,before_data,after_data
    ) values (
      v_request.organization_id,v_actor_id,'user','work_order.status_changed','work_order',v_work_order.id,
      v_correlation_id,jsonb_build_object('status',v_work_order.status),
      jsonb_build_object('status','completed','ownerApprovalStatus','approved')
    );
    insert into private.outbox_events(
      organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
    ) values
      (v_request.organization_id,'work_order.status_changed','work_order',v_work_order.id,v_correlation_id,
       jsonb_build_object('workOrderId',v_work_order.id,'from',v_work_order.status,'to','completed','actorType','owner')),
      (v_request.organization_id,'work_order.completed','work_order',v_work_order.id,v_correlation_id,
       jsonb_build_object('workOrderId',v_work_order.id,'actualCostMinor',v_work_order.actual_cost_minor,'currencyCode',v_work_order.currency_code));
  end if;

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,
    correlation_id,reason,before_data,after_data
  ) values (
    v_request.organization_id,v_actor_id,'user','owner_approval.responded','owner_approval_request',v_request.id,
    v_correlation_id,nullif(trim(p_reason),''),jsonb_build_object('status',v_request.status,'version',v_request.version),
    jsonb_build_object('status',p_decision,'version',v_request.version+1,'workOrderStatus',v_next_work_order_status)
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (
    v_request.organization_id,'owner_approval.responded','owner_approval_request',v_request.id,v_correlation_id,
    jsonb_build_object('approvalRequestId',v_request.id,'ownerId',v_request.owner_entity_id,'decision',p_decision)
  );

  v_response := jsonb_build_object(
    'approvalRequestId',v_request.id,
    'decision',p_decision,
    'approvalRequestStatus',p_decision,
    'approvalRequestVersion',v_request.version+1,
    'workOrderId',v_work_order.id,
    'workOrderStatus',v_next_work_order_status,
    'workOrderApprovalStatus',v_aggregate_status,
    'workOrderVersion',v_work_order_version
  );
  update private.idempotency_records r
  set state='completed',response_status=200,response_body=v_response,
      resource_type='owner_approval_request',resource_id=v_request.id,completed_at=now()
  where r.organization_id=v_request.organization_id
    and r.actor_scope=v_actor_scope
    and r.route='RespondToOwnerApproval'
    and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;
revoke all on function public.respond_to_owner_approval(uuid,text,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.respond_to_owner_approval(uuid,text,text,integer,text) to authenticated;

create or replace function public.get_owner_approval_workspace()
returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  with scoped as (
    select r.*
    from public.owner_approval_requests r
    where (select auth.uid()) is not null
      and private.is_owner_entity_for_property(r.owner_entity_id,r.property_id)
    order by (r.status='pending') desc,r.requested_at desc
    limit 100
  )
  select jsonb_build_object(
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'approvalRequestId',r.id,
      'ownerEntityId',r.owner_entity_id,
      'ownerName',oe.display_name,
      'propertyName',p.name,
      'unitCode',u.unit_code,
      'workOrderId',w.id,
      'workOrderReference',w.public_reference,
      'workOrderStatus',w.status,
      'scope',w.scope,
      'approvalType',r.approval_type,
      'amountMinor',r.amount_minor,
      'currencyCode',r.currency_code,
      'evidenceCount',(select count(*) from private.work_order_evidence e where e.work_order_id=w.id),
      'status',r.status,
      'reason',d.reason,
      'requestedAt',r.requested_at,
      'decidedAt',r.decided_at,
      'version',r.version
    ) order by (r.status='pending') desc,r.requested_at desc),'[]'::jsonb)
  )
  from scoped r
  join public.owner_entities oe on oe.id=r.owner_entity_id and oe.organization_id=r.organization_id
  join public.properties p on p.id=r.property_id and p.organization_id=r.organization_id
  join public.work_orders w on w.id=r.work_order_id and w.organization_id=r.organization_id
  left join public.units u on u.id=w.unit_id and u.organization_id=w.organization_id
  left join public.owner_approval_decisions d on d.approval_request_id=r.id
  ;
$$;
revoke all on function public.get_owner_approval_workspace() from public,anon,authenticated,service_role;
grant execute on function public.get_owner_approval_workspace() to authenticated;

create or replace function public.get_operator_owner_approval_workspace()
returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  with scoped as (
    select r.*
    from public.owner_approval_requests r
    where (select auth.uid()) is not null
      and (
        private.has_property_access(r.property_id,'maintenance.manage')
        or private.has_property_access(r.property_id,'owner.manage')
      )
    order by (r.status='pending') desc,r.requested_at desc
    limit 100
  )
  select jsonb_build_object(
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'approvalRequestId',r.id,
      'ownerEntityId',r.owner_entity_id,
      'ownerName',oe.display_name,
      'propertyName',p.name,
      'unitCode',u.unit_code,
      'workOrderId',w.id,
      'workOrderReference',w.public_reference,
      'workOrderStatus',w.status,
      'scope',w.scope,
      'approvalType',r.approval_type,
      'amountMinor',r.amount_minor,
      'currencyCode',r.currency_code,
      'evidenceCount',(select count(*) from private.work_order_evidence e where e.work_order_id=w.id),
      'status',r.status,
      'reason',d.reason,
      'requestedAt',r.requested_at,
      'decidedAt',r.decided_at,
      'version',r.version
    ) order by (r.status='pending') desc,r.requested_at desc),'[]'::jsonb)
  )
  from scoped r
  join public.owner_entities oe on oe.id=r.owner_entity_id and oe.organization_id=r.organization_id
  join public.properties p on p.id=r.property_id and p.organization_id=r.organization_id
  join public.work_orders w on w.id=r.work_order_id and w.organization_id=r.organization_id
  left join public.units u on u.id=w.unit_id and u.organization_id=w.organization_id
  left join public.owner_approval_decisions d on d.approval_request_id=r.id
  ;
$$;
revoke all on function public.get_operator_owner_approval_workspace() from public,anon,authenticated,service_role;
grant execute on function public.get_operator_owner_approval_workspace() to authenticated;

commit;
