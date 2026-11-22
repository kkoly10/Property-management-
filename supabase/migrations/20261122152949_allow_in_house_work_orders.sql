begin;

-- Vendor-free drafts can enter the existing lifecycle through one explicit operator action.
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
  if p_transition not in ('assign_in_house','accept','schedule','start','complete','close','cancel') then
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

  if p_transition='assign_in_house' then
    if v_work_order.status<>'draft' or v_work_order.vendor_id is not null then
      raise exception using errcode='23514',message='IN_HOUSE_ASSIGNMENT_UNAVAILABLE';
    end if;
    v_new_status := 'accepted';
  elsif p_transition='accept' then
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

commit;
