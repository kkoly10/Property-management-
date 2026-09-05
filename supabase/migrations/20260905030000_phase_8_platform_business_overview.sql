begin;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- The founder's view of the whole business.
--
-- Everything on the platform control plane so far answers "what is happening inside THIS customer",
-- and every one of those reads is gated on an active, time-boxed support session for that one
-- organization. There was no way to ask the other question -- "how is Crecy doing" -- so nobody could
-- see how many customers exist, which trials are about to lapse, or whether the workers are healthy.
--
-- This is deliberately NOT a support query, so it does not take a support session: a session is a
-- justified, audited grant to look at one named customer's data, and widening that concept to cover
-- an aggregate over all customers would corrupt the thing that makes it meaningful. It is gated
-- instead on being an active platform ADMIN (not merely a support agent -- a contractor answering
-- tickets has no business reading the company's numbers) plus a fresh AAL2 step-up, and every call
-- writes an audit row with a null organization_id, which is how a platform-scoped action is recorded.
--
-- ON REVENUE: this reports no MRR or ARR, because there is no price anywhere in this database to
-- compute one from -- public.plan_catalog carries a code, a display name and an active flag, and
-- nothing else. Paid billing is a paid-launch gate. A revenue figure here would be a number I made
-- up, sitting on the founder's dashboard looking authoritative. What IS reported is money that
-- genuinely moved through the ledger, under names that say exactly what they mean:
--
--   billed       sum of every charge that was not voided
--   collected    sum of payments that reached 'succeeded'
--   outstanding  billed-but-unpaid, net of live allocations -- NOT the face value of open charges,
--                which would overstate every partially paid one
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.platform_business_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dto jsonb;
  v_correlation_id uuid := gen_random_uuid();
begin
  if (select auth.uid()) is null then
    raise exception using errcode='28000', message='AUTHENTICATION_REQUIRED';
  end if;
  if not private.is_platform_admin() then
    raise exception using errcode='42501', message='NOT_PLATFORM_ADMIN';
  end if;
  if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
    raise exception using errcode='42501', message='MFA_STEP_UP_REQUIRED';
  end if;

  select jsonb_build_object(
    'generatedAt', now(),

    'customers', jsonb_build_object(
      'total', (select count(*) from public.organizations),
      'byStatus', (select coalesce(jsonb_object_agg(t.status, t.c), '{}'::jsonb)
                   from (select o.status, count(*) c from public.organizations o group by o.status) t),
      'newLast7Days', (select count(*) from public.organizations o where o.created_at >= now() - interval '7 days'),
      'newLast30Days', (select count(*) from public.organizations o where o.created_at >= now() - interval '30 days')
    ),

    'plans', jsonb_build_object(
      'mix', (select coalesce(jsonb_agg(jsonb_build_object('planCode', t.plan_code, 'status', t.status, 'count', t.c)
                              order by t.plan_code, t.status), '[]'::jsonb)
              from (select s.plan_code, s.status, count(*) c
                    from public.organization_subscriptions s group by s.plan_code, s.status) t),
      -- The list a founder acts on this week, not a statistic.
      'trialsEndingSoon', (select coalesce(jsonb_agg(jsonb_build_object(
                              'organizationId', o.id, 'displayName', o.display_name,
                              'planCode', s.plan_code, 'trialEndsAt', s.trial_ends_at) order by s.trial_ends_at), '[]'::jsonb)
                           from public.organization_subscriptions s
                           join public.organizations o on o.id = s.organization_id
                           where s.status = 'trialing' and s.trial_ends_at is not null
                             and s.trial_ends_at <= now() + interval '14 days')
    ),

    'portfolio', jsonb_build_object(
      'properties', (select count(*) from public.properties),
      'units', (select count(*) from public.units),
      'activeTenancies', (select count(*) from public.tenancies t where t.status = 'active'),
      'activeStaff', (select count(*) from public.organization_memberships m where m.status = 'active')
    ),

    'money', jsonb_build_object(
      'chargesByStatus', (select coalesce(jsonb_object_agg(t.status, t.c), '{}'::jsonb)
                          from (select c.status::text as status, count(*) c from public.charges c group by c.status) t),
      'paymentsByStatus', (select coalesce(jsonb_object_agg(t.status, t.c), '{}'::jsonb)
                           from (select p.status::text as status, count(*) c from public.payments p group by p.status) t),
      'billedMinorByCurrency', (select coalesce(jsonb_object_agg(t.currency_code, t.total), '{}'::jsonb)
                                from (select c.currency_code, sum(c.amount_minor) total
                                      from public.charges c where c.status <> 'voided' group by c.currency_code) t),
      'collectedMinorByCurrency', (select coalesce(jsonb_object_agg(t.currency_code, t.total), '{}'::jsonb)
                                   from (select p.currency_code, sum(p.amount_minor) total
                                         from public.payments p where p.status = 'succeeded' group by p.currency_code) t),
      -- Net of live allocations, so a partially paid charge contributes only what is still owed.
      'outstandingMinorByCurrency', (select coalesce(jsonb_object_agg(t.currency_code, t.total), '{}'::jsonb)
                                     from (select c.currency_code,
                                                  sum(c.amount_minor - coalesce((
                                                    select sum(a.amount_minor) from public.payment_allocations a
                                                    where a.charge_id = c.id and a.reversed_at is null), 0)) total
                                           from public.charges c
                                           where c.status in ('open','partially_paid') group by c.currency_code) t)
    ),

    -- What an operator needs to know is broken before a customer tells them.
    'operations', jsonb_build_object(
      'notificationJobsByStatus', (select coalesce(jsonb_object_agg(t.status, t.c), '{}'::jsonb)
                                   from (select j.status, count(*) c from private.notification_jobs j group by j.status) t),
      'documentsQuarantined', (select count(*) from public.document_versions v where v.upload_status = 'quarantined'),
      'documentsRejected', (select count(*) from public.document_versions v where v.upload_status = 'rejected'),
      'chargeRunsByState', (select coalesce(jsonb_object_agg(t.state, t.c), '{}'::jsonb)
                            from (select r.state, count(*) c from private.charge_generation_runs r group by r.state) t),
      'lastCompletedChargeRunAt', (select max(r.completed_at) from private.charge_generation_runs r where r.state = 'completed'),
      'openSupportSessions', (select count(*) from private.support_sessions s where s.status = 'active' and s.expires_at > now())
    )
  ) into v_dto;

  -- A platform-scoped action: no single organization owns it, and audit.audit_events.organization_id
  -- is nullable precisely so one can be recorded. Reading every customer's numbers at once leaves a
  -- trace, exactly as reading one customer's does.
  insert into audit.audit_events(
    organization_id, actor_user_id, actor_type, action_code, resource_type, resource_id, correlation_id, after_data
  ) values (
    null, (select auth.uid()), 'support', 'platform.viewedBusinessOverview', 'platform', null, v_correlation_id,
    jsonb_build_object('queryType', 'business_overview')
  );

  return v_dto;
end;
$$;
revoke all on function public.platform_business_overview() from public, anon;
grant execute on function public.platform_business_overview() to authenticated;

commit;
