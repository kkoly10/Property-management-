begin;

-- Prior estimate requests remain round one, preserving their identity and decisions.
alter table public.work_orders add column owner_approval_round integer not null default 1
  check (owner_approval_round > 0);
alter table public.owner_approval_requests add column approval_round integer not null default 1
  check (approval_round > 0);
alter table public.owner_approval_requests
  add constraint owner_approval_requests_order_round_owner_key
    unique (work_order_id,approval_round,owner_entity_id);
alter table public.owner_approval_requests
  drop constraint owner_approval_requests_work_order_id_owner_entity_id_key;

create function private.work_order_owner_threshold(p_organization_id uuid)
returns numeric
language sql stable
set search_path = ''
as $$
  select case when o.settings->>'work_order_owner_approval_threshold_minor' ~ '^[0-9]{1,19}$'
    then (o.settings->>'work_order_owner_approval_threshold_minor')::numeric end
    from public.organizations o where o.id=p_organization_id;
$$;
revoke all on function private.work_order_owner_threshold(uuid) from public,anon,authenticated,service_role;

create function private.effective_work_order_approvers(p_organization_id uuid, p_property_id uuid)
returns uuid[]
language sql stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct i.owner_entity_id order by i.owner_entity_id),array[]::uuid[])
    from public.ownership_interests i
    join public.owner_entities o on o.organization_id=i.organization_id and o.id=i.owner_entity_id
   where i.organization_id=p_organization_id and i.property_id=p_property_id and o.status='active'
     and i.effective_from<=current_date and (i.effective_to is null or i.effective_to>=current_date);
$$;
revoke all on function private.effective_work_order_approvers(uuid,uuid) from public,anon,authenticated,service_role;

create function private.work_order_cost_approval_state(
  p_order public.work_orders, p_amount_minor bigint, p_currency_code text
)
returns text
language sql stable
set search_path = ''
as $$
  select case
    when count(*)=0 then 'uncovered'
    when not bool_and(coalesce(p_amount_minor,0)=0
      or coalesce(a.amount_minor>=p_amount_minor and a.currency_code::text=p_currency_code,false)) then 'uncovered'
    when bool_and(a.status='approved') then 'approved'
    when bool_or(a.status='rejected') then 'rejected'
    when bool_and(a.status in ('approved','pending'))
      and array_agg(a.owner_entity_id order by a.owner_entity_id) =
        private.effective_work_order_approvers(p_order.organization_id,p_order.property_id) then 'pending'
    else 'uncovered'
  end
  from public.owner_approval_requests a
  where a.work_order_id=p_order.id and a.approval_round=p_order.owner_approval_round;
$$;
revoke all on function private.work_order_cost_approval_state(public.work_orders,bigint,text)
  from public,anon,authenticated,service_role;

