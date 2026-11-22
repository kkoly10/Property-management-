begin;

-- An elapsed Growth trial retains historical access while preventing new paid capacity.
-- Evaluate the deadline when writing so this boundary does not depend on cron delivery.
create function private.billing_allows_growth(p_status public.subscription_status,p_trial_ends_at timestamptz)
returns boolean
language sql stable
set search_path = ''
as $$
  select p_status in ('active','past_due') or
    (p_status='trialing' and (p_trial_ends_at is null or p_trial_ends_at>statement_timestamp()))
$$;
revoke all on function private.billing_allows_growth(public.subscription_status,timestamptz)
  from public,anon,authenticated,service_role;

create or replace function private.has_plan_entitlement(
  target_organization uuid,target_feature text,allow_restricted boolean default false
)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_subscriptions s
    join public.plan_entitlements e on e.plan_code=s.plan_code and e.feature_code=target_feature and e.enabled
    where s.organization_id=target_organization
      and (
        private.billing_allows_growth(s.status,s.trial_ends_at)
        or (allow_restricted and s.status in ('restricted','trialing'))
      )
  );
$$;

create function private.guard_portfolio_billing_growth()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_subscription record;
begin
  -- Use the same subscription lock as unit provisioning and import commands.
  select s.status,s.trial_ends_at into v_subscription from public.organization_subscriptions s
  where s.organization_id=new.organization_id
  order by (s.status<>'canceled') desc,s.created_at desc,s.id desc limit 1 for share;
  if not found or not private.billing_allows_growth(v_subscription.status,v_subscription.trial_ends_at) then
    raise exception using errcode='23514',message='PLAN_UNAVAILABLE';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_portfolio_billing_growth() from public,anon,authenticated,service_role;

create trigger units_billing_growth_insert before insert on public.units
  for each row when (new.archived_at is null and new.operational_status<>'retired')
  execute function private.guard_portfolio_billing_growth();
create trigger units_billing_growth_update before update of archived_at,operational_status,organization_id on public.units
  for each row when (
    new.archived_at is null and new.operational_status<>'retired'
    and (old.archived_at is not null or old.operational_status='retired' or old.organization_id<>new.organization_id)
  ) execute function private.guard_portfolio_billing_growth();
create trigger properties_billing_growth_insert before insert on public.properties
  for each row when (new.archived_at is null and new.status<>'archived')
  execute function private.guard_portfolio_billing_growth();
create trigger properties_billing_growth_update before update of archived_at,status,organization_id on public.properties
  for each row when (
    new.archived_at is null and new.status<>'archived'
    and (old.archived_at is not null or old.status='archived' or old.organization_id<>new.organization_id)
  ) execute function private.guard_portfolio_billing_growth();

-- Preserve earlier activity samples and one observed count per tenant-local billing date.
-- A missed run cannot reconstruct past inventory from today's rows.
create function public.sample_platform_billing_usage(p_stripe_account_id text,p_limit integer default 1000)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_sample_at timestamptz := statement_timestamp();
  v_sampled integer;
  v_has_more boolean;
begin
  if p_limit is null or p_limit<1 or p_limit>1000
     or coalesce(p_stripe_account_id,'') !~ '^acct_[a-zA-Z0-9]+$' then
    raise exception using errcode='22023',message='INVALID_BILLING_USAGE_REQUEST';
  end if;
  with due as materialized (
    select a.organization_id, 'platform-billing-day:' ||
      (v_sample_at at time zone tz.name)::date::text as sample_key
    from private.platform_billing_attempts a
    join public.organizations o on o.id=a.organization_id and o.status in ('trial','active')
    join pg_catalog.pg_timezone_names tz on tz.name=o.default_time_zone
    where a.status='subscribed' and a.paid_once and a.stripe_account_id=p_stripe_account_id
      and not exists (
        select 1 from public.usage_records u where u.organization_id=a.organization_id
          and u.meter_code='active_units' and u.idempotency_key='platform-billing-day:' ||
            (v_sample_at at time zone tz.name)::date::text
      )
    order by a.organization_id
    limit p_limit+1
  ), inserted as (
    insert into public.usage_records(organization_id,meter_code,quantity,occurred_at,idempotency_key,source_type)
    select d.organization_id,'active_units',(
      select count(*) from public.units u
      where u.organization_id=d.organization_id and u.archived_at is null and u.operational_status<>'retired'
    ),v_sample_at,d.sample_key,'platform_billing_daily'
    from (select * from due order by organization_id limit p_limit) d
    on conflict (organization_id,meter_code,idempotency_key) do nothing
    returning 1
  )
  select (select count(*) from inserted),(select count(*)>p_limit from due) into v_sampled,v_has_more;

  return jsonb_build_object('sampled',v_sampled,'hasMore',v_has_more);
end;
$$;
revoke all on function public.sample_platform_billing_usage(text,integer) from public,anon,authenticated;
grant execute on function public.sample_platform_billing_usage(text,integer) to service_role;

commit;
