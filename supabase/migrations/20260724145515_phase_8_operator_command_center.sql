-- Sanitized, permission-aware aggregates for the Phase 8 operator command center.
begin;

create index leases_active_expiry_idx
  on public.leases(property_id,end_date)
  where status='active' and end_date is not null;

create or replace function private.operator_can_read_property(target_property uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select
    private.has_property_access(target_property,'property.read')
    or private.has_property_access(target_property,'property.manage')
    or private.has_property_access(target_property,'resident.read')
    or private.has_property_access(target_property,'resident.manage')
    or private.has_property_access(target_property,'lease.read')
    or private.has_property_access(target_property,'lease.manage')
    or private.has_property_access(target_property,'finance.read')
    or private.has_property_access(target_property,'finance.manage')
    or private.has_property_access(target_property,'maintenance.read')
    or private.has_property_access(target_property,'maintenance.manage')
    or private.has_property_access(target_property,'owner.read')
    or private.has_property_access(target_property,'owner.manage')
    or private.has_property_access(target_property,'documents.read')
    or private.has_property_access(target_property,'documents.manage');
$$;

revoke all on function private.operator_can_read_property(uuid) from public,anon,authenticated,service_role;

create or replace function public.get_operator_command_center(
  p_organization_id uuid default null,
  p_property_id uuid default null,
  p_accounting_book_id uuid default null,
  p_from_date date default (current_date-29),
  p_to_date date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_organization_id uuid;
  v_organization_name text;
  v_cutoff timestamptz := now();
  v_all_property_ids uuid[] := '{}'::uuid[];
  v_selected_property_ids uuid[] := '{}'::uuid[];
  v_portfolio_property_ids uuid[] := '{}'::uuid[];
  v_finance_property_ids uuid[] := '{}'::uuid[];
  v_maintenance_property_ids uuid[] := '{}'::uuid[];
  v_owner_property_ids uuid[] := '{}'::uuid[];
  v_has_unscoped_finance boolean := false;
  v_result jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_from_date is null or p_to_date is null or p_from_date>p_to_date then
    raise exception using errcode='22023',message='INVALID_DATE_RANGE';
  end if;
  if p_to_date>current_date or p_to_date-p_from_date>366 then
    raise exception using errcode='22023',message='DATE_RANGE_OUT_OF_BOUNDS';
  end if;

  if p_organization_id is null then
    select o.id,o.display_name
      into v_organization_id,v_organization_name
    from public.organization_memberships m
    join public.organizations o on o.id=m.organization_id
    where m.user_id=v_actor_id
      and m.status='active'
      and m.starts_at<=v_cutoff
      and (m.ends_at is null or m.ends_at>v_cutoff)
      and o.status in ('trial','active')
    order by m.created_at,m.id
    limit 1;
  else
    select o.id,o.display_name
      into v_organization_id,v_organization_name
    from public.organizations o
    where o.id=p_organization_id
      and o.status in ('trial','active')
      and private.is_active_org_member(o.id);
  end if;

  if v_organization_id is null then
    raise exception using errcode='42501',message='OPERATOR_ORGANIZATION_DENIED';
  end if;

  select coalesce(array_agg(p.id order by p.name,p.id),'{}'::uuid[])
    into v_all_property_ids
  from public.properties p
  where p.organization_id=v_organization_id
    and p.status<>'archived'
    and private.operator_can_read_property(p.id);

  if p_property_id is not null and not (p_property_id=any(v_all_property_ids)) then
    raise exception using errcode='42501',message='PROPERTY_FILTER_SCOPE_DENIED';
  end if;
  if p_accounting_book_id is not null and not exists(
    select 1
    from public.properties p
    where p.id=any(v_all_property_ids)
      and p.accounting_book_id=p_accounting_book_id
  ) then
    raise exception using errcode='42501',message='BOOK_FILTER_SCOPE_DENIED';
  end if;
  if p_property_id is not null and p_accounting_book_id is not null and not exists(
    select 1
    from public.properties p
    where p.id=p_property_id
      and p.accounting_book_id=p_accounting_book_id
  ) then
    raise exception using errcode='22023',message='FILTER_COMBINATION_INVALID';
  end if;

  select coalesce(array_agg(p.id order by p.name,p.id),'{}'::uuid[])
    into v_selected_property_ids
  from public.properties p
  where p.id=any(v_all_property_ids)
    and (p_property_id is null or p.id=p_property_id)
    and (p_accounting_book_id is null or p.accounting_book_id=p_accounting_book_id);

  select coalesce(array_agg(p.id),'{}'::uuid[])
    into v_portfolio_property_ids
  from public.properties p
  where p.id=any(v_selected_property_ids)
    and (
      private.has_property_access(p.id,'property.read')
      or private.has_property_access(p.id,'property.manage')
      or private.has_property_access(p.id,'resident.read')
      or private.has_property_access(p.id,'resident.manage')
      or private.has_property_access(p.id,'lease.read')
      or private.has_property_access(p.id,'lease.manage')
    );

  select coalesce(array_agg(p.id),'{}'::uuid[])
    into v_finance_property_ids
  from public.properties p
  where p.id=any(v_selected_property_ids)
    and (
      private.has_property_access(p.id,'finance.read')
      or private.has_property_access(p.id,'finance.manage')
    );

  select coalesce(array_agg(p.id),'{}'::uuid[])
    into v_maintenance_property_ids
  from public.properties p
  where p.id=any(v_selected_property_ids)
    and (
      private.has_property_access(p.id,'maintenance.read')
      or private.has_property_access(p.id,'maintenance.manage')
    );

  select coalesce(array_agg(p.id),'{}'::uuid[])
    into v_owner_property_ids
  from public.properties p
  where p.id=any(v_selected_property_ids)
    and (
      private.has_property_access(p.id,'owner.read')
      or private.has_property_access(p.id,'owner.manage')
      or private.has_property_access(p.id,'maintenance.manage')
    );

  v_has_unscoped_finance :=
    private.has_unscoped_org_permission(v_organization_id,'finance.read')
    or private.has_unscoped_org_permission(v_organization_id,'finance.manage');

  with
  finance_currencies as (
    select distinct b.functional_currency_code as currency_code
    from public.properties p
    join public.accounting_books b on b.id=p.accounting_book_id
    where p.id=any(v_finance_property_ids)
  ),
  payment_refund_totals as (
    select r.payment_id,sum(r.amount_minor) as refunded_minor
    from public.payment_refunds r
    where r.organization_id=v_organization_id
      and r.status='succeeded'
      and r.completed_at<v_cutoff
    group by r.payment_id
  ),
  collected as (
    select pay.currency_code,
      coalesce(sum(greatest(pay.amount_minor-coalesce(pr.refunded_minor,0),0)),0)::bigint as collected_minor
    from public.payments pay
    join public.tenancies t on t.id=pay.tenancy_id
    left join payment_refund_totals pr on pr.payment_id=pay.id
    where t.property_id=any(v_finance_property_ids)
      and pay.status in ('succeeded','partially_refunded','refunded')
      and pay.received_at>=(p_from_date::timestamp at time zone 'UTC')
      and pay.received_at<((p_to_date+1)::timestamp at time zone 'UTC')
      and pay.received_at<v_cutoff
    group by pay.currency_code
  ),
  overdue as (
    select c.currency_code,
      coalesce(sum(greatest(c.amount_minor-coalesce(a.allocated_minor,0),0)),0)::bigint as overdue_minor
    from public.charges c
    join public.tenancies t on t.id=c.tenancy_id
    left join lateral (
      select sum(pa.amount_minor) as allocated_minor
      from public.payment_allocations pa
      where pa.charge_id=c.id
        and pa.allocated_at<v_cutoff
        and (pa.reversed_at is null or pa.reversed_at>=v_cutoff)
    ) a on true
    where t.property_id=any(v_finance_property_ids)
      and c.status not in ('voided','written_off')
      and c.due_date<current_date
    group by c.currency_code
  ),
  currency_metrics as (
    select fc.currency_code,
      coalesce(c.collected_minor,0)::bigint as collected_minor,
      coalesce(o.overdue_minor,0)::bigint as overdue_minor
    from finance_currencies fc
    left join collected c on c.currency_code=fc.currency_code
    left join overdue o on o.currency_code=fc.currency_code
  ),
  occupancy as (
    select count(*)::integer as total_units,
      count(*) filter(where exists(
        select 1
        from public.tenancies t
        where t.unit_id=u.id
          and t.possession_start<=current_date
          and (t.possession_end is null or t.possession_end>=current_date)
          and t.status in ('active','notice_given','move_out_in_progress')
      ))::integer as occupied_units
    from public.units u
    where u.property_id=any(v_portfolio_property_ids)
      and u.operational_status<>'retired'
  ),
  exception_scope as (
    select re.id,re.exception_type,re.status,re.currency_code,re.detected_at,
      coalesce(pt.property_id,
        case when v_has_unscoped_finance then null else '00000000-0000-0000-0000-000000000000'::uuid end
      ) as property_id,
      sb.accounting_book_id
    from public.reconciliation_exceptions re
    join public.settlement_batches sb on sb.id=re.settlement_batch_id
    left join public.payments pay on pay.id=re.payment_id
    left join public.tenancies pt on pt.id=pay.tenancy_id
    where re.organization_id=v_organization_id
      and re.status in ('open','escalated')
      and (
        pt.property_id=any(v_finance_property_ids)
        or (
          re.payment_id is null
          and v_has_unscoped_finance
          and p_property_id is null
          and (p_accounting_book_id is null or sb.accounting_book_id=p_accounting_book_id)
        )
      )
  ),
  attention_rows as (
    select 'reconciliation_exception'::text as kind,
      case when es.status='escalated' then 1 else 2 end as priority,
      'Reconciliation exception'::text as title,
      replace(es.exception_type,'_',' ')::text as description,
      es.detected_at as occurred_at,
      es.property_id,
      null::char(3) as currency_code,
      null::bigint as amount_minor,
      '/app/money'::text as href
    from exception_scope es
    union all
    select 'owner_approval',1,'Owner approval requested',
      concat(p.name,' · ',replace(oar.approval_type,'_',' ')),
      oar.requested_at,oar.property_id,oar.currency_code,oar.amount_minor,
      concat('/app/maintenance/',wo.maintenance_request_id)
    from public.owner_approval_requests oar
    join public.properties p on p.id=oar.property_id
    join public.work_orders wo on wo.id=oar.work_order_id
    where oar.property_id=any(v_owner_property_ids)
      and oar.status='pending'
    union all
    select 'overdue_balance',2,'Overdue resident balance',
      concat(p.name,' · ',count(c.id),' charge',case when count(c.id)=1 then '' else 's' end),
      min(c.due_date)::timestamptz,p.id,c.currency_code,
      sum(greatest(c.amount_minor-coalesce(a.allocated_minor,0),0))::bigint,
      '/app/money'
    from public.charges c
    join public.tenancies t on t.id=c.tenancy_id
    join public.properties p on p.id=t.property_id
    left join lateral (
      select sum(pa.amount_minor) as allocated_minor
      from public.payment_allocations pa
      where pa.charge_id=c.id
        and pa.allocated_at<v_cutoff
        and (pa.reversed_at is null or pa.reversed_at>=v_cutoff)
    ) a on true
    where t.property_id=any(v_finance_property_ids)
      and c.status not in ('voided','written_off')
      and c.due_date<current_date
      and c.amount_minor-coalesce(a.allocated_minor,0)>0
    group by p.id,p.name,c.currency_code
    union all
    select 'work_order',2,'Work order needs attention',
      concat(p.name,' · ',replace(wo.status::text,'_',' ')),
      wo.updated_at,wo.property_id,wo.currency_code,coalesce(wo.estimated_cost_minor,wo.actual_cost_minor),
      concat('/app/maintenance/',wo.maintenance_request_id)
    from public.work_orders wo
    join public.properties p on p.id=wo.property_id
    where wo.property_id=any(v_maintenance_property_ids)
      and wo.status in ('draft','awaiting_approval')
  ),
  attention as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'kind',ar.kind,
      'title',ar.title,
      'description',ar.description,
      'occurredAt',ar.occurred_at,
      'propertyId',ar.property_id,
      'currencyCode',ar.currency_code,
      'amountMinor',ar.amount_minor,
      'href',ar.href
    ) order by ar.priority,ar.occurred_at desc),'[]'::jsonb) as items
    from (select * from attention_rows order by priority,occurred_at desc limit 12) ar
  ),
  activity_rows as (
    select a.action_code,a.resource_type,a.resource_id,a.occurred_at,a.actor_type,
      p.id as property_id,p.name as property_name,concat('/app/properties/',p.id) as href
    from audit.audit_events a
    join public.properties p on a.resource_type='property' and p.id=a.resource_id
    where a.organization_id=v_organization_id and p.id=any(v_portfolio_property_ids)
    union all
    select a.action_code,a.resource_type,a.resource_id,a.occurred_at,a.actor_type,
      u.property_id,p.name,concat('/app/properties/',u.property_id)
    from audit.audit_events a
    join public.units u on a.resource_type='unit' and u.id=a.resource_id
    join public.properties p on p.id=u.property_id
    where a.organization_id=v_organization_id and u.property_id=any(v_portfolio_property_ids)
    union all
    select a.action_code,a.resource_type,a.resource_id,a.occurred_at,a.actor_type,
      t.property_id,p.name,concat('/app/properties/',t.property_id)
    from audit.audit_events a
    join public.tenancies t on a.resource_type='tenancy' and t.id=a.resource_id
    join public.properties p on p.id=t.property_id
    where a.organization_id=v_organization_id and t.property_id=any(v_portfolio_property_ids)
    union all
    select a.action_code,a.resource_type,a.resource_id,a.occurred_at,a.actor_type,
      t.property_id,p.name,concat('/app/payments/',pay.id)
    from audit.audit_events a
    join public.payments pay on a.resource_type='payment' and pay.id=a.resource_id
    join public.tenancies t on t.id=pay.tenancy_id
    join public.properties p on p.id=t.property_id
    where a.organization_id=v_organization_id and t.property_id=any(v_finance_property_ids)
    union all
    select a.action_code,a.resource_type,a.resource_id,a.occurred_at,a.actor_type,
      wo.property_id,p.name,concat('/app/maintenance/',wo.maintenance_request_id)
    from audit.audit_events a
    join public.work_orders wo on a.resource_type='work_order' and wo.id=a.resource_id
    join public.properties p on p.id=wo.property_id
    where a.organization_id=v_organization_id and wo.property_id=any(v_maintenance_property_ids)
    union all
    select a.action_code,a.resource_type,a.resource_id,a.occurred_at,a.actor_type,
      mr.property_id,p.name,concat('/app/maintenance/',mr.id)
    from audit.audit_events a
    join public.maintenance_requests mr on a.resource_type='maintenance_request' and mr.id=a.resource_id
    join public.properties p on p.id=mr.property_id
    where a.organization_id=v_organization_id and mr.property_id=any(v_maintenance_property_ids)
    union all
    select a.action_code,a.resource_type,a.resource_id,a.occurred_at,a.actor_type,
      oar.property_id,p.name,concat('/app/maintenance/',wo.maintenance_request_id)
    from audit.audit_events a
    join public.owner_approval_requests oar on a.resource_type='owner_approval_request' and oar.id=a.resource_id
    join public.work_orders wo on wo.id=oar.work_order_id
    join public.properties p on p.id=oar.property_id
    where a.organization_id=v_organization_id and oar.property_id=any(v_owner_property_ids)
  ),
  activity as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'actionCode',ar.action_code,
      'resourceType',ar.resource_type,
      'resourceId',ar.resource_id,
      'actorType',ar.actor_type,
      'occurredAt',ar.occurred_at,
      'propertyId',ar.property_id,
      'propertyName',ar.property_name,
      'href',ar.href
    ) order by ar.occurred_at desc),'[]'::jsonb) as items
    from (select * from activity_rows order by occurred_at desc limit 20) ar
  ),
  property_performance as (
    select p.id,p.name,b.functional_currency_code,
      case when p.id=any(v_portfolio_property_ids) then (
        select count(*)::integer
        from public.units u
        where u.property_id=p.id and u.operational_status<>'retired'
      ) else null end as total_units,
      case when p.id=any(v_portfolio_property_ids) then (
        select count(*)::integer
        from public.units u
        where u.property_id=p.id
          and u.operational_status<>'retired'
          and exists(
            select 1 from public.tenancies t
            where t.unit_id=u.id
              and t.possession_start<=current_date
              and (t.possession_end is null or t.possession_end>=current_date)
              and t.status in ('active','notice_given','move_out_in_progress')
          )
      ) else null end as occupied_units,
      case when p.id=any(v_finance_property_ids) then (
        select coalesce(sum(greatest(c.amount_minor-coalesce(a.allocated_minor,0),0)),0)::bigint
        from public.charges c
        join public.tenancies t on t.id=c.tenancy_id
        left join lateral (
          select sum(pa.amount_minor) as allocated_minor
          from public.payment_allocations pa
          where pa.charge_id=c.id
            and pa.allocated_at<v_cutoff
            and (pa.reversed_at is null or pa.reversed_at>=v_cutoff)
        ) a on true
        where t.property_id=p.id
          and c.status not in ('voided','written_off')
          and c.due_date<current_date
      ) else null end as overdue_minor,
      case when p.id=any(v_maintenance_property_ids) then (
        select count(*)::integer
        from public.work_orders wo
        where wo.property_id=p.id
          and wo.status not in ('completed','closed','canceled')
      ) else null end as open_work_orders
    from public.properties p
    join public.accounting_books b on b.id=p.accounting_book_id
    where p.id=any(v_selected_property_ids)
  )
  select jsonb_build_object(
    'scope',jsonb_build_object(
      'organizationId',v_organization_id,
      'organizationName',v_organization_name,
      'propertyId',p_property_id,
      'accountingBookId',p_accounting_book_id,
      'fromDate',p_from_date,
      'toDate',p_to_date,
      'cutoffAt',v_cutoff,
      'timeZone','UTC',
      'propertyCount',cardinality(v_selected_property_ids)
    ),
    'domains',jsonb_build_object(
      'portfolio',cardinality(v_portfolio_property_ids)>0,
      'finance',cardinality(v_finance_property_ids)>0,
      'maintenance',cardinality(v_maintenance_property_ids)>0,
      'owners',cardinality(v_owner_property_ids)>0
    ),
    'filters',jsonb_build_object(
      'properties',coalesce((
        select jsonb_agg(jsonb_build_object(
          'propertyId',p.id,
          'name',p.name,
          'accountingBookId',p.accounting_book_id,
          'currencyCode',b.functional_currency_code
        ) order by p.name,p.id)
        from public.properties p
        join public.accounting_books b on b.id=p.accounting_book_id
        where p.id=any(v_all_property_ids)
      ),'[]'::jsonb),
      'books',coalesce((
        select jsonb_agg(jsonb_build_object(
          'accountingBookId',x.id,
          'name',x.name,
          'currencyCode',x.functional_currency_code
        ) order by x.name,x.id)
        from (
          select distinct b.id,b.name,b.functional_currency_code
          from public.accounting_books b
          join public.properties p on p.accounting_book_id=b.id
          where p.id=any(v_all_property_ids)
        ) x
      ),'[]'::jsonb)
    ),
    'metrics',jsonb_build_object(
      'currency',coalesce((
        select jsonb_agg(jsonb_build_object(
          'currencyCode',cm.currency_code,
          'collectedMinor',cm.collected_minor,
          'overdueMinor',cm.overdue_minor
        ) order by cm.currency_code)
        from currency_metrics cm
      ),'[]'::jsonb),
      'totalUnits',(select o.total_units from occupancy o),
      'occupiedUnits',(select o.occupied_units from occupancy o),
      'openWorkOrders',(
        select count(*)::integer from public.work_orders wo
        where wo.property_id=any(v_maintenance_property_ids)
          and wo.status not in ('completed','closed','canceled')
      ),
      'expiringLeases',(
        select count(*)::integer from public.leases l
        where l.property_id=any(v_portfolio_property_ids)
          and l.status='active'
          and l.end_date between current_date and current_date+90
      ),
      'pendingOwnerApprovals',(
        select count(*)::integer from public.owner_approval_requests oar
        where oar.property_id=any(v_owner_property_ids) and oar.status='pending'
      ),
      'openReconciliationExceptions',(select count(*)::integer from exception_scope)
    ),
    'propertyPerformance',coalesce((
      select jsonb_agg(jsonb_build_object(
        'propertyId',pp.id,
        'propertyName',pp.name,
        'currencyCode',pp.functional_currency_code,
        'totalUnits',pp.total_units,
        'occupiedUnits',pp.occupied_units,
        'overdueMinor',pp.overdue_minor,
        'openWorkOrders',pp.open_work_orders
      ) order by pp.name,pp.id)
      from property_performance pp
    ),'[]'::jsonb),
    'attention',(select a.items from attention a),
    'activity',(select a.items from activity a)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_operator_command_center(uuid,uuid,uuid,date,date) from public,anon;
grant execute on function public.get_operator_command_center(uuid,uuid,uuid,date,date) to authenticated;

commit;
