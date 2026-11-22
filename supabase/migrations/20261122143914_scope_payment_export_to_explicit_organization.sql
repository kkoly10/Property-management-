begin;

create function private.payment_export_properties(p_organization_id uuid)
returns table(property_id uuid, property_name text, book_id uuid, book_name text)
language sql
stable
set search_path = ''
as $$
  select p.id,p.name,b.id,b.name
  from public.properties p
  join public.accounting_books b on b.id=p.accounting_book_id and b.organization_id=p.organization_id
  where p.organization_id=p_organization_id
    and (
      private.has_property_access(p.id,'finance.read')
      or private.has_property_access(p.id,'finance.manage')
    )
$$;
revoke all on function private.payment_export_properties(uuid) from public,anon,authenticated,service_role;

create function public.get_operator_payment_export_options(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return (
    select jsonb_build_object(
      'organizationId',p_organization_id,
      'properties',coalesce(jsonb_agg(
        jsonb_build_object('id',p.property_id,'name',p.property_name,'bookId',p.book_id,'bookName',p.book_name)
        order by p.property_name,p.property_id
      ),'[]'::jsonb)
    )
    from private.payment_export_properties(p_organization_id) p
  );
end
$$;
revoke all on function public.get_operator_payment_export_options(uuid) from public,anon,service_role;
grant execute on function public.get_operator_payment_export_options(uuid) to authenticated;

create function public.get_operator_payment_export_for_organization(
  p_organization_id uuid,
  p_from_date date default null,
  p_to_date date default null,
  p_property_id uuid default null,
  p_accounting_book_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := statement_timestamp();
  v_time_zone text;
  v_today date;
  v_from date;
  v_to date;
  v_start timestamptz;
  v_end timestamptz;
  v_row_count integer;
  v_items jsonb;
begin
  perform private.enter_organization_context(p_organization_id);
  if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then
    raise exception using errcode='42501',message='MFA_REQUIRED';
  end if;
  select o.default_time_zone into v_time_zone
  from public.organizations o
  where o.id=p_organization_id and o.status in ('trial','active');
  if not found or not exists (select 1 from private.payment_export_properties(p_organization_id)) then
    raise exception using errcode='42501',message='OPERATOR_FINANCE_DENIED';
  end if;

  v_today := (v_cutoff at time zone v_time_zone)::date;
  v_to := coalesce(p_to_date,v_today);
  v_from := coalesce(p_from_date,v_to-29);
  if not isfinite(v_to) or not isfinite(v_from) or v_from>v_to or v_to>v_today then
    raise exception using errcode='22023',message='INVALID_DATE_RANGE';
  end if;
  if v_to-v_from>365 then
    raise exception using errcode='22023',message='INVALID_DATE_RANGE';
  end if;
  v_start := v_from::timestamp at time zone v_time_zone;
  v_end := (v_to+1)::timestamp at time zone v_time_zone;

  if p_property_id is not null and not exists (
    select 1 from private.payment_export_properties(p_organization_id) p
    where p.property_id=p_property_id
  ) then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;
  if p_accounting_book_id is not null and not exists (
    select 1 from private.payment_export_properties(p_organization_id) p
    where p.book_id=p_accounting_book_id
  ) then
    raise exception using errcode='42501',message='BOOK_SCOPE_DENIED';
  end if;
  if p_property_id is not null and p_accounting_book_id is not null and not exists (
    select 1 from private.payment_export_properties(p_organization_id) p
    where p.property_id=p_property_id and p.book_id=p_accounting_book_id
  ) then
    raise exception using errcode='22023',message='FILTER_COMBINATION_INVALID';
  end if;

  with scoped_rows as materialized (
    select payment.id as payment_id,payment.public_reference,
      coalesce(payment.received_at,payment.created_at) as activity_at,payment.received_at,
      property.property_id,property.property_name,payment.accounting_book_id,
      unit.unit_code,household.display_name as household_name,payment.payment_source,
      payment.status::text as payment_status,payment.reconciliation_status::text as reconciliation_status,
      payment.amount_minor::text,
      coalesce((
        select sum(allocation.amount_minor)
        from public.payment_allocations allocation
        where allocation.payment_id=payment.id and allocation.organization_id=p_organization_id
          and allocation.reversed_at is null
      ),0)::text as allocated_minor,
      payment.currency_code::text
    from public.payments payment
    join public.tenancies tenancy on tenancy.id=payment.tenancy_id and tenancy.organization_id=payment.organization_id
    join private.payment_export_properties(p_organization_id) property on property.property_id=tenancy.property_id
    join public.units unit on unit.id=tenancy.unit_id and unit.organization_id=tenancy.organization_id
    join public.households household on household.id=tenancy.household_id and household.organization_id=tenancy.organization_id
    where payment.organization_id=p_organization_id
      and coalesce(payment.received_at,payment.created_at)>=v_start
      and coalesce(payment.received_at,payment.created_at)<v_end
      and coalesce(payment.received_at,payment.created_at)<=v_cutoff
      and (p_property_id is null or property.property_id=p_property_id)
      and (p_accounting_book_id is null or payment.accounting_book_id=p_accounting_book_id)
    order by coalesce(payment.received_at,payment.created_at) desc,payment.id desc
    limit 5001
  )
  select count(*)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'paymentId',payment_id,'publicReference',public_reference,'activityAt',activity_at,'receivedAt',received_at,
      'propertyId',property_id,'propertyName',property_name,'accountingBookId',accounting_book_id,
      'unitCode',unit_code,'householdName',household_name,'paymentSource',payment_source,
      'status',payment_status,'reconciliationStatus',reconciliation_status,
      'amountMinor',amount_minor,'allocatedMinor',allocated_minor,'currencyCode',currency_code
    ) order by activity_at desc,payment_id desc),'[]'::jsonb)
  into v_row_count,v_items
  from scoped_rows;

  if v_row_count>5000 then
    raise exception using errcode='54000',message='PAYMENT_EXPORT_TOO_LARGE';
  end if;
  return jsonb_build_object(
    'scope',jsonb_build_object(
      'organizationId',p_organization_id,'propertyId',p_property_id,'accountingBookId',p_accounting_book_id,
      'fromDate',v_from,'toDate',v_to,'timeZone',v_time_zone
    ),
    'generatedAt',v_cutoff,'rowCount',v_row_count,'items',v_items
  );
end
$$;
revoke all on function public.get_operator_payment_export_for_organization(uuid,date,date,uuid,uuid) from public,anon,service_role;
grant execute on function public.get_operator_payment_export_for_organization(uuid,date,date,uuid,uuid) to authenticated;

commit;
