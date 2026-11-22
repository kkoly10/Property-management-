-- Platform SaaS billing has its own Stripe account, customers, Checkout intents and event receipts.
-- Its only shared billing projection is the existing Crecy entitlement subscription row.
begin;

create table private.platform_billing_customers (
  organization_id uuid primary key references public.organizations(id),
  stripe_account_id text not null check (stripe_account_id ~ '^acct_[a-zA-Z0-9]+$'),
  stripe_customer_id text not null check (stripe_customer_id ~ '^cus_[a-zA-Z0-9]+$'),
  unique (stripe_account_id, stripe_customer_id)
);

create table private.platform_billing_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  organization_subscription_id uuid not null references public.organization_subscriptions(id),
  actor_user_id uuid references auth.users(id) on delete set null,
  stripe_account_id text not null check (stripe_account_id ~ '^acct_[a-zA-Z0-9]+$'),
  country_code char(2) not null check (country_code in ('US','CA','MX')),
  plan_code text not null check (plan_code in ('starter','growth','pro')),
  billing_interval text not null check (billing_interval in ('month','year')),
  stripe_price_id text not null check (stripe_price_id ~ '^price_[a-zA-Z0-9]+$'),
  stripe_customer_id text check (stripe_customer_id ~ '^cus_[a-zA-Z0-9]+$'),
  stripe_checkout_session_id text check (stripe_checkout_session_id ~ '^cs_test_[a-zA-Z0-9]+$'),
  stripe_subscription_id text check (stripe_subscription_id ~ '^sub_[a-zA-Z0-9]+$'),
  status text not null default 'open' check (status in ('open','subscribed','closed','expired')),
  provider_status text,
  paid_once boolean not null default false,
  cancel_at_period_end boolean not null default false,
  sync_generation bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (stripe_account_id, stripe_checkout_session_id),
  unique (stripe_account_id, stripe_subscription_id)
);
create unique index platform_billing_attempts_current
  on private.platform_billing_attempts(organization_id) where status in ('open','subscribed');
create index platform_billing_attempts_org_history
  on private.platform_billing_attempts(organization_id, created_at desc, id desc);

create table private.platform_billing_events (
  stripe_account_id text not null,
  stripe_event_id text not null check (stripe_event_id ~ '^evt_[a-zA-Z0-9]+$'),
  attempt_id uuid not null references private.platform_billing_attempts(id),
  stripe_subscription_id text not null,
  event_type text not null,
  generation bigint not null,
  processed_at timestamptz,
  primary key (stripe_account_id, stripe_event_id)
);

alter table private.platform_billing_customers enable row level security;
alter table private.platform_billing_attempts enable row level security;
alter table private.platform_billing_events enable row level security;
revoke all on private.platform_billing_customers,private.platform_billing_attempts,private.platform_billing_events
  from public,anon,authenticated,service_role;

create function private.is_platform_billing_manager(p_actor_user_id uuid,p_organization_id uuid)
returns boolean
language sql stable
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_memberships m
    join public.organizations o on o.id=m.organization_id
    where m.user_id=p_actor_user_id and m.organization_id=p_organization_id
      and m.status='active' and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
      and m.role_code in ('org_owner','org_admin')
      and not exists (select 1 from public.membership_property_scopes scope where scope.membership_id=m.id)
      and o.status in ('trial','active')
  );
$$;
revoke all on function private.is_platform_billing_manager(uuid,uuid) from public,anon,authenticated,service_role;

