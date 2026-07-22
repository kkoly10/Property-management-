begin;

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  provider_connection_id uuid not null references public.provider_connections(id) on delete restrict,
  method_code text not null check (method_code in ('card','us_bank_account','acss_debit')),
  provider_checkout_session_id text,
  provider_payment_intent_id text,
  provider_charge_id text,
  provider_event_account_id text not null,
  provider_status text not null default 'creating',
  failure_code text,
  allocation_preference jsonb not null,
  idempotency_key text not null check (length(trim(idempotency_key)) between 8 and 200),
  initiated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  unique (organization_id,id),
  unique (provider_connection_id,provider_payment_intent_id),
  unique (provider_connection_id,provider_checkout_session_id),
  foreign key (organization_id,payment_id) references public.payments(organization_id,id) on delete restrict,
  foreign key (organization_id,provider_connection_id) references public.provider_connections(organization_id,id) on delete restrict,
  check (provider_checkout_session_id is null or provider_checkout_session_id ~ '^cs_(test_|live_)?[A-Za-z0-9]+$'),
  check (provider_payment_intent_id is null or provider_payment_intent_id ~ '^pi_[A-Za-z0-9]+$'),
  check (provider_charge_id is null or provider_charge_id ~ '^ch_[A-Za-z0-9]+$'),
  check (provider_event_account_id ~ '^acct_[A-Za-z0-9]+$'),
  check (jsonb_typeof(allocation_preference)='array'),
  check (expires_at>initiated_at),
  check (confirmed_at is null or confirmed_at>=initiated_at)
);
create index payment_attempts_payment_idx on public.payment_attempts(payment_id,initiated_at desc);
create index payment_attempts_connection_status_idx on public.payment_attempts(provider_connection_id,provider_status,initiated_at desc);
create index payment_attempts_active_reservation_idx on public.payment_attempts(expires_at)
  where provider_status in ('creating','open','complete','processing');

alter table public.payment_attempts enable row level security;
create policy payment_attempts_operator_or_resident_read
on public.payment_attempts for select to authenticated
using (
  exists(
    select 1
    from public.payments p
    join public.tenancies t on t.id=p.tenancy_id
    where p.id=payment_attempts.payment_id
      and (
        (select private.has_property_access(t.property_id,'finance.read'))
        or (select private.has_property_access(t.property_id,'finance.manage'))
        or (select private.is_resident_for_tenancy(t.id))
      )
  )
);
revoke all on public.payment_attempts from public,anon,authenticated;
grant select on public.payment_attempts to authenticated;

