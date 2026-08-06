-- Phase 6: post a completed work order's cost to the double-entry ledger.
-- Closes the delivery-plan Phase 6 exit criterion "maintenance cost posts through approved
-- journal template". Not a file-14 command contract; the design mirrors the existing ledger
-- posting commands (record_manual_payment). A balanced journal debits a repairs/maintenance
-- expense and credits accounts payable; the expense leg carries property_id so it flows onto
-- owner statements automatically (private.calculate_owner_statement sums expense legs by property).
-- Vendor payment / accounts-payable settlement is out of pilot scope.
begin;

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
    jsonb_build_object('workOrderId',p_work_order_id,'vendorId',v_work_order.vendor_id,'memo',v_memo)
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
revoke all on function public.record_work_order_cost(uuid,uuid,bigint,text,text,text) from public,anon;
grant execute on function public.record_work_order_cost(uuid,uuid,bigint,text,text,text) to authenticated;

-- Surface the posted cost on the operator workspace, and include completed/closed work orders
-- (not just active ones) so the request detail can show and post their cost.
create or replace function public.get_operator_maintenance_workspace()
returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  with visible as (
    select mr.*,p.name as property_name,u.unit_code
    from public.maintenance_requests mr join public.properties p on p.id=mr.property_id join public.units u on u.id=mr.unit_id
    where private.has_property_access(mr.property_id,'maintenance.read') or private.has_property_access(mr.property_id,'maintenance.manage')
    order by mr.created_at desc limit 100
  )
  select jsonb_build_object(
    'summary',jsonb_build_object(
      'open',count(*) filter (where status not in ('closed','canceled')),
      'overdue',count(*) filter (where target_at<now() and status not in ('completed','closed','canceled')),
      'untriaged',count(*) filter (where status='new')
    ),
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'maintenanceRequestId',id,'organizationId',organization_id,'publicReference',public_reference,'propertyName',property_name,'unitCode',unit_code,
      'category',category,'title',title,'description',description,'priorityRequested',priority_requested,
      'officialPriority',priority,'status',status,'accessPermission',access_permission,'preferredTimes',preferred_times,
      'createdAt',created_at,'targetAt',target_at,'evidenceCount',(select count(*) from private.maintenance_request_evidence e where e.maintenance_request_id=visible.id),
      'workOrder',(
        select jsonb_build_object(
          'workOrderId',w.id,'publicReference',w.public_reference,'status',w.status,'scope',w.scope,
          'vendorId',w.vendor_id,'vendorName',ve.display_name,
          'scheduledStart',w.scheduled_start,'scheduledEnd',w.scheduled_end,'startedAt',w.started_at,
          'completedAt',w.completed_at,'completionSummary',w.completion_summary,
          'estimatedCostMinor',w.estimated_cost_minor,'actualCostMinor',w.actual_cost_minor,'currencyCode',w.currency_code,
          'ownerApprovalRequired',w.owner_approval_required,'ownerApprovalStatus',w.owner_approval_status,
          'canceledReason',w.canceled_reason,'version',w.version,
          'evidenceCount',(select count(*) from private.work_order_evidence e where e.work_order_id=w.id),
          'cost',(
            select jsonb_build_object(
              'journalTransactionId',jt.id,
              'amountMinor',(select coalesce(sum(je.debit_minor),0) from public.journal_entries je where je.journal_transaction_id=jt.id),
              'currencyCode',jt.currency_code
            )
            from public.journal_transactions jt
            where jt.organization_id=w.organization_id and jt.source_type='work_order'
              and jt.source_id=w.id and jt.transaction_type='maintenance_cost'
            limit 1
          )
        )
        from public.work_orders w left join public.vendors ve on ve.id=w.vendor_id
        where w.maintenance_request_id=visible.id and w.status<>'canceled'
        order by w.created_at desc limit 1
      )
    ) order by created_at desc) filter (where id is not null),'[]'::jsonb)
  ) from visible
$$;
revoke all on function public.get_operator_maintenance_workspace() from public,anon;
grant execute on function public.get_operator_maintenance_workspace() to authenticated;

commit;
