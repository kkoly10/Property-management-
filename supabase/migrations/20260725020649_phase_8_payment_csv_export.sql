-- Bounded, MFA-protected, property-scoped payment export projection.
begin;

create index payments_org_activity_export_idx
  on public.payments(
    organization_id,
    (coalesce(received_at,created_at)) desc,
    id desc
  );

create or replace function public.get_operator_payment_export(
  p_from_date date default current_date-29,
  p_to_date date default current_date,
  p_property_id uuid default null,
  p_accounting_book_id uuid default null
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
  v_cutoff timestamptz := now();
  v_row_count integer;
  v_items jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then
    raise exception using errcode='42501',message='MFA_REQUIRED';
  end if;
  if p_from_date is null
     or p_to_date is null
     or p_from_date>p_to_date
     or p_to_date>current_date
     or p_to_date-p_from_date>365 then
    raise exception using errcode='22023',message='INVALID_DATE_RANGE';
  end if;

  select m.organization_id
    into v_organization_id
  from public.organization_memberships m
  join public.organizations o on o.id=m.organization_id
  where m.user_id=v_actor_id
    and m.status='active'
    and m.starts_at<=v_cutoff
    and (m.ends_at is null or m.ends_at>v_cutoff)
    and o.status in ('trial','active')
    and exists (
      select 1
      from public.properties property_scope
      where property_scope.organization_id=m.organization_id
        and (
          private.has_property_access(property_scope.id,'finance.read')
          or private.has_property_access(property_scope.id,'finance.manage')
        )
    )
  order by m.created_at,m.id
  limit 1;

  if v_organization_id is null then
    raise exception using errcode='42501',message='OPERATOR_FINANCE_DENIED';
  end if;

  if p_property_id is not null and not exists (
    select 1
    from public.properties property_filter
    where property_filter.id=p_property_id
      and property_filter.organization_id=v_organization_id
      and (
        private.has_property_access(property_filter.id,'finance.read')
        or private.has_property_access(property_filter.id,'finance.manage')
      )
  ) then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;

  if p_accounting_book_id is not null and not exists (
    select 1
    from public.properties book_property
    where book_property.organization_id=v_organization_id
      and book_property.accounting_book_id=p_accounting_book_id
      and (
        private.has_property_access(book_property.id,'finance.read')
        or private.has_property_access(book_property.id,'finance.manage')
      )
  ) then
    raise exception using errcode='42501',message='BOOK_SCOPE_DENIED';
  end if;

  if p_property_id is not null
     and p_accounting_book_id is not null
     and not exists (
       select 1
       from public.properties filter_property
       where filter_property.id=p_property_id
         and filter_property.organization_id=v_organization_id
         and filter_property.accounting_book_id=p_accounting_book_id
     ) then
    raise exception using errcode='22023',message='FILTER_COMBINATION_INVALID';
  end if;

  with scoped_rows as materialized (
    select
      payment.id as payment_id,
      payment.public_reference,
      coalesce(payment.received_at,payment.created_at) as activity_at,
      payment.received_at,
      property.id as property_id,
      property.name as property_name,
      payment.accounting_book_id,
      unit.unit_code,
      household.display_name as household_name,
      payment.payment_source,
      payment.status::text as payment_status,
      payment.reconciliation_status::text as reconciliation_status,
      payment.amount_minor::text as amount_minor,
      coalesce((
        select sum(allocation.amount_minor)
        from public.payment_allocations allocation
        where allocation.payment_id=payment.id
          and allocation.reversed_at is null
      ),0)::text as allocated_minor,
      payment.currency_code::text as currency_code
    from public.payments payment
    join public.tenancies tenancy on tenancy.id=payment.tenancy_id
    join public.properties property on property.id=tenancy.property_id
    join public.units unit on unit.id=tenancy.unit_id
    join public.households household on household.id=tenancy.household_id
    where payment.organization_id=v_organization_id
      and coalesce(payment.received_at,payment.created_at)>=p_from_date::timestamptz
      and coalesce(payment.received_at,payment.created_at)<(p_to_date+1)::timestamptz
      and coalesce(payment.received_at,payment.created_at)<=v_cutoff
      and (p_property_id is null or property.id=p_property_id)
      and (p_accounting_book_id is null or payment.accounting_book_id=p_accounting_book_id)
      and (
        private.has_property_access(property.id,'finance.read')
        or private.has_property_access(property.id,'finance.manage')
      )
    order by coalesce(payment.received_at,payment.created_at) desc,payment.id desc
    limit 5001
  )
  select
    count(*)::integer,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'paymentId',payment_id,
        'publicReference',public_reference,
        'activityAt',activity_at,
        'receivedAt',received_at,
        'propertyId',property_id,
        'propertyName',property_name,
        'accountingBookId',accounting_book_id,
        'unitCode',unit_code,
        'householdName',household_name,
        'paymentSource',payment_source,
        'status',payment_status,
        'reconciliationStatus',reconciliation_status,
        'amountMinor',amount_minor,
        'allocatedMinor',allocated_minor,
        'currencyCode',currency_code
      )
      order by activity_at desc,payment_id desc
    ),'[]'::jsonb)
    into v_row_count,v_items
  from scoped_rows;

  if v_row_count>5000 then
    raise exception using errcode='54000',message='PAYMENT_EXPORT_TOO_LARGE';
  end if;

  return jsonb_build_object(
    'scope',jsonb_build_object(
      'organizationId',v_organization_id,
      'propertyId',p_property_id,
      'accountingBookId',p_accounting_book_id,
      'fromDate',p_from_date,
      'toDate',p_to_date
    ),
    'generatedAt',v_cutoff,
    'rowCount',v_row_count,
    'items',v_items
  );
end;
$$;

comment on function public.get_operator_payment_export(date,date,uuid,uuid) is
  'Returns at most 5,000 server-selected operator payment export rows after AAL2, active membership, property scope, and finance permission checks.';

revoke all on function public.get_operator_payment_export(date,date,uuid,uuid) from public,anon;
grant execute on function public.get_operator_payment_export(date,date,uuid,uuid) to authenticated;

commit;