-- A caller holds the work order row. Take the ownership lock before touching approval rows.
create function private.open_work_order_cost_approval_round(
  p_order public.work_orders, p_amount_minor bigint, p_currency_code text,
  p_actor_id uuid, p_correlation_id uuid
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_owners uuid[];
  v_round integer;
  v_retired integer;
begin
  perform private.lock_authority_write('property_ownership',p_order.property_id);
  v_owners := private.effective_work_order_approvers(p_order.organization_id,p_order.property_id);
  if cardinality(v_owners)=0 then
    raise exception using errcode='23514',message='OWNER_APPROVER_NOT_CONFIGURED';
  end if;

  select coalesce(max(a.approval_round)+1,1) into v_round
    from public.owner_approval_requests a where a.work_order_id=p_order.id;
  update public.owner_approval_requests set status='canceled',version=version+1
    where work_order_id=p_order.id and approval_round=p_order.owner_approval_round and status='pending';
  get diagnostics v_retired=row_count;

  insert into public.owner_approval_requests (
    organization_id,property_id,owner_entity_id,work_order_id,approval_type,
    amount_minor,currency_code,requested_by,approval_round
  )
  select p_order.organization_id,p_order.property_id,owner_id,p_order.id,'work_order_actual_cost',
    p_amount_minor,p_currency_code,p_actor_id,v_round from unnest(v_owners) owner_id;

  insert into audit.audit_events (
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
  ) values (
    p_order.organization_id,p_actor_id,'user','owner_approval.cost_requested','work_order',p_order.id,
    p_correlation_id,jsonb_build_object('round',v_round,'amountMinor',p_amount_minor,'currencyCode',p_currency_code,
      'previousRound',p_order.owner_approval_round,'retiredPendingRequests',v_retired)
  );
  insert into private.outbox_events (
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  ) values (
    p_order.organization_id,'owner_approval.requested','work_order',p_order.id,p_correlation_id,
    jsonb_build_object('workOrderId',p_order.id,'approvalType','work_order_actual_cost',
      'round',v_round,'amountMinor',p_amount_minor,'currencyCode',p_currency_code)
  );
  return v_round;
end;
$$;
revoke all on function private.open_work_order_cost_approval_round(public.work_orders,bigint,text,uuid,uuid)
  from public,anon,authenticated,service_role;

create or replace function private.create_work_order_owner_approval_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owners uuid[];
begin
  if not new.owner_approval_required then return new; end if;
  perform private.lock_authority_write('property_ownership',new.property_id);
  v_owners := private.effective_work_order_approvers(new.organization_id,new.property_id);
  if cardinality(v_owners)=0 then
    raise exception using errcode='23514',message='OWNER_APPROVER_NOT_CONFIGURED';
  end if;
  insert into public.owner_approval_requests (
    organization_id,property_id,owner_entity_id,work_order_id,approval_type,
    amount_minor,currency_code,requested_by,approval_round
  )
  select new.organization_id,new.property_id,owner_id,new.id,'work_order_estimate',
    new.estimated_cost_minor,
    case when new.estimated_cost_minor is not null then new.currency_code end,
    new.created_by,new.owner_approval_round
  from unnest(v_owners) owner_id;
  return new;
end;
$$;

create or replace function public.transition_work_order(
  p_work_order_id uuid,
  p_expected_version integer,
  p_transition text,
  p_reason text,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_actual_cost_minor bigint,
  p_completion_summary text,
  p_evidence_document_ids uuid[],
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_work_order public.work_orders%rowtype;
  v_evidence_ids uuid[] := coalesce(p_evidence_document_ids,array[]::uuid[]);
  v_evidence_required boolean;
  v_new_status public.work_order_status;
  v_approval_required boolean;
  v_approval_status text;
  v_approval_round integer;
  v_cost_for_review bigint;
  v_currency_code text;
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception using errcode='23514',message='INVALID_EXPECTED_VERSION';
  end if;
  if p_transition not in ('accept','schedule','start','complete','close','cancel') then
    raise exception using errcode='23514',message='INVALID_TRANSITION';
  end if;

  select * into v_work_order from public.work_orders w where w.id=p_work_order_id for update;
  if not found then raise exception using errcode='P0002',message='WORK_ORDER_NOT_FOUND'; end if;
  if not private.has_property_access(v_work_order.property_id,'maintenance.manage') then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;

  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'workOrderId',p_work_order_id,'expectedVersion',p_expected_version,'transition',p_transition,'reason',p_reason,
    'scheduledStart',p_scheduled_start,'scheduledEnd',p_scheduled_end,'actualCostMinor',p_actual_cost_minor,
    'completionSummary',p_completion_summary,'evidenceDocumentIds',to_jsonb(v_evidence_ids)
  )::text,'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=v_work_order.organization_id and r.actor_user_id=v_actor_id
    and r.route='TransitionWorkOrder' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  if v_work_order.status in ('closed','canceled') then raise exception using errcode='23514',message='WORK_ORDER_ALREADY_CLOSED'; end if;
  if v_work_order.version<>p_expected_version then raise exception using errcode='40001',message='WORK_ORDER_VERSION_CONFLICT'; end if;

  v_approval_required := v_work_order.owner_approval_required;
  v_approval_status := v_work_order.owner_approval_status;
  v_approval_round := v_work_order.owner_approval_round;
  v_currency_code := v_work_order.currency_code;

  if p_transition='accept' then
    if v_work_order.status<>'assigned' then raise exception using errcode='23514',message='INVALID_TRANSITION'; end if;
    v_new_status := 'accepted';
  elsif p_transition='schedule' then
    if v_work_order.status<>'accepted' then raise exception using errcode='23514',message='INVALID_TRANSITION'; end if;
    if p_scheduled_start is null or p_scheduled_end is null or p_scheduled_end<=p_scheduled_start then
      raise exception using errcode='23514',message='INVALID_SCHEDULE_WINDOW';
    end if;
    v_new_status := 'scheduled';
  elsif p_transition='start' then
    if v_work_order.status<>'scheduled' then raise exception using errcode='23514',message='INVALID_TRANSITION'; end if;
    v_new_status := 'in_progress';
  elsif p_transition='complete' then
    if v_work_order.status<>'in_progress' then raise exception using errcode='23514',message='INVALID_TRANSITION'; end if;
    if length(trim(coalesce(p_completion_summary,''))) not between 3 and 4000 then
      raise exception using errcode='23514',message='COMPLETION_SUMMARY_REQUIRED';
    end if;
    if cardinality(v_evidence_ids)>10 or cardinality(v_evidence_ids)<>(select count(distinct id) from unnest(v_evidence_ids) id) then
      raise exception using errcode='23514',message='INVALID_EVIDENCE';
    end if;
    select case when coalesce(o.settings->>'work_order_completion_evidence_required','true')='false' then false else true end
    into v_evidence_required from public.organizations o where o.id=v_work_order.organization_id;
    if v_evidence_required and cardinality(v_evidence_ids)=0 then
      raise exception using errcode='23514',message='COMPLETION_EVIDENCE_REQUIRED';
    end if;
    if cardinality(v_evidence_ids)>0 then
      perform 1 from public.documents d where d.id=any(v_evidence_ids) order by d.id for update;
      if cardinality(v_evidence_ids)<>(
        select count(distinct d.id)
        from public.documents d join public.document_versions dv on dv.document_id=d.id and dv.organization_id=d.organization_id
        where d.id=any(v_evidence_ids) and d.organization_id=v_work_order.organization_id
          and d.property_id=v_work_order.property_id and d.document_type='work_order_evidence' and d.status='active'
          and dv.upload_status='clean'
      ) then raise exception using errcode='23514',message='EVIDENCE_NOT_AVAILABLE'; end if;
    end if;
    if p_actual_cost_minor is not null and p_actual_cost_minor not between 0 and 9007199254740991 then
      raise exception using errcode='22023',message='INVALID_COST_AMOUNT';
    end if;
    if p_actual_cost_minor is not null then
      select b.functional_currency_code::text into v_currency_code
        from public.properties p join public.accounting_books b
          on b.id=p.accounting_book_id and b.organization_id=p.organization_id
       where p.id=v_work_order.property_id and p.organization_id=v_work_order.organization_id;
      if not found or (v_work_order.estimated_cost_minor is not null
        and v_work_order.currency_code is distinct from v_currency_code) then
        raise exception using errcode='23514',message='WORK_ORDER_COST_CURRENCY_MISMATCH';
      end if;
    end if;

    v_cost_for_review := coalesce(p_actual_cost_minor,v_work_order.actual_cost_minor,v_work_order.estimated_cost_minor);
    v_approval_required := v_approval_required or coalesce(
      v_cost_for_review>private.work_order_owner_threshold(v_work_order.organization_id),false
    );
    if v_approval_required then
      perform private.lock_authority_write('property_ownership',v_work_order.property_id);
      v_approval_status := private.work_order_cost_approval_state(v_work_order,v_cost_for_review,v_currency_code);
      if v_approval_status='uncovered' then
        v_approval_round := private.open_work_order_cost_approval_round(v_work_order,v_cost_for_review,
          case when v_cost_for_review is not null then v_currency_code end,v_actor_id,v_correlation_id);
        v_approval_status := 'pending';
      end if;
    end if;
    v_new_status := case when v_approval_required and v_approval_status is distinct from 'approved'
      then 'awaiting_approval' else 'completed' end;
  elsif p_transition='close' then
    if v_work_order.status<>'completed' then raise exception using errcode='23514',message='INVALID_TRANSITION'; end if;
    v_new_status := 'closed';
  elsif p_transition='cancel' then
    if v_work_order.status not in ('draft','assigned','accepted','scheduled','in_progress','awaiting_approval') then
      raise exception using errcode='23514',message='INVALID_TRANSITION';
    end if;
    if length(trim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception using errcode='23514',message='CANCEL_REASON_REQUIRED'; end if;
    v_new_status := 'canceled';
    v_approval_status := null;
    update public.owner_approval_requests set status='canceled',version=version+1
      where work_order_id=v_work_order.id and status='pending';
  end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (v_work_order.organization_id,v_actor_id,'TransitionWorkOrder',p_idempotency_key,v_request_hash,now()+interval '24 hours');

  update public.work_orders set
    status=v_new_status,
    version=version+1,
    owner_approval_required=v_approval_required,
    owner_approval_status=v_approval_status,
    owner_approval_round=v_approval_round,
    currency_code=v_currency_code,
    scheduled_start=case when p_transition='schedule' then p_scheduled_start else scheduled_start end,
    scheduled_end=case when p_transition='schedule' then p_scheduled_end else scheduled_end end,
    started_at=case when p_transition='start' then now() else started_at end,
    completed_at=case when p_transition='complete' and v_new_status='completed' then now() else completed_at end,
    completion_summary=case when p_transition='complete' then trim(p_completion_summary) else completion_summary end,
    actual_cost_minor=case when p_transition='complete' then coalesce(p_actual_cost_minor,actual_cost_minor) else actual_cost_minor end,
    canceled_reason=case when p_transition='cancel' then trim(p_reason) else canceled_reason end
  where id=p_work_order_id;

  if p_transition='complete' and cardinality(v_evidence_ids)>0 then
    insert into private.work_order_evidence(organization_id,work_order_id,document_id)
    select v_work_order.organization_id,p_work_order_id,id from unnest(v_evidence_ids) id
    on conflict do nothing;
  end if;

  update public.maintenance_requests set
    status=(case v_new_status
      when 'accepted' then 'triaged'::public.maintenance_status
      when 'scheduled' then 'scheduled'::public.maintenance_status
      when 'in_progress' then 'in_progress'::public.maintenance_status
      when 'awaiting_approval' then 'awaiting_approval'::public.maintenance_status
      when 'completed' then 'completed'::public.maintenance_status
      when 'closed' then 'closed'::public.maintenance_status
      when 'canceled' then 'canceled'::public.maintenance_status
      else status end),
    closed_at=case when v_new_status in ('closed','canceled') then now() else closed_at end
  where id=v_work_order.maintenance_request_id;

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,before_data,after_data)
  values (v_work_order.organization_id,v_actor_id,'user','work_order.status_changed','work_order',p_work_order_id,v_correlation_id,
    jsonb_build_object('status',v_work_order.status),jsonb_build_object('status',v_new_status,'transition',p_transition,
      'ownerApprovalStatus',v_approval_status,'ownerApprovalRound',v_approval_round));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (v_work_order.organization_id,'work_order.status_changed','work_order',p_work_order_id,v_correlation_id,
    jsonb_build_object('workOrderId',p_work_order_id,'from',v_work_order.status,'to',v_new_status,'actorType','user'));
  if v_new_status='completed' then
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (v_work_order.organization_id,'work_order.completed','work_order',p_work_order_id,v_correlation_id,
      jsonb_build_object('workOrderId',p_work_order_id,'maintenanceRequestId',v_work_order.maintenance_request_id));
  end if;

  v_response := jsonb_build_object('workOrderId',p_work_order_id,'status',v_new_status,'version',v_work_order.version+1);
  update private.idempotency_records r
  set state='completed',response_status=200,response_body=v_response,resource_type='work_order',resource_id=p_work_order_id,completed_at=now()
  where r.organization_id=v_work_order.organization_id and r.actor_user_id=v_actor_id
    and r.route='TransitionWorkOrder' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;

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
  v_mfa_threshold numeric;
  v_retired integer := 0;
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

  -- Work order first, then the property authority lock, then individual requests.
  select * into v_work_order
  from public.work_orders w
  where w.id=v_request.work_order_id
  for update;
  if not found then
    raise exception using errcode='P0002',message='WORK_ORDER_NOT_FOUND';
  end if;
  perform private.lock_authority_write('property_ownership',v_work_order.property_id);
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

  if v_work_order.status='canceled' or v_request.approval_round<>v_work_order.owner_approval_round then
    raise exception using errcode='55000',message='OWNER_APPROVAL_INACTIVE';
  end if;
  if (select array_agg(a.owner_entity_id order by a.owner_entity_id)
        from public.owner_approval_requests a where a.work_order_id=v_work_order.id
           and a.approval_round=v_work_order.owner_approval_round)
      is distinct from private.effective_work_order_approvers(v_work_order.organization_id,v_work_order.property_id) then
    raise exception using errcode='55000',message='OWNER_APPROVAL_ROSTER_CHANGED';
  end if;

  v_mfa_threshold := private.work_order_owner_threshold(v_request.organization_id);
  if v_mfa_threshold is not null
     and coalesce(v_request.amount_minor,0)>=v_mfa_threshold
     and coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then
    raise exception using errcode='42501',message='MFA_STEP_UP_REQUIRED';
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
  if p_decision='rejected' then
    update public.owner_approval_requests set status='canceled',version=version+1
      where work_order_id=v_work_order.id and approval_round=v_request.approval_round and status='pending';
    get diagnostics v_retired=row_count;
  end if;

  select case
    when bool_or(r.status='rejected') then 'rejected'
    when bool_or(r.status='pending') then 'pending'
    else 'approved'
  end
  into v_aggregate_status
  from public.owner_approval_requests r
  where r.work_order_id=v_work_order.id
    and r.approval_round=v_work_order.owner_approval_round
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
    jsonb_build_object('status',p_decision,'version',v_request.version+1,'workOrderStatus',v_next_work_order_status,
      'round',v_request.approval_round,'amountMinor',v_request.amount_minor,'currencyCode',v_request.currency_code,
      'retiredPendingRequests',v_retired)
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

create or replace function public.record_work_order_cost(
  p_organization_id uuid,
  p_work_order_id uuid,
  p_amount_minor bigint,
  p_currency_code text,
  p_memo text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_work_order public.work_orders%rowtype;
  v_property public.properties%rowtype;
  v_book public.accounting_books%rowtype;
  v_expense_account_id uuid;
  v_approval_required boolean;
  v_payable_account_id uuid;
  v_memo text := nullif(trim(coalesce(p_memo,'')),'');
  v_journal_transaction_id uuid := gen_random_uuid();
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_amount_minor is null or p_amount_minor not between 1 and 9007199254740991 then
    raise exception using errcode='22003',message='INVALID_COST_AMOUNT';
  end if;
  if p_currency_code not in ('USD','CAD','MXN') then raise exception using errcode='23514',message='INVALID_CURRENCY'; end if;
  if v_memo is not null and length(v_memo)>240 then raise exception using errcode='22001',message='COST_MEMO_TOO_LONG'; end if;

  select * into v_work_order from public.work_orders w
  where w.id=p_work_order_id and w.organization_id=p_organization_id for update;
  if not found then raise exception using errcode='P0002',message='WORK_ORDER_NOT_FOUND'; end if;
  if not private.has_property_access(v_work_order.property_id,'finance.manage') then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  if v_work_order.status not in ('completed','closed') then
    raise exception using errcode='23514',message='WORK_ORDER_NOT_COMPLETED';
  end if;

  select * into v_property from public.properties p where p.id=v_work_order.property_id and p.organization_id=p_organization_id;
  select * into v_book from public.accounting_books b
  where b.id=v_property.accounting_book_id and b.organization_id=p_organization_id and b.status='open';
  if not found then raise exception using errcode='23514',message='ACCOUNTING_BOOK_NOT_OPEN'; end if;
  if p_currency_code<>v_book.functional_currency_code then
    raise exception using errcode='23514',message='WORK_ORDER_COST_CURRENCY_MISMATCH';
  end if;

  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'organizationId',p_organization_id,'workOrderId',p_work_order_id,'amountMinor',p_amount_minor,
    'currencyCode',p_currency_code,'memo',v_memo
  )::text,'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='RecordWorkOrderCost' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  -- One cost posting per work order. Runs AFTER the idempotency short-circuit so a successful
  -- replay returns the stored response instead of tripping this guard.
  if exists(
    select 1 from public.journal_transactions jt
    where jt.organization_id=p_organization_id and jt.source_type='work_order'
      and jt.source_id=p_work_order_id and jt.transaction_type='maintenance_cost'
  ) then
    raise exception using errcode='23505',message='WORK_ORDER_COST_ALREADY_POSTED';
  end if;

  v_approval_required := v_work_order.owner_approval_required or coalesce(
    p_amount_minor>private.work_order_owner_threshold(v_work_order.organization_id),false
  );
  if v_approval_required and
     private.work_order_cost_approval_state(v_work_order,p_amount_minor,p_currency_code)<>'approved' then
    raise exception using errcode='23514',message='WORK_ORDER_COST_APPROVAL_REQUIRED';
  end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (p_organization_id,v_actor_id,'RecordWorkOrderCost',p_idempotency_key,v_request_hash,now()+interval '24 hours');

  insert into public.ledger_accounts(organization_id,accounting_book_id,account_code,account_name,account_class,normal_balance)
  values (p_organization_id,v_book.id,'6200','Repairs and maintenance','expense','debit')
  on conflict (accounting_book_id,account_code) do nothing;
  select a.id into v_expense_account_id from public.ledger_accounts a
  where a.accounting_book_id=v_book.id and a.account_code='6200' and a.account_class='expense' and a.normal_balance='debit' and a.status='active';
  if not found then raise exception using errcode='23514',message='LEDGER_ACCOUNT_CONFLICT',detail='6200'; end if;
  insert into public.ledger_accounts(organization_id,accounting_book_id,account_code,account_name,account_class,normal_balance)
  values (p_organization_id,v_book.id,'2000','Accounts payable','liability','credit')
  on conflict (accounting_book_id,account_code) do nothing;
  select a.id into v_payable_account_id from public.ledger_accounts a
  where a.accounting_book_id=v_book.id and a.account_code='2000' and a.account_class='liability' and a.normal_balance='credit' and a.status='active';
  if not found then raise exception using errcode='23514',message='LEDGER_ACCOUNT_CONFLICT',detail='2000'; end if;

  insert into public.journal_transactions(
    id,organization_id,operating_entity_id,accounting_book_id,transaction_type,effective_date,source_type,source_id,idempotency_key,
    currency_code,correlation_id,created_by,metadata
  ) values (
    v_journal_transaction_id,p_organization_id,v_property.operating_entity_id,v_book.id,'maintenance_cost',
    (now() at time zone v_property.time_zone)::date,'work_order',p_work_order_id,'work-order-cost:'||p_idempotency_key,
    p_currency_code,v_correlation_id,v_actor_id,
    jsonb_build_object('workOrderId',p_work_order_id,'vendorId',v_work_order.vendor_id,'memo',v_memo,
      'ownerApprovalRound',case when v_approval_required then v_work_order.owner_approval_round end)
  );
  insert into public.journal_entries(
    journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,debit_minor,property_id,unit_id,memo
  ) values (
    v_journal_transaction_id,p_organization_id,v_book.id,v_expense_account_id,p_amount_minor,v_property.id,v_work_order.unit_id,coalesce(v_memo,'Work order cost')
  );
  insert into public.journal_entries(
    journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,credit_minor,property_id,unit_id,memo
  ) values (
    v_journal_transaction_id,p_organization_id,v_book.id,v_payable_account_id,p_amount_minor,v_property.id,v_work_order.unit_id,'Vendor payable'
  );

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (p_organization_id,v_actor_id,'user','work_order.cost_posted','work_order',p_work_order_id,v_correlation_id,
    jsonb_build_object('journalTransactionId',v_journal_transaction_id,'amountMinor',p_amount_minor,'currencyCode',p_currency_code));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (p_organization_id,'work_order.cost_posted','work_order',p_work_order_id,v_correlation_id,
    jsonb_build_object('workOrderId',p_work_order_id,'journalTransactionId',v_journal_transaction_id,'amountMinor',p_amount_minor,'currencyCode',p_currency_code));

  v_response := jsonb_build_object(
    'workOrderId',p_work_order_id,'journalTransactionId',v_journal_transaction_id,
    'amountMinor',p_amount_minor,'currencyCode',p_currency_code
  );
  update private.idempotency_records r set state='completed',response_status=201,response_body=v_response,
    resource_type='journal_transaction',resource_id=v_journal_transaction_id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='RecordWorkOrderCost' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;

-- Recovery covers a changed invoice, a rejected round, and an ownership change before decision.
create function public.request_work_order_cost_approval(
  p_organization_id uuid, p_work_order_id uuid, p_amount_minor bigint, p_currency_code text,
  p_expected_version integer, p_note text, p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_order public.work_orders%rowtype;
  v_previous private.idempotency_records%rowtype;
  v_note text := nullif(btrim(coalesce(p_note,'')),'');
  v_correlation_id uuid := gen_random_uuid();
  v_amount bigint;
  v_currency text;
  v_hash text;
  v_status text;
  v_round integer;
  v_version integer;
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if length(btrim(coalesce(p_idempotency_key,''))) not between 8 and 200 then
    raise exception using errcode='22023',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception using errcode='22023',message='INVALID_EXPECTED_VERSION';
  end if;
  if length(v_note)>240 then raise exception using errcode='22001',message='COST_MEMO_TOO_LONG'; end if;
  if p_amount_minor is not null and p_amount_minor not between 0 and 9007199254740991 then
    raise exception using errcode='22023',message='INVALID_COST_AMOUNT';
  end if;

  select * into v_order from public.work_orders
    where id=p_work_order_id and organization_id=p_organization_id for update;
  if not found then raise exception using errcode='P0002',message='WORK_ORDER_NOT_FOUND'; end if;
  if not (
    private.has_property_access(v_order.property_id,'finance.manage')
    or (v_order.status='awaiting_approval' and private.has_property_access(v_order.property_id,'maintenance.manage'))
  ) then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;

  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'workOrderId',p_work_order_id,'expectedVersion',p_expected_version,'amountMinor',p_amount_minor,
    'currencyCode',p_currency_code,'note',v_note
  )::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',p_organization_id,v_actor_id,'RequestWorkOrderCostApproval',btrim(p_idempotency_key)
  ),0));
  select * into v_previous from private.idempotency_records
   where organization_id=p_organization_id and actor_scope='user:'||v_actor_id::text
     and route='RequestWorkOrderCostApproval' and idempotency_key=btrim(p_idempotency_key);
  if found then
    if v_previous.request_hash<>v_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;
  if v_order.version<>p_expected_version then
    raise exception using errcode='40001',message='WORK_ORDER_VERSION_CONFLICT';
  end if;
  if v_order.status not in ('awaiting_approval','completed','closed') then
    raise exception using errcode='23514',message='WORK_ORDER_COST_REVIEW_UNAVAILABLE';
  end if;
  if exists (select 1 from public.journal_transactions j where j.organization_id=p_organization_id
      and j.source_type='work_order' and j.source_id=v_order.id and j.transaction_type='maintenance_cost') then
    raise exception using errcode='23505',message='WORK_ORDER_COST_ALREADY_POSTED';
  end if;

  v_amount := coalesce(p_amount_minor, v_order.actual_cost_minor, v_order.estimated_cost_minor);
  if v_order.status in ('completed','closed') and (v_amount is null or v_amount<=0) then
    raise exception using errcode='22023',message='INVALID_COST_AMOUNT';
  end if;
  select b.functional_currency_code::text into v_currency from public.properties p
    join public.accounting_books b on b.id=p.accounting_book_id and b.organization_id=p.organization_id
   where p.id=v_order.property_id and p.organization_id=v_order.organization_id;
  if not found or (v_amount is not null and p_currency_code is distinct from v_currency) then
    raise exception using errcode='23514',message='WORK_ORDER_COST_CURRENCY_MISMATCH';
  end if;
  if not (v_order.owner_approval_required or coalesce(
      v_amount>private.work_order_owner_threshold(p_organization_id),false)) then
    raise exception using errcode='23514',message='WORK_ORDER_COST_APPROVAL_NOT_REQUIRED';
  end if;

  perform private.lock_authority_write('property_ownership',v_order.property_id);
  v_status := private.work_order_cost_approval_state(v_order,v_amount,v_currency);
  v_round := v_order.owner_approval_round;
  v_version := v_order.version;

  if v_status not in ('pending','approved')
     or (v_status='pending' and p_amount_minor is not null and exists (
       select 1 from public.owner_approval_requests a where a.work_order_id=v_order.id
         and a.approval_round=v_round and a.amount_minor is distinct from v_amount
     ))
     or (v_order.status='awaiting_approval' and p_amount_minor is not null
          and p_amount_minor is distinct from v_order.actual_cost_minor) then
    v_round := private.open_work_order_cost_approval_round(v_order,v_amount,
      case when v_amount is not null then v_currency end,v_actor_id,v_correlation_id);
    v_status := 'pending';
    update public.work_orders set owner_approval_required=true,owner_approval_status=v_status,
      owner_approval_round=v_round,
      actual_cost_minor=case when status='awaiting_approval' and p_amount_minor is not null then p_amount_minor else actual_cost_minor end,
      currency_code=case when status='awaiting_approval' and p_amount_minor is not null then v_currency else currency_code end,
      updated_at=now(),version=version+1 where id=v_order.id returning version into v_version;
    insert into audit.audit_events (
      organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,
      correlation_id,reason,before_data,after_data
    ) values (
      p_organization_id,v_actor_id,'user','work_order.cost_review_requested','work_order',v_order.id,
      v_correlation_id,v_note,jsonb_build_object('amountMinor',v_order.actual_cost_minor,'round',v_order.owner_approval_round),
      jsonb_build_object('amountMinor',v_amount,'round',v_round)
    );
  end if;

  v_response := jsonb_build_object('workOrderId',v_order.id,'version',v_version,'approvalStatus',v_status,
    'approvalRound',v_round,'amountMinor',v_amount,'currencyCode',v_currency);
  insert into private.idempotency_records (
    organization_id,actor_user_id,actor_scope,route,idempotency_key,request_hash,
    expires_at,state,response_status,response_body,resource_type,resource_id,completed_at
  ) values (
    p_organization_id,v_actor_id,'user:'||v_actor_id::text,'RequestWorkOrderCostApproval',
    btrim(p_idempotency_key),v_hash,now()+interval '24 hours','completed',200,v_response,'work_order',v_order.id,now()
  );
  return v_response;
end;
$$;
revoke all on function public.request_work_order_cost_approval(uuid,uuid,bigint,text,integer,text,text)
  from public,anon,service_role;
grant execute on function public.request_work_order_cost_approval(uuid,uuid,bigint,text,integer,text,text)
  to authenticated;

-- Close open historical requests for work orders canceled before this migration.
with canceled as (
  update public.owner_approval_requests a set status='canceled',version=a.version+1
    from public.work_orders w where a.work_order_id=w.id and w.status='canceled' and a.status='pending'
  returning a.id,a.organization_id,a.work_order_id
)
insert into audit.audit_events (organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
select organization_id,'system','owner_approval.canceled','owner_approval_request',id,gen_random_uuid(),
  jsonb_build_object('workOrderId',work_order_id,'status','canceled') from canceled;

commit;
