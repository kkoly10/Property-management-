begin;

create or replace function public.get_payment_attempt_history(p_payment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'attempts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'attemptId',attempt.id,
        'method',case
          when attempt.method_code='card' then 'card'
          when attempt.method_code in ('us_bank_account','acss_debit') then 'bank'
          else 'unknown'
        end,
        'providerStatus',attempt.provider_status,
        'failureCode',attempt.failure_code,
        'initiatedAt',attempt.initiated_at,
        'expiresAt',attempt.expires_at,
        'confirmedAt',attempt.confirmed_at,
        'isCurrent',attempt.attempt_rank=1
      ) order by attempt.initiated_at desc,attempt.id desc)
      from (
        select candidate.*,row_number() over(order by candidate.initiated_at desc,candidate.id desc) as attempt_rank
        from public.payment_attempts candidate
        where candidate.payment_id=pay.id
      ) attempt
    ),'[]'::jsonb)
  ) into v_result
  from public.payments pay
  join public.tenancies tenancy on tenancy.id=pay.tenancy_id
  where pay.id=p_payment_id and (
    private.has_property_access(tenancy.property_id,'finance.read')
    or private.has_property_access(tenancy.property_id,'finance.manage')
    or private.is_resident_for_tenancy(tenancy.id)
  );

  if v_result is null then
    raise exception using errcode='P0002',message='PAYMENT_NOT_FOUND';
  end if;
  return v_result;
end;
$$;

create or replace function public.get_resident_payment_retry_context(p_payment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'paymentId',pay.id,
    'publicReference',pay.public_reference,
    'tenancyId',pay.tenancy_id,
    'amountMinor',pay.amount_minor,
    'currencyCode',pay.currency_code,
    'method',case
      when attempt.method_code='card' then 'card'
      when attempt.method_code in ('us_bank_account','acss_debit') then 'bank'
      else 'card'
    end,
    'allocations',attempt.allocation_preference,
    'failureCode',coalesce(attempt.failure_code,'payment_failed'),
    'failedAt',coalesce(attempt.expires_at,attempt.confirmed_at,attempt.initiated_at)
  ) into v_result
  from public.payments pay
  join lateral (
    select candidate.*
    from public.payment_attempts candidate
    where candidate.payment_id=pay.id
    order by candidate.initiated_at desc,candidate.id desc
    limit 1
  ) attempt on true
  where pay.id=p_payment_id
    and pay.payment_source='provider'
    and pay.status='failed'
    and attempt.provider_status in ('expired','failed','canceled','cancelled')
    and private.is_resident_for_tenancy(pay.tenancy_id);

  if v_result is null then
    raise exception using errcode='P0002',message='PAYMENT_NOT_RETRYABLE';
  end if;
  return v_result;
end;
$$;

revoke all on function public.get_payment_attempt_history(uuid) from public,anon,service_role;
grant execute on function public.get_payment_attempt_history(uuid) to authenticated;
revoke all on function public.get_resident_payment_retry_context(uuid) from public,anon,service_role;
grant execute on function public.get_resident_payment_retry_context(uuid) to authenticated;

commit;
