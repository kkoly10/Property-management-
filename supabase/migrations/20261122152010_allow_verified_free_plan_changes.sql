begin;

create function public.choose_platform_free_plan(p_actor_user_id uuid,p_actor_aal text,p_organization_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_subscription public.organization_subscriptions%rowtype;
  v_correlation uuid := gen_random_uuid();
  v_change jsonb;
begin
  if p_actor_aal is distinct from 'aal2' then raise exception using errcode='42501',message='MFA_REQUIRED'; end if;
  if not private.is_platform_billing_manager(p_actor_user_id,p_organization_id) then
    raise exception using errcode='42501',message='BILLING_SCOPE_DENIED';
  end if;

  -- Take the staff lock before inventory billing locks, in the same order as staff invitation.
  perform private.lock_authority_write('staff',p_organization_id);
  perform 1 from public.organizations o where o.id=p_organization_id for no key update;
  if not private.is_platform_billing_manager(p_actor_user_id,p_organization_id)
     or not exists (
       select 1 from public.organization_memberships m
       where m.organization_id=p_organization_id and m.user_id=p_actor_user_id
         and m.status='active' and m.role_code in ('org_owner','org_admin')
         and m.starts_at<=clock_timestamp() and (m.ends_at is null or m.ends_at>clock_timestamp())
     ) then raise exception using errcode='42501',message='BILLING_SCOPE_DENIED'; end if;

  if exists (
    select 1 from private.platform_billing_attempts a where a.organization_id=p_organization_id
      and (a.status<>'expired' or a.stripe_subscription_id is not null)
  ) or exists (
    select 1 from private.platform_billing_customers c where c.organization_id=p_organization_id
  ) or exists (
    select 1 from public.organization_subscriptions s where s.organization_id=p_organization_id
      and (s.provider_customer_id is not null or s.provider_subscription_id is not null)
  ) then raise exception using errcode='23514',message='BILLING_FREE_REVIEW_REQUIRED'; end if;

  select * into v_subscription from public.organization_subscriptions s
  where s.organization_id=p_organization_id and s.status<>'canceled'
  order by s.created_at desc,s.id desc limit 1 for update;
  if not found then raise exception using errcode='23514',message='BILLING_FREE_REVIEW_REQUIRED'; end if;
  if v_subscription.plan_code='free' and v_subscription.status='active' then
    return jsonb_build_object('status','free','replayed',true);
  end if;
  if v_subscription.plan_code<>'growth' or v_subscription.status<>'trialing' then
    raise exception using errcode='23514',message='BILLING_FREE_REVIEW_REQUIRED';
  end if;
  if (select count(*) from public.units u where u.organization_id=p_organization_id
      and u.archived_at is null and u.operational_status<>'retired')>1
    or (select count(*) from public.organization_memberships m where m.organization_id=p_organization_id
      and m.status in ('invited','active','suspended') and (m.ends_at is null or m.ends_at>statement_timestamp()))>1 then
    raise exception using errcode='23514',message='BILLING_PLAN_LIMIT_EXCEEDED';
  end if;

  -- Keep the original trial deadline as history. A repeat has no new billing effect.
  update public.organization_subscriptions set plan_code='free',status='active',
    current_period_start=null,current_period_end=null,updated_at=now()
  where id=v_subscription.id;
  v_change := jsonb_build_object('organizationId',p_organization_id,'fromPlan','growth',
    'toPlan','free','effectiveMode','immediate');
  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data)
  values (p_organization_id,p_actor_user_id,'user','billing.subscriptionFreeSelected','organization_subscription',
    v_subscription.id,v_correlation,v_change);
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (p_organization_id,'subscription.change_requested','organization_subscription',v_subscription.id,v_correlation,v_change);
  return jsonb_build_object('status','free','replayed',false);
end;
$$;
revoke all on function public.choose_platform_free_plan(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.choose_platform_free_plan(uuid,text,uuid) to service_role;

create or replace function private.guard_portfolio_billing_growth()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_subscription record;
begin
  -- Serialize unit reactivation and imports with the Free capacity check.
  select s.status,s.trial_ends_at,s.plan_code into v_subscription from public.organization_subscriptions s
  where s.organization_id=new.organization_id
  order by (s.status<>'canceled') desc,s.created_at desc,s.id desc limit 1 for update;
  if not found or not private.billing_allows_growth(v_subscription.status,v_subscription.trial_ends_at) then
    raise exception using errcode='23514',message='PLAN_UNAVAILABLE';
  end if;
  if tg_table_name='units' and v_subscription.plan_code='free' and exists (
    select 1 from public.units u where u.organization_id=new.organization_id
      and u.archived_at is null and u.operational_status<>'retired'
  ) then raise exception using errcode='23514',message='PLAN_LIMIT_EXCEEDED'; end if;
  return new;
end;
$$;

create function private.enforce_free_staff_capacity()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_plan text;
begin
  select s.plan_code into v_plan from public.organization_subscriptions s
  where s.organization_id=new.organization_id and s.status<>'canceled'
  order by s.created_at desc,s.id desc limit 1 for update;
  if v_plan='free' and exists (
    select 1 from public.organization_memberships m
    where m.organization_id=new.organization_id and m.id<>new.id
      and m.status in ('invited','active','suspended') and (m.ends_at is null or m.ends_at>statement_timestamp())
  ) then raise exception using errcode='23514',message='PLAN_LIMIT_EXCEEDED'; end if;
  return new;
end;
$$;
revoke all on function private.enforce_free_staff_capacity() from public,anon,authenticated,service_role;
create trigger staff_free_capacity_insert before insert on public.organization_memberships
  for each row when (
    new.status in ('invited','active','suspended') and (new.ends_at is null or new.ends_at>statement_timestamp())
  ) execute function private.enforce_free_staff_capacity();
create trigger staff_free_capacity_update before update of status,ends_at,organization_id on public.organization_memberships
  for each row when (
    new.status in ('invited','active','suspended') and (new.ends_at is null or new.ends_at>statement_timestamp())
    and (old.status='revoked' or old.ends_at<=statement_timestamp() or old.organization_id<>new.organization_id)
  ) execute function private.enforce_free_staff_capacity();

commit;