create or replace function public.prepare_resident_payment_session(
  p_tenancy_id uuid,
  p_amount_minor bigint,
  p_currency_code char(3),
  p_allocation_preference jsonb,
  p_method_preference text,
  p_return_url text,
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
  v_tenancy public.tenancies%rowtype;
  v_property public.properties%rowtype;
  v_unit public.units%rowtype;
  v_organization public.organizations%rowtype;
  v_book public.accounting_books%rowtype;
  v_connection public.provider_connections%rowtype;
  v_previous private.idempotency_records%rowtype;
  v_canonical_allocations jsonb;
  v_allocation_count integer;
  v_allocation_sum bigint;
  v_request_hash text;
  v_resolved_method text;
  v_payment_id uuid := gen_random_uuid();
  v_payment_attempt_id uuid := gen_random_uuid();
  -- Stripe requires Checkout expiry to remain at least 30 minutes in the future;
  -- the extra five minutes absorbs application and network latency.
  v_expires_at timestamptz := now()+interval '35 minutes';
  v_correlation_id uuid := gen_random_uuid();
  v_preparation jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_amount_minor is null or p_amount_minor<=0 or p_amount_minor>9007199254740991 then
    raise exception using errcode='23514',message='INVALID_PAYMENT_AMOUNT';
  end if;
  if p_currency_code not in ('USD','CAD','MXN') then
    raise exception using errcode='23514',message='INVALID_CURRENCY';
  end if;
  if p_method_preference is not null and p_method_preference not in ('bank','card') then
    raise exception using errcode='23514',message='INVALID_PAYMENT_METHOD';
  end if;
  if p_return_url is null or length(p_return_url) not between 10 and 2048 then
    raise exception using errcode='23514',message='INVALID_RETURN_URL';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if jsonb_typeof(p_allocation_preference)<>'array'
    or jsonb_array_length(p_allocation_preference) not between 1 and 100 then
    raise exception using errcode='23514',message='INVALID_ALLOCATION_PREFERENCE';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_allocation_preference) a
    where jsonb_typeof(a)<>'object'
      or coalesce(a->>'chargeId','')=''
      or coalesce(a->>'amountMinor','') !~ '^[1-9][0-9]*$'
      or (a->>'amountMinor')::numeric>9007199254740991
      or exists(select 1 from jsonb_object_keys(a) k where k not in ('chargeId','amountMinor'))
  ) then raise exception using errcode='23514',message='INVALID_ALLOCATION_PREFERENCE'; end if;
  begin
    select jsonb_agg(jsonb_build_object('chargeId',x.charge_id,'amountMinor',x.amount_minor) order by x.charge_id),count(*),sum(x.amount_minor)
    into v_canonical_allocations,v_allocation_count,v_allocation_sum
    from (
      select (a->>'chargeId')::uuid as charge_id,(a->>'amountMinor')::bigint as amount_minor
      from jsonb_array_elements(p_allocation_preference) a
    ) x;
  exception when invalid_text_representation then
    raise exception using errcode='22P02',message='INVALID_ALLOCATION_CHARGE_ID';
  end;
  if (select count(distinct (a->>'chargeId')::uuid) from jsonb_array_elements(p_allocation_preference) a)<>v_allocation_count then
    raise exception using errcode='23505',message='DUPLICATE_ALLOCATION_CHARGE';
  end if;
  if v_allocation_sum<>p_amount_minor then
    raise exception using errcode='23514',message='ALLOCATION_TOTAL_MISMATCH';
  end if;

  select t.* into v_tenancy from public.tenancies t
  where t.id=p_tenancy_id and t.status in ('active','notice_given','move_out_in_progress');
  if not found or not private.is_resident_for_tenancy(p_tenancy_id) then
    raise exception using errcode='42501',message='TENANCY_SCOPE_DENIED';
  end if;
  select p.* into strict v_property from public.properties p where p.id=v_tenancy.property_id;
  select u.* into strict v_unit from public.units u where u.id=v_tenancy.unit_id;
  select o.* into strict v_organization from public.organizations o where o.id=v_tenancy.organization_id and o.status in ('trial','active');
  select b.* into strict v_book from public.accounting_books b where b.id=v_property.accounting_book_id and b.status='open';
  if v_book.functional_currency_code<>p_currency_code then
    raise exception using errcode='23514',message='CURRENCY_MISMATCH';
  end if;

  select c.* into v_connection from public.provider_connections c
  where c.organization_id=v_tenancy.organization_id
    and c.operating_entity_id=v_property.operating_entity_id
    and c.provider_code='stripe'
    and c.status='enabled'
    and c.charges_enabled;
  if not found then raise exception using errcode='23514',message='PAYMENT_CONNECTION_UNAVAILABLE'; end if;

  if p_method_preference='card' then
    if coalesce(v_connection.capabilities->>'card_payments','')<>'active' then
      raise exception using errcode='23514',message='PAYMENT_METHOD_UNAVAILABLE';
    end if;
    v_resolved_method := 'card';
  elsif p_method_preference='bank' then
    v_resolved_method := case
      when v_property.country_code='US' and coalesce(v_connection.capabilities->>'us_bank_account_ach_payments','')='active' then 'us_bank_account'
      when v_property.country_code='CA' and coalesce(v_connection.capabilities->>'acss_debit_payments','')='active' then 'acss_debit'
      else null end;
    if v_resolved_method is null then raise exception using errcode='23514',message='PAYMENT_METHOD_UNAVAILABLE'; end if;
  else
    v_resolved_method := case
      when coalesce(v_connection.capabilities->>'card_payments','')='active' then 'card'
      when v_property.country_code='US' and coalesce(v_connection.capabilities->>'us_bank_account_ach_payments','')='active' then 'us_bank_account'
      when v_property.country_code='CA' and coalesce(v_connection.capabilities->>'acss_debit_payments','')='active' then 'acss_debit'
      else null end;
    if v_resolved_method is null then raise exception using errcode='23514',message='PAYMENT_METHOD_UNAVAILABLE'; end if;
  end if;

  v_actor_scope := 'user:'||v_actor_id::text;
  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'tenancyId',p_tenancy_id,'amountMinor',p_amount_minor,'currencyCode',p_currency_code,
    'allocationPreference',v_canonical_allocations,'methodPreference',p_method_preference,'returnUrl',p_return_url
  )::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',v_tenancy.organization_id,v_actor_scope,'CreateResidentPaymentSession',trim(p_idempotency_key)
  ),0));
  select r.* into v_previous from private.idempotency_records r
  where r.organization_id=v_tenancy.organization_id and r.actor_scope=v_actor_scope
    and r.route='CreateResidentPaymentSession' and r.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return jsonb_build_object('replayResponse',v_previous.response_body); end if;
    if v_previous.state='processing' and (v_previous.response_body->>'expiresAt')::timestamptz>now() then
      return v_previous.response_body;
    end if;
    raise exception using errcode='40001',message='SESSION_PREPARATION_EXPIRED';
  end if;

  perform c.id from public.charges c
  join jsonb_to_recordset(v_canonical_allocations) a("chargeId" uuid,"amountMinor" bigint) on a."chargeId"=c.id
  order by c.id for update;
  if (
    select count(*) from public.charges c
    join jsonb_to_recordset(v_canonical_allocations) a("chargeId" uuid,"amountMinor" bigint) on a."chargeId"=c.id
    where c.organization_id=v_tenancy.organization_id
      and c.tenancy_id=v_tenancy.id
      and c.accounting_book_id=v_book.id
      and c.receivable_account_id=v_tenancy.receivable_account_id
      and c.currency_code=p_currency_code
      and c.status in ('open','partially_paid')
      and lower(c.charge_type) not in ('security_deposit','deposit')
  )<>v_allocation_count then raise exception using errcode='23514',message='CHARGE_NOT_AVAILABLE'; end if;
  if exists(
    select 1
    from jsonb_to_recordset(v_canonical_allocations) requested("chargeId" uuid,"amountMinor" bigint)
    join public.charges c on c.id=requested."chargeId"
    left join lateral (
      select coalesce(sum(pa.amount_minor),0) as allocated_minor
      from public.payment_allocations pa where pa.charge_id=c.id and pa.reversed_at is null
    ) allocated on true
    left join lateral (
      select coalesce(sum((preference->>'amountMinor')::bigint),0) as reserved_minor
      from public.payment_attempts attempt
      join public.payments payment on payment.id=attempt.payment_id
      cross join lateral jsonb_array_elements(attempt.allocation_preference) preference
      where payment.status in ('created','pending')
        and attempt.provider_status in ('creating','open','complete','processing')
        and attempt.expires_at>now()
        and preference->>'chargeId'=c.id::text
    ) reserved on true
    where requested."amountMinor">c.amount_minor-allocated.allocated_minor-reserved.reserved_minor
  ) then raise exception using errcode='23514',message='ALLOCATION_EXCEEDS_AVAILABLE'; end if;

  insert into public.payments(
    id,organization_id,operating_entity_id,accounting_book_id,receivable_account_id,tenancy_id,
    public_reference,payment_source,amount_minor,currency_code,status,created_by
  ) values (
    v_payment_id,v_tenancy.organization_id,v_property.operating_entity_id,v_book.id,v_tenancy.receivable_account_id,v_tenancy.id,
    'PAY-'||upper(substr(replace(v_payment_id::text,'-',''),1,12)),'provider',p_amount_minor,p_currency_code,'created',v_actor_id
  );
  insert into public.payment_attempts(
    id,organization_id,payment_id,provider_connection_id,method_code,provider_event_account_id,
    provider_status,allocation_preference,idempotency_key,expires_at
  ) values (
    v_payment_attempt_id,v_tenancy.organization_id,v_payment_id,v_connection.id,v_resolved_method,v_connection.provider_account_id,
    'creating',v_canonical_allocations,trim(p_idempotency_key),v_expires_at
  );

  v_preparation := jsonb_build_object(
    'paymentId',v_payment_id,'paymentAttemptId',v_payment_attempt_id,
    'organizationId',v_tenancy.organization_id,'tenancyId',v_tenancy.id,
    'propertyName',v_property.name,'unitCode',v_unit.unit_code,'organizationName',v_organization.display_name,
    'amountMinor',p_amount_minor,'currencyCode',p_currency_code,'allocationPreference',v_canonical_allocations,
    'methodPreference',p_method_preference,'providerMethodCode',v_resolved_method,
    'providerConnectionId',v_connection.id,'providerAccountId',v_connection.provider_account_id,
    'returnUrl',p_return_url,'expiresAt',v_expires_at,'replayResponse',null
  );
  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,request_hash,response_body,resource_type,resource_id,expires_at
  ) values (
    v_tenancy.organization_id,v_actor_id,v_actor_scope,'CreateResidentPaymentSession',trim(p_idempotency_key),v_request_hash,
    v_preparation,'payment',v_payment_id,now()+interval '24 hours'
  );
  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
  ) values (
    v_tenancy.organization_id,v_actor_id,'user','payment.created','payment',v_payment_id,v_correlation_id,
    jsonb_build_object('tenancyId',v_tenancy.id,'amountMinor',p_amount_minor,'currencyCode',p_currency_code,'status','created')
  );
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (
    v_tenancy.organization_id,'payment.created','payment',v_payment_id,v_correlation_id,
    jsonb_build_object('paymentId',v_payment_id,'tenancyId',v_tenancy.id,'amountMinor',p_amount_minor,'currencyCode',p_currency_code,'status','created')
  );
  return v_preparation;