create function public.get_platform_billing_workspace(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_subscription public.organization_subscriptions%rowtype;
  v_attempt private.platform_billing_attempts%rowtype;
begin
  if not private.is_platform_billing_manager(auth.uid(),p_organization_id)
     or (private.active_organization_id() is not null and private.active_organization_id()<>p_organization_id) then
    raise exception using errcode='42501',message='BILLING_SCOPE_DENIED';
  end if;
  select * into v_subscription from public.organization_subscriptions s
  where s.organization_id=p_organization_id
  order by (s.status<>'canceled') desc,s.created_at desc,s.id desc limit 1;
  if not found then raise exception using errcode='P0002',message='BILLING_NOT_AVAILABLE'; end if;
  select * into v_attempt from private.platform_billing_attempts a
  where a.organization_id=p_organization_id
  order by (a.status in ('open','subscribed')) desc,a.created_at desc,a.id desc limit 1;
  return jsonb_build_object(
    'country',v_subscription.country_price_book,'plan',v_subscription.plan_code,
    'status',case
      when v_attempt.status='closed' and v_attempt.paid_once and v_attempt.provider_status='canceled' then 'canceled'
      when v_subscription.status='trialing' and v_subscription.trial_ends_at<=now() then 'trial_ended'
      else v_subscription.status::text
    end,
    'trialEndsAt',v_subscription.trial_ends_at,'periodEndsAt',v_subscription.current_period_end,
    'checkoutPending',coalesce(v_attempt.status='open',false),
    'pendingPlan',case when v_attempt.status='open' then v_attempt.plan_code end,
    'pendingInterval',case when v_attempt.status='open' then v_attempt.billing_interval end,
    'hasSubscription',coalesce(v_attempt.status='subscribed',false),
    'cancelAtPeriodEnd',coalesce(v_attempt.status='subscribed' and v_attempt.cancel_at_period_end,false),
    'portalAvailable',exists (select 1 from private.platform_billing_customers c where c.organization_id=p_organization_id)
  );
end;
$$;
revoke all on function public.get_platform_billing_workspace(uuid) from public,anon,service_role;
grant execute on function public.get_platform_billing_workspace(uuid) to authenticated;

create function public.prepare_platform_billing_checkout(
  p_actor_user_id uuid,p_actor_aal text,p_organization_id uuid,p_stripe_account_id text,
  p_country char(2),p_plan_code text,p_billing_interval text,p_stripe_price_id text
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_subscription public.organization_subscriptions%rowtype;
  v_attempt private.platform_billing_attempts%rowtype;
  v_customer private.platform_billing_customers%rowtype;
begin
  if p_actor_aal is distinct from 'aal2' then raise exception using errcode='42501',message='MFA_REQUIRED'; end if;
  if not private.is_platform_billing_manager(p_actor_user_id,p_organization_id) then
    raise exception using errcode='42501',message='BILLING_SCOPE_DENIED';
  end if;
  perform 1 from public.organizations o where o.id=p_organization_id for no key update;
  if not private.is_platform_billing_manager(p_actor_user_id,p_organization_id) then
    raise exception using errcode='42501',message='BILLING_SCOPE_DENIED';
  end if;
  if coalesce(p_stripe_account_id,'') !~ '^acct_[a-zA-Z0-9]+$'
     or coalesce(p_stripe_price_id,'') !~ '^price_[a-zA-Z0-9]+$'
     or coalesce(p_plan_code,'') not in ('starter','growth','pro')
     or coalesce(p_billing_interval,'') not in ('month','year') then
    raise exception using errcode='22023',message='INVALID_BILLING_PLAN';
  end if;
  select * into v_subscription from public.organization_subscriptions s where s.organization_id=p_organization_id
  order by (s.status<>'canceled') desc,s.created_at desc,s.id desc limit 1;
  if not found or v_subscription.country_price_book is distinct from p_country then
    raise exception using errcode='22023',message='BILLING_PRICE_BOOK_MISMATCH';
  end if;
  select * into v_attempt from private.platform_billing_attempts a
    where a.organization_id=p_organization_id and a.status in ('open','subscribed') for update;
  if found then
    if v_attempt.status='subscribed' then raise exception using errcode='23505',message='BILLING_SUBSCRIPTION_EXISTS'; end if;
    if (v_attempt.plan_code,v_attempt.billing_interval,v_attempt.stripe_account_id,v_attempt.stripe_price_id)
       is distinct from (p_plan_code,p_billing_interval,p_stripe_account_id,p_stripe_price_id) then
      raise exception using errcode='23505',message='BILLING_CHECKOUT_PENDING';
    end if;
    if v_attempt.stripe_checkout_session_id is null and v_attempt.created_at<now()-interval '20 hours' then
      -- Stripe can retire idempotency keys after 24 hours. An unresolved response cannot be re-minted.
      raise exception using errcode='55000',message='BILLING_CHECKOUT_RECONCILIATION_REQUIRED';
    end if;
  else
    -- This first slice supports conversions that preserve capacity. A later downgrade command
    -- must also reserve the destination limits against concurrent portfolio/staff provisioning.
    if array_position(array['free','starter','growth','pro'],p_plan_code)
       < array_position(array['free','starter','growth','pro'],v_subscription.plan_code) then
      raise exception using errcode='23514',message='BILLING_DOWNGRADE_UNAVAILABLE';
    end if;
    if (select count(*) from public.units u where u.organization_id=p_organization_id
         and u.operational_status<>'retired' and u.archived_at is null) >
       (select limit_value from public.plan_entitlements where plan_code=p_plan_code and feature_code='core.unit') then
      raise exception using errcode='23514',message='BILLING_PLAN_LIMIT_EXCEEDED';
    end if;
    if (select count(*) from public.organization_memberships m where m.organization_id=p_organization_id
         and m.status in ('invited','active','suspended') and (m.ends_at is null or m.ends_at>now())) >
       (select limit_value from public.plan_entitlements where plan_code=p_plan_code and feature_code='core.staff') then
      raise exception using errcode='23514',message='BILLING_PLAN_LIMIT_EXCEEDED';
    end if;
    select * into v_customer from private.platform_billing_customers c where c.organization_id=p_organization_id;
    if found and v_customer.stripe_account_id<>p_stripe_account_id then
      raise exception using errcode='23514',message='BILLING_ACCOUNT_MISMATCH';
    end if;
    -- Older provider references cannot be charged through a newly configured sandbox.
    if v_subscription.provider_subscription_id is not null or v_subscription.provider_customer_id is not null then
      raise exception using errcode='23514',message='BILLING_EXISTING_PROVIDER_REFERENCE';
    end if;
    insert into private.platform_billing_attempts(
      organization_id,organization_subscription_id,actor_user_id,stripe_account_id,
      country_code,plan_code,billing_interval,stripe_price_id,stripe_customer_id
    ) values (
      p_organization_id,v_subscription.id,p_actor_user_id,p_stripe_account_id,
      p_country,p_plan_code,p_billing_interval,p_stripe_price_id,v_customer.stripe_customer_id
    ) returning * into v_attempt;
  end if;
  return jsonb_build_object('attemptId',v_attempt.id,'customerId',v_attempt.stripe_customer_id,
    'sessionId',v_attempt.stripe_checkout_session_id);
end;
$$;
revoke all on function public.prepare_platform_billing_checkout(uuid,text,uuid,text,char,text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_platform_billing_checkout(uuid,text,uuid,text,char,text,text,text) to service_role;

create function public.record_platform_billing_checkout(p_attempt_id uuid,p_stripe_account_id text,p_stripe_session_id text,p_expired boolean)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  if coalesce(p_stripe_session_id,'') !~ '^cs_test_[a-zA-Z0-9]+$' then
    raise exception using errcode='22023',message='INVALID_BILLING_SESSION';
  end if;
  update private.platform_billing_attempts a
  set stripe_checkout_session_id=p_stripe_session_id,
      status=case when p_expired and a.status='open' then 'expired' else a.status end
  where a.id=p_attempt_id and a.stripe_account_id=p_stripe_account_id
    and (a.stripe_checkout_session_id is null or a.stripe_checkout_session_id=p_stripe_session_id)
    and (a.status in ('open','subscribed') or (p_expired and a.status='expired'));
  return found;
end;
$$;
revoke all on function public.record_platform_billing_checkout(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.record_platform_billing_checkout(uuid,text,text,boolean) to service_role;

create function public.prepare_platform_billing_portal(
  p_actor_user_id uuid,p_actor_aal text,p_organization_id uuid,p_stripe_account_id text
)
returns text
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_customer_id text;
begin
  if p_actor_aal is distinct from 'aal2' then raise exception using errcode='42501',message='MFA_REQUIRED'; end if;
  if not private.is_platform_billing_manager(p_actor_user_id,p_organization_id) then
    raise exception using errcode='42501',message='BILLING_SCOPE_DENIED';
  end if;
  select c.stripe_customer_id into v_customer_id from private.platform_billing_customers c
  where c.organization_id=p_organization_id and c.stripe_account_id=p_stripe_account_id;
  if not found then raise exception using errcode='P0002',message='BILLING_CUSTOMER_NOT_FOUND'; end if;
  return v_customer_id;
end;
$$;
revoke all on function public.prepare_platform_billing_portal(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_platform_billing_portal(uuid,text,uuid,text) to service_role;

create function public.claim_platform_billing_event(
  p_stripe_account_id text,p_event_id text,p_event_type text,p_stripe_subscription_id text,p_attempt_id uuid
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_attempt private.platform_billing_attempts%rowtype;
  v_event private.platform_billing_events%rowtype;
begin
  if coalesce(p_stripe_subscription_id,'') !~ '^sub_[a-zA-Z0-9]+$' then
    raise exception using errcode='22023',message='INVALID_BILLING_SUBSCRIPTION';
  end if;
  -- Prefer a known provider subscription ID. The reservation marker is only used for first binding.
  select * into v_attempt from private.platform_billing_attempts a
    where a.stripe_account_id=p_stripe_account_id and a.stripe_subscription_id=p_stripe_subscription_id for update;
  if not found and p_attempt_id is not null then
    select * into v_attempt from private.platform_billing_attempts a
    where a.id=p_attempt_id and a.stripe_account_id=p_stripe_account_id and a.stripe_subscription_id is null for update;
  end if;
  if v_attempt.id is null or v_attempt.status in ('expired','closed') then return null; end if;
  select * into v_event from private.platform_billing_events e
    where e.stripe_account_id=p_stripe_account_id and e.stripe_event_id=p_event_id;
  if found then
    if (v_event.attempt_id,v_event.event_type,v_event.stripe_subscription_id)
       is distinct from (v_attempt.id,p_event_type,p_stripe_subscription_id) then
      raise exception using errcode='23505',message='BILLING_EVENT_CONFLICT';
    end if;
    if v_event.processed_at is not null then return null; end if;
  end if;
  update private.platform_billing_attempts set sync_generation=sync_generation+1
  where id=v_attempt.id returning * into v_attempt;
  insert into private.platform_billing_events as e(
    stripe_account_id,stripe_event_id,attempt_id,event_type,stripe_subscription_id,generation
  ) values (p_stripe_account_id,p_event_id,v_attempt.id,p_event_type,p_stripe_subscription_id,v_attempt.sync_generation)
  on conflict (stripe_account_id,stripe_event_id) do update set generation=excluded.generation
    where (e.attempt_id,e.event_type,e.stripe_subscription_id)
          =(excluded.attempt_id,excluded.event_type,excluded.stripe_subscription_id);
  if not found then raise exception using errcode='23505',message='BILLING_EVENT_CONFLICT'; end if;
  return jsonb_build_object('attemptId',v_attempt.id,'generation',v_attempt.sync_generation::text,
    'priceId',v_attempt.stripe_price_id,'country',v_attempt.country_code,'plan',v_attempt.plan_code,
    'interval',v_attempt.billing_interval,'customerId',v_attempt.stripe_customer_id);
end;
$$;
revoke all on function public.claim_platform_billing_event(text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_platform_billing_event(text,text,text,text,uuid) to service_role;

create function public.apply_platform_billing_event(
  p_stripe_account_id text,p_event_id text,p_attempt_id uuid,p_generation bigint,
  p_stripe_subscription_id text,p_customer_id text,p_price_id text,p_provider_status text,
  p_paid boolean,p_period_start timestamptz,p_period_end timestamptz,p_cancel_at_period_end boolean
)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_attempt private.platform_billing_attempts%rowtype;
  v_event private.platform_billing_events%rowtype;
  v_terminal boolean;
  v_effective public.subscription_status;
  v_correlation uuid := gen_random_uuid();
  v_projection jsonb;
begin
  select * into v_attempt from private.platform_billing_attempts a
    where a.id=p_attempt_id and a.stripe_account_id=p_stripe_account_id for update;
  if not found then return false; end if;
  select * into v_event from private.platform_billing_events e where e.stripe_account_id=p_stripe_account_id
    and e.stripe_event_id=p_event_id and e.attempt_id=p_attempt_id;
  if not found then return false; end if;
  if v_event.processed_at is not null then return true; end if;
  if v_attempt.status in ('expired','closed') then return true; end if;
  if v_attempt.sync_generation is distinct from p_generation
     or v_event.generation is distinct from p_generation then return false; end if;

  if v_attempt.stripe_price_id is distinct from p_price_id
     or v_event.stripe_subscription_id is distinct from p_stripe_subscription_id
     or (v_attempt.stripe_subscription_id is not null and v_attempt.stripe_subscription_id<>p_stripe_subscription_id)
     or (v_attempt.stripe_customer_id is not null and v_attempt.stripe_customer_id<>p_customer_id)
     or coalesce(p_customer_id,'') !~ '^cus_[a-zA-Z0-9]+$'
     or coalesce(p_provider_status,'') not in ('active','past_due','unpaid','paused','incomplete','incomplete_expired','trialing','canceled') then
    raise exception using errcode='23514',message='BILLING_SUBSCRIPTION_BINDING_MISMATCH';
  end if;
  insert into private.platform_billing_customers(organization_id,stripe_account_id,stripe_customer_id)
  values (v_attempt.organization_id,p_stripe_account_id,p_customer_id)
  on conflict (organization_id) do nothing;
  if not exists (select 1 from private.platform_billing_customers c
    where c.organization_id=v_attempt.organization_id and c.stripe_account_id=p_stripe_account_id and c.stripe_customer_id=p_customer_id) then
    raise exception using errcode='23514',message='BILLING_CUSTOMER_BINDING_MISMATCH';
  end if;

  v_terminal := p_provider_status in ('canceled','incomplete_expired');
  if p_provider_status='active' and p_paid then
    v_effective := 'active';
  elsif v_attempt.paid_once then
    v_effective := case when p_provider_status in ('active','past_due') then 'past_due'::public.subscription_status
                   else 'restricted'::public.subscription_status end;
  end if;
  update private.platform_billing_attempts
  set stripe_subscription_id=p_stripe_subscription_id,stripe_customer_id=p_customer_id,
      provider_status=p_provider_status,status=case when v_terminal then 'closed' else 'subscribed' end,
      paid_once=paid_once or (p_provider_status='active' and coalesce(p_paid,false)),
      cancel_at_period_end=coalesce(p_cancel_at_period_end,false)
  where id=p_attempt_id;

  if v_effective is not null then
    update public.organization_subscriptions s
    set plan_code=v_attempt.plan_code,status=v_effective,current_period_start=p_period_start,
        current_period_end=p_period_end,updated_at=now()
    where s.id=v_attempt.organization_subscription_id and s.organization_id=v_attempt.organization_id;
    if not found then raise exception using errcode='23514',message='BILLING_SUBSCRIPTION_BINDING_MISMATCH'; end if;
  end if;
  update private.platform_billing_events set processed_at=now()
  where stripe_account_id=p_stripe_account_id and stripe_event_id=p_event_id;
  v_projection := jsonb_build_object('providerStatus',p_provider_status,'status',v_effective,'planCode',v_attempt.plan_code);
  insert into audit.audit_events(organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (v_attempt.organization_id,'system','billing.subscriptionSynced','organization_subscription',
    v_attempt.organization_subscription_id,v_correlation,v_projection);
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (v_attempt.organization_id,'billing.subscriptionSynced','organization_subscription',
    v_attempt.organization_subscription_id,v_correlation,v_projection);
  return true;
end;
$$;
revoke all on function public.apply_platform_billing_event(text,text,uuid,bigint,text,text,text,text,boolean,timestamptz,timestamptz,boolean)
  from public,anon,authenticated;
grant execute on function public.apply_platform_billing_event(text,text,uuid,bigint,text,text,text,text,boolean,timestamptz,timestamptz,boolean)
  to service_role;

commit;
