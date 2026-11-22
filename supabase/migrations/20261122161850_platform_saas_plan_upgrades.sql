begin;

-- A pending Stripe update cannot grant capacity until its invoice is paid.
create table private.platform_billing_upgrades (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references private.platform_billing_attempts(id),
  actor_user_id uuid references auth.users(id) on delete set null,
  from_plan_code text not null check (from_plan_code in ('starter','growth','pro')),
  target_plan_code text not null check (target_plan_code in ('growth','pro')),
  source_price_id text not null check (source_price_id ~ '^price_[a-zA-Z0-9]+$'),
  target_price_id text not null check (target_price_id ~ '^price_[a-zA-Z0-9]+$'),
  invoice_id text check (invoice_id ~ '^in_[a-zA-Z0-9]+$'),
  status text not null default 'requested' check (status in ('requested','applied','expired')),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check (source_price_id <> target_price_id)
);
create unique index platform_billing_upgrades_current
  on private.platform_billing_upgrades(attempt_id) where status='requested';
alter table private.platform_billing_upgrades enable row level security;
revoke all on private.platform_billing_upgrades from public,anon,authenticated,service_role;

create function public.prepare_platform_billing_upgrade(
  p_actor_user_id uuid,p_actor_aal text,p_organization_id uuid,p_stripe_account_id text,
  p_country char(2),p_plan_code text,p_billing_interval text,p_stripe_price_id text
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_attempt private.platform_billing_attempts%rowtype;
  v_upgrade private.platform_billing_upgrades%rowtype;
  v_payload jsonb;
begin
  if p_actor_aal is distinct from 'aal2' then raise exception using errcode='42501',message='MFA_REQUIRED'; end if;
  if not private.is_platform_billing_manager(p_actor_user_id,p_organization_id) then
    raise exception using errcode='42501',message='BILLING_SCOPE_DENIED';
  end if;
  perform 1 from public.organizations o where o.id=p_organization_id for no key update;
  if not private.is_platform_billing_manager(p_actor_user_id,p_organization_id) then
    raise exception using errcode='42501',message='BILLING_SCOPE_DENIED';
  end if;
  select * into v_attempt from private.platform_billing_attempts a
    where a.organization_id=p_organization_id and a.status='subscribed' for update;
  if not found or v_attempt.stripe_account_id is distinct from p_stripe_account_id
     or v_attempt.country_code is distinct from p_country or v_attempt.provider_status is distinct from 'active'
     or not v_attempt.paid_once or v_attempt.cancel_at_period_end or v_attempt.stripe_subscription_id is null
     or v_attempt.stripe_customer_id is null
     or not exists (select 1 from public.organization_subscriptions s where s.id=v_attempt.organization_subscription_id
         and s.organization_id=p_organization_id and s.status='active' and s.plan_code=v_attempt.plan_code) then
    raise exception using errcode='23514',message='BILLING_UPGRADE_UNAVAILABLE';
  end if;
  if v_attempt.billing_interval is distinct from p_billing_interval
     or coalesce(p_stripe_price_id,'') !~ '^price_[a-zA-Z0-9]+$'
     or p_stripe_price_id=v_attempt.stripe_price_id
     or coalesce(array_position(array['starter','growth','pro'],p_plan_code),0)
        <=array_position(array['starter','growth','pro'],v_attempt.plan_code) then
    raise exception using errcode='23514',message='BILLING_UPGRADE_TARGET_UNSUPPORTED';
  end if;
  select * into v_upgrade from private.platform_billing_upgrades u
    where u.attempt_id=v_attempt.id and u.status='requested';
  if found then
    if (v_upgrade.target_plan_code,v_upgrade.target_price_id) is distinct from (p_plan_code,p_stripe_price_id) then
      raise exception using errcode='23505',message='BILLING_UPGRADE_PENDING';
    end if;
    if v_upgrade.created_at<now()-interval '20 hours' and v_upgrade.invoice_id is null then
      -- Avoid a second update when Stripe can no longer guarantee idempotent replay.
      raise exception using errcode='55000',message='BILLING_UPGRADE_RECONCILIATION_REQUIRED';
    end if;
  else
    insert into private.platform_billing_upgrades(attempt_id,actor_user_id,from_plan_code,target_plan_code,source_price_id,target_price_id)
    values (v_attempt.id,p_actor_user_id,v_attempt.plan_code,p_plan_code,v_attempt.stripe_price_id,p_stripe_price_id)
    returning * into v_upgrade;
    v_payload := jsonb_build_object('fromPlan',v_attempt.plan_code,'toPlan',p_plan_code,'effectiveMode','immediate');
    insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values (p_organization_id,p_actor_user_id,'user','billing.subscriptionUpgradeRequested','organization_subscription',
      v_attempt.organization_subscription_id,v_upgrade.id,v_payload);
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (p_organization_id,'subscription.change_requested','organization_subscription',v_attempt.organization_subscription_id,v_upgrade.id,v_payload);
  end if;
  return jsonb_build_object('upgradeId',v_upgrade.id,'attemptId',v_attempt.id,'subscriptionId',v_attempt.stripe_subscription_id,
    'customerId',v_attempt.stripe_customer_id,'sourcePriceId',v_upgrade.source_price_id,'invoiceId',v_upgrade.invoice_id);
end;
$$;
revoke all on function public.prepare_platform_billing_upgrade(uuid,text,uuid,text,char,text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_platform_billing_upgrade(uuid,text,uuid,text,char,text,text,text) to service_role;

create function public.record_platform_billing_upgrade_invoice(p_upgrade_id uuid,p_stripe_account_id text,p_invoice_id text)
returns boolean
language sql security definer
set search_path = ''
as $$
  with recorded as (
    update private.platform_billing_upgrades u set invoice_id=p_invoice_id
    from private.platform_billing_attempts a
    where u.id=p_upgrade_id and a.id=u.attempt_id and a.stripe_account_id=p_stripe_account_id
      and u.status in ('requested','applied') and coalesce(p_invoice_id,'') ~ '^in_[a-zA-Z0-9]+$'
      and (u.invoice_id is null or u.invoice_id=p_invoice_id)
    returning u.id
  ) select exists(select 1 from recorded);
$$;
revoke all on function public.record_platform_billing_upgrade_invoice(uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_platform_billing_upgrade_invoice(uuid,text,text) to service_role;

create function public.apply_platform_billing_upgrade_event(
  p_stripe_account_id text,p_event_id text,p_attempt_id uuid,p_generation bigint,
  p_stripe_subscription_id text,p_customer_id text,p_price_id text,p_provider_status text,
  p_paid boolean,p_period_start timestamptz,p_period_end timestamptz,p_cancel_at_period_end boolean,
  p_invoice_id text,p_invoice_void boolean,p_pending_update boolean
)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_attempt private.platform_billing_attempts%rowtype;
  v_event private.platform_billing_events%rowtype;
  v_upgrade private.platform_billing_upgrades%rowtype;
  v_payload jsonb;
begin
  select * into v_attempt from private.platform_billing_attempts a
    where a.id=p_attempt_id and a.stripe_account_id=p_stripe_account_id for update;
  if not found then return false; end if;
  select * into v_event from private.platform_billing_events e where e.stripe_account_id=p_stripe_account_id
    and e.stripe_event_id=p_event_id and e.attempt_id=p_attempt_id;
  if not found then return false; end if;
  if v_event.processed_at is not null then return true; end if;
  if v_attempt.sync_generation is distinct from p_generation or v_event.generation is distinct from p_generation then return false; end if;
  if v_attempt.status<>'subscribed'
     or v_attempt.stripe_subscription_id is distinct from p_stripe_subscription_id
     or v_event.stripe_subscription_id is distinct from p_stripe_subscription_id
     or v_attempt.stripe_customer_id is distinct from p_customer_id then return false; end if;

  select * into v_upgrade from private.platform_billing_upgrades u
    where u.attempt_id=p_attempt_id and u.status='requested' for update;
  if not found or v_upgrade.source_price_id<>v_attempt.stripe_price_id then return false; end if;
  if p_price_id=v_upgrade.source_price_id and v_event.event_type='customer.subscription.pending_update_expired' then
    if p_invoice_void is not true or p_pending_update is not false or p_invoice_id is distinct from v_upgrade.invoice_id then
      return false;
    end if;
    update private.platform_billing_upgrades set status='expired',finished_at=now() where id=v_upgrade.id;
  elsif p_price_id=v_upgrade.target_price_id and p_provider_status='active' and p_paid is true
     and p_pending_update is false and coalesce(p_invoice_id,'') ~ '^in_[a-zA-Z0-9]+$'
     and (v_upgrade.invoice_id is null or v_upgrade.invoice_id=p_invoice_id) then
    update private.platform_billing_attempts set plan_code=v_upgrade.target_plan_code,stripe_price_id=v_upgrade.target_price_id
    where id=p_attempt_id;
    update private.platform_billing_upgrades set invoice_id=p_invoice_id,status='applied',finished_at=now()
    where id=v_upgrade.id;
    v_payload := jsonb_build_object('fromPlan',v_upgrade.from_plan_code,'toPlan',v_upgrade.target_plan_code,'invoiceId',p_invoice_id);
    insert into audit.audit_events(organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
    values (v_attempt.organization_id,'system','billing.subscriptionUpgradeApplied','organization_subscription',
      v_attempt.organization_subscription_id,v_upgrade.id,v_payload);
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (v_attempt.organization_id,'billing.subscriptionUpgradeApplied','organization_subscription',
      v_attempt.organization_subscription_id,v_upgrade.id,v_payload);
  elsif p_price_id is distinct from v_upgrade.source_price_id then
    return false;
  end if;
  if not public.apply_platform_billing_event(p_stripe_account_id,p_event_id,p_attempt_id,p_generation,p_stripe_subscription_id,
      p_customer_id,p_price_id,p_provider_status,p_paid,p_period_start,p_period_end,p_cancel_at_period_end) then
    raise exception using errcode='40001',message='BILLING_UPGRADE_EVENT_RETRY';
  end if;
  return true;
end;
$$;
revoke all on function public.apply_platform_billing_upgrade_event(text,text,uuid,bigint,text,text,text,text,boolean,timestamptz,timestamptz,boolean,text,boolean,boolean)
  from public,anon,authenticated;
grant execute on function public.apply_platform_billing_upgrade_event(text,text,uuid,bigint,text,text,text,text,boolean,timestamptz,timestamptz,boolean,text,boolean,boolean)
  to service_role;

create or replace function public.get_platform_billing_workspace(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_subscription public.organization_subscriptions%rowtype;
  v_attempt private.platform_billing_attempts%rowtype;
  v_upgrade_plan text;
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
  if v_attempt.status='subscribed' then
    select u.target_plan_code into v_upgrade_plan from private.platform_billing_upgrades u
      where u.attempt_id=v_attempt.id and u.status='requested';
  end if;
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
    'currentInterval',case when v_attempt.status='subscribed' then v_attempt.billing_interval end,
    'upgradePendingPlan',v_upgrade_plan,
    'hasSubscription',coalesce(v_attempt.status='subscribed',false),
    'cancelAtPeriodEnd',coalesce(v_attempt.status='subscribed' and v_attempt.cancel_at_period_end,false),
    'portalAvailable',exists (select 1 from private.platform_billing_customers c where c.organization_id=p_organization_id)
  );
end;
$$;

create or replace function public.claim_platform_billing_event(
  p_stripe_account_id text,p_event_id text,p_event_type text,p_stripe_subscription_id text,p_attempt_id uuid
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_attempt private.platform_billing_attempts%rowtype;
  v_event private.platform_billing_events%rowtype;
  v_upgrade private.platform_billing_upgrades%rowtype;
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
  select * into v_upgrade from private.platform_billing_upgrades u
    where u.attempt_id=v_attempt.id and u.status='requested';
  return jsonb_build_object('attemptId',v_attempt.id,'generation',v_attempt.sync_generation::text,
    'priceId',v_attempt.stripe_price_id,'country',v_attempt.country_code,'plan',v_attempt.plan_code,
    'interval',v_attempt.billing_interval,'customerId',v_attempt.stripe_customer_id,
    'paidOnce',v_attempt.paid_once,'upgradePriceId',v_upgrade.target_price_id,'upgradeInvoiceId',v_upgrade.invoice_id);
end;
$$;

commit;