end;
$$;

create or replace function public.complete_resident_payment_session(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_payment_id uuid,
  p_payment_attempt_id uuid,
  p_tenancy_id uuid,
  p_amount_minor bigint,
  p_currency_code char(3),
  p_allocation_preference jsonb,
  p_method_preference text,
  p_return_url text,
  p_provider_connection_id uuid,
  p_provider_account_id text,
  p_provider_checkout_session_id text,
  p_provider_payment_intent_id text,
  p_provider_status text,
  p_checkout_url text,
  p_provider_expires_at timestamptz,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_scope text := 'user:'||p_actor_user_id::text;
  v_previous private.idempotency_records%rowtype;
  v_payment public.payments%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_connection public.provider_connections%rowtype;
  v_canonical_allocations jsonb;
  v_request_hash text;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if p_actor_user_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_provider_checkout_session_id is null or p_provider_checkout_session_id !~ '^cs_(test_|live_)?[A-Za-z0-9]+$'
    or (p_provider_payment_intent_id is not null and p_provider_payment_intent_id !~ '^pi_[A-Za-z0-9]+$')
    or p_provider_account_id !~ '^acct_[A-Za-z0-9]+$'
    or p_checkout_url is null or p_checkout_url !~ '^https://checkout\.stripe\.com/'
    or p_provider_expires_at is null or p_provider_expires_at<=now()
    or length(p_provider_status) not between 1 and 80 then
    raise exception using errcode='23514',message='INVALID_PROVIDER_SESSION';
  end if;
  select jsonb_agg(jsonb_build_object('chargeId',x.charge_id,'amountMinor',x.amount_minor) order by x.charge_id)
  into v_canonical_allocations
  from (
    select (a->>'chargeId')::uuid as charge_id,(a->>'amountMinor')::bigint as amount_minor
    from jsonb_array_elements(p_allocation_preference) a
  ) x;
  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'tenancyId',p_tenancy_id,'amountMinor',p_amount_minor,'currencyCode',p_currency_code,
    'allocationPreference',v_canonical_allocations,'methodPreference',p_method_preference,'returnUrl',p_return_url
  )::text,'UTF8')),'hex');

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',p_organization_id,v_actor_scope,'CreateResidentPaymentSession',trim(p_idempotency_key)
  ),0));
  select r.* into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_scope=v_actor_scope
    and r.route='CreateResidentPaymentSession' and r.idempotency_key=trim(p_idempotency_key)
  for update;
  if not found then raise exception using errcode='P0002',message='PAYMENT_PREPARATION_NOT_FOUND'; end if;
  if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
  if v_previous.state='completed' then return v_previous.response_body; end if;
  if v_previous.state<>'processing' then raise exception using errcode='40001',message='PAYMENT_PREPARATION_UNAVAILABLE'; end if;
  if (v_previous.response_body->>'expiresAt')::timestamptz<=now() then
    raise exception using errcode='40001',message='SESSION_PREPARATION_EXPIRED';
  end if;
  if v_previous.resource_id<>p_payment_id
    or v_previous.response_body->>'paymentAttemptId'<>p_payment_attempt_id::text
    or v_previous.response_body->>'providerConnectionId'<>p_provider_connection_id::text
    or v_previous.response_body->>'providerAccountId'<>p_provider_account_id then
    raise exception using errcode='23505',message='PROVIDER_SESSION_MISMATCH';
  end if;
  if not exists(
    select 1 from public.tenancies t
    join public.household_members hm on hm.organization_id=t.organization_id and hm.household_id=t.household_id
    join public.user_relationships ur on ur.organization_id=t.organization_id
      and ur.relationship_type='resident_person' and ur.relationship_id=hm.person_id and ur.status='active'
    where t.id=p_tenancy_id and t.organization_id=p_organization_id and ur.user_id=p_actor_user_id
      and hm.starts_on<=current_date and (hm.ends_on is null or hm.ends_on>=current_date)
  ) then raise exception using errcode='42501',message='TENANCY_SCOPE_DENIED'; end if;

  select p.* into v_payment from public.payments p
  where p.id=p_payment_id and p.organization_id=p_organization_id and p.tenancy_id=p_tenancy_id
    and p.status='created' for update;
  if not found then raise exception using errcode='40001',message='PAYMENT_STATE_CONFLICT'; end if;
  select a.* into v_attempt from public.payment_attempts a
  where a.id=p_payment_attempt_id and a.organization_id=p_organization_id and a.payment_id=p_payment_id
    and a.provider_status='creating' for update;
  if not found then raise exception using errcode='40001',message='PAYMENT_ATTEMPT_STATE_CONFLICT'; end if;
  select c.* into v_connection from public.provider_connections c
  where c.id=p_provider_connection_id and c.organization_id=p_organization_id
    and c.provider_account_id=p_provider_account_id and c.provider_code='stripe'
    and c.status='enabled' and c.charges_enabled;
  if not found then raise exception using errcode='23514',message='PAYMENT_CONNECTION_UNAVAILABLE'; end if;

  update public.payment_attempts a set
    provider_checkout_session_id=p_provider_checkout_session_id,
    provider_payment_intent_id=p_provider_payment_intent_id,
    provider_status=p_provider_status,
    expires_at=p_provider_expires_at
  where a.id=v_attempt.id;
  update public.payments p set status='pending' where p.id=v_payment.id;

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
  ) values (
    p_organization_id,p_actor_user_id,'user','payment_attempt.initiated','payment_attempt',p_payment_attempt_id,v_correlation_id,
    jsonb_build_object('paymentId',p_payment_id,'methodCode',v_attempt.method_code,'providerStatus',p_provider_status,'expiresAt',p_provider_expires_at)
  );
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (
    p_organization_id,'payment_attempt.initiated','payment_attempt',p_payment_attempt_id,v_correlation_id,
    jsonb_build_object('paymentAttemptId',p_payment_attempt_id,'paymentId',p_payment_id,'methodCode',v_attempt.method_code,'providerStatus',p_provider_status,'expiresAt',p_provider_expires_at)
  );

  v_response := jsonb_build_object(
    'paymentId',p_payment_id,'paymentAttemptId',p_payment_attempt_id,
    'providerAccountId',p_provider_account_id,'checkoutUrl',p_checkout_url,'status','pending'
  );
  update private.idempotency_records r set
    state='completed',response_status=201,response_body=v_response,completed_at=now()
  where r.id=v_previous.id;
  return v_response;
end;
$$;

create or replace function public.get_resident_payment_history()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object(
    'paymentId',pay.id,'publicReference',pay.public_reference,'propertyName',p.name,'unitCode',u.unit_code,
    'source',pay.payment_source,'amountMinor',pay.amount_minor,'currencyCode',pay.currency_code,'status',pay.status,
    'receivedAt',pay.received_at,'receiptDocumentId',pay.receipt_document_id
  ) order by coalesce(pay.received_at,pay.created_at) desc),'[]'::jsonb))
  from public.payments pay
  join public.tenancies t on t.id=pay.tenancy_id
  join public.properties p on p.id=t.property_id
  join public.units u on u.id=t.unit_id
  where pay.status<>'created' and private.is_resident_for_tenancy(t.id)
$$;

create or replace function public.get_resident_payment_session_options()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with scoped as (
    select
      t.id as tenancy_id,t.organization_id,o.display_name as organization_name,
      p.name as property_name,u.unit_code,b.functional_currency_code as currency_code,
      coalesce(pc.status,'not_connected') as connection_status,
      (
        case when coalesce(pc.capabilities->>'card_payments','')='active' and pc.status='enabled' and pc.charges_enabled
          then '["card"]'::jsonb else '[]'::jsonb end
        || case when pc.status='enabled' and pc.charges_enabled and (
          (p.country_code='US' and coalesce(pc.capabilities->>'us_bank_account_ach_payments','')='active')
          or (p.country_code='CA' and coalesce(pc.capabilities->>'acss_debit_payments','')='active')
        ) then '["bank"]'::jsonb else '[]'::jsonb end
      ) as available_methods,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'chargeId',c.id,'description',c.description,'dueDate',c.due_date,
          'amountMinor',c.amount_minor,'remainingMinor',available.remaining_minor
        ) order by c.due_date,c.created_at)
        from public.charges c
        cross join lateral (
          select c.amount_minor
            -coalesce((select sum(pa.amount_minor) from public.payment_allocations pa where pa.charge_id=c.id and pa.reversed_at is null),0)
            -coalesce((
              select sum((preference->>'amountMinor')::bigint)
              from public.payment_attempts attempt
              join public.payments payment on payment.id=attempt.payment_id
              cross join lateral jsonb_array_elements(attempt.allocation_preference) preference
              where payment.status in ('created','pending')
                and attempt.provider_status in ('creating','open','complete','processing')
                and attempt.expires_at>now()
                and preference->>'chargeId'=c.id::text
            ),0) as remaining_minor
        ) available
        where c.tenancy_id=t.id and c.status in ('open','partially_paid')
          and lower(c.charge_type) not in ('security_deposit','deposit') and available.remaining_minor>0
      ),'[]'::jsonb) as charges
    from public.tenancies t
    join public.organizations o on o.id=t.organization_id
    join public.properties p on p.id=t.property_id
    join public.units u on u.id=t.unit_id
    join public.accounting_books b on b.id=p.accounting_book_id
    left join public.provider_connections pc on pc.organization_id=t.organization_id
      and pc.operating_entity_id=p.operating_entity_id and pc.provider_code='stripe'
    where t.status in ('active','notice_given','move_out_in_progress')
      and (select private.is_resident_for_tenancy(t.id))
  )
  select jsonb_build_object('tenancies',coalesce(jsonb_agg(jsonb_build_object(
    'tenancyId',tenancy_id,'organizationId',organization_id,'organizationName',organization_name,
    'propertyName',property_name,'unitCode',unit_code,'currencyCode',currency_code,
    'connectionStatus',connection_status,'availableMethods',available_methods,'charges',charges
  ) order by property_name,unit_code) filter (where jsonb_array_length(charges)>0),'[]'::jsonb))
  from scoped;
$$;

revoke all on function public.prepare_resident_payment_session(uuid,bigint,char,jsonb,text,text,text) from public,anon,service_role;
grant execute on function public.prepare_resident_payment_session(uuid,bigint,char,jsonb,text,text,text) to authenticated;
revoke all on function public.complete_resident_payment_session(uuid,uuid,uuid,uuid,uuid,bigint,char,jsonb,text,text,uuid,text,text,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.complete_resident_payment_session(uuid,uuid,uuid,uuid,uuid,bigint,char,jsonb,text,text,uuid,text,text,text,text,text,timestamptz,text) to service_role;
revoke all on function public.get_resident_payment_session_options() from public,anon,service_role;
grant execute on function public.get_resident_payment_session_options() to authenticated;

commit;
