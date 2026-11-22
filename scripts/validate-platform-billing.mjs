import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function validatePlatformBilling(db) {
  const organizationId = randomUUID();
  const owner = randomUUID();
  const outsider = randomUUID();
  const account = "acct_Saas" + organizationId.replaceAll("-", "");
  const price = "price_ProFixture";
  const subscription = "sub_SaasFixture";
  const customer = "cus_SaasFixture";
  const session = "cs_test_SaasFixture";
  const property = randomUUID();
  const entity = randomUUID();
  const book = randomUUID();
  const freeOrganization = randomUUID();
  async function result(sql, params = []) {
    return (await db.query(sql, params)).rows[0].result;
  }
  const workspace = () => result("select public.get_platform_billing_workspace($1) as result", [organizationId]);
  const prepare = (aal = "aal2", actor = owner, plan = "pro", interval = "month", country = "CA") => result(
    "select public.prepare_platform_billing_checkout($1,$2,$3,$4,$5,$6,$7,$8) as result",
    [actor, aal, organizationId, account, country, plan, interval, price],
  );
  const claim = (eventId, attemptId = null) => result(
    "select public.claim_platform_billing_event($1,$2,'invoice.paid',$3,$4) as result",
    [account, eventId, subscription, attemptId],
  );
  const apply = (eventId, reservation, status, paid, sub = subscription, cancel = false) => result(
    "select public.apply_platform_billing_event($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now()+interval '30 days',$10) as result",
    [account, eventId, reservation.attemptId, reservation.generation, sub, customer, price, status, paid, cancel],
  );
  const state = () => result(
    "select jsonb_build_object('plan',plan_code,'status',status,'providerCustomer',provider_customer_id,'providerSubscription',provider_subscription_id) as result "
      + "from public.organization_subscriptions where organization_id=$1",
    [organizationId],
  );
  const sample = () => result("select public.sample_platform_billing_usage($1,10) as result", [account]);
  const chooseFree = (org = organizationId, aal = "aal2") => result(
    "select public.choose_platform_free_plan($1,$2,$3) as result", [owner, aal, org],
  );
  const addUnit = (unitCode) => result(
    "insert into public.units(organization_id,property_id,unit_code) values($1,$2,$3) returning id as result",
    [organizationId, property, unitCode],
  );
  const canManageOwners = (historical) => result(
    "select private.has_plan_entitlement($1,'portal.owner.standard',$2) as result", [organizationId, historical],
  );

  await db.exec("reset role");
  await db.query("insert into auth.users(id,email) values ($1,$2),($3,$4)",
    [owner, "billing-owner@example.invalid", outsider, "billing-outsider@example.invalid"]);
  await db.query(
    "insert into public.organizations(id,display_name,slug,headquarters_country_code,default_locale,default_time_zone,customer_path,created_by) "
      + "values ($1,'Billing test workspace',$2,'CA','en-CA','America/Toronto','property_manager',$3)",
    [organizationId, "test-billing-" + organizationId, owner],
  );
  await db.query(
    "insert into public.organization_memberships(organization_id,user_id,role_code,status) values ($1,$2,'org_owner','active')",
    [organizationId, owner],
  );
  await db.query(
    "insert into public.organization_subscriptions(organization_id,plan_code,country_price_book,trial_ends_at) values($1,'growth','CA',now()+interval '30 days')",
    [organizationId],
  );
  await db.query("insert into public.organizations(id,display_name,slug,headquarters_country_code,default_locale,default_time_zone,customer_path,created_by) "
    + "values ($1,'Free test workspace',$2,'CA','en-CA','America/Toronto','property_manager',$3)",
  [freeOrganization, "test-free-" + freeOrganization, owner]);
  await db.query("insert into public.organization_memberships(organization_id,user_id,role_code,status) values ($1,$2,'org_owner','active')",
    [freeOrganization, owner]);
  await db.query("insert into public.organization_subscriptions(organization_id,plan_code,country_price_book,trial_ends_at) "
    + "values($1,'growth','CA',now()-interval '1 day')", [freeOrganization]);
  await db.query("insert into public.operating_entities(id,organization_id,legal_name,display_name,country_code,entity_type,created_by) "
    + "values($1,$2,'Synthetic entity','Synthetic entity','CA','company',$3)", [entity, organizationId, owner]);
  await db.query("insert into public.accounting_books(id,organization_id,operating_entity_id,name,functional_currency_code) "
    + "values($1,$2,$3,'Operations','CAD')", [book, organizationId, entity]);
  await db.query("insert into public.properties(id,organization_id,operating_entity_id,accounting_book_id,country_profile_id,name,property_type,country_code,address_line1,time_zone) "
    + "values($1,$2,$3,$4,(select id from public.country_profiles where country_code='CA' limit 1),'Synthetic home','single_family','CA','Test fixture only','America/Toronto')",
  [property, organizationId, entity, book]);
  const firstUnit = await addUnit("fixture-unit-one");

  try {
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${outsider}'`);
    await assert.rejects(workspace, /BILLING_SCOPE_DENIED/);
    await assert.rejects(prepare, /permission denied/);
    await db.exec(`set request.jwt.claim.sub='${owner}'; set crecy.active_organization_id='${outsider}'`);
    await assert.rejects(workspace, /BILLING_SCOPE_DENIED/);
    await db.exec("reset crecy.active_organization_id");
    const initial = await workspace();
    assert.equal(initial.status, "trialing");
    assert.equal(initial.plan, "growth");
    assert.equal(initial.country, "CA");
    assert.equal(initial.portalAvailable, false);
    assert.equal("customerId" in initial, false);
    await assert.rejects(() => db.query("select * from private.platform_billing_attempts"), /permission denied/);
    await assert.rejects(sample, /permission denied/);
    await assert.rejects(() => chooseFree(freeOrganization), /permission denied/);

    await db.exec("reset role");
    const secondUnit = await addUnit("fixture-unit-two");
    await db.exec("set role service_role");
    await assert.rejects(chooseFree, /BILLING_PLAN_LIMIT_EXCEEDED/);
    await db.exec("reset role");
    await db.query("update public.units set archived_at=now() where id=$1", [secondUnit]);
    const oldStaff = randomUUID();
    await db.query("insert into public.organization_memberships(id,organization_id,user_id,role_code,status,starts_at,ends_at) "
      + "values ($1,$2,$3,'property_manager','active',now()-interval '3 days',now()+interval '1 day')",
    [oldStaff, freeOrganization, outsider]);
    await db.exec("set role service_role");
    await assert.rejects(() => chooseFree(freeOrganization, "aal1"), /MFA_REQUIRED/);
    await assert.rejects(() => chooseFree(freeOrganization), /BILLING_PLAN_LIMIT_EXCEEDED/);
    await db.exec("reset role");
    await db.query("update public.organization_memberships set ends_at=now()-interval '1 day' where id=$1", [oldStaff]);
    await db.exec("set role service_role");
    const expiring = await result("select public.prepare_platform_billing_checkout($1,'aal2',$2,$3,'CA','pro','month',$4) as result",
      [owner, freeOrganization, account, price]);
    await assert.rejects(() => chooseFree(freeOrganization), /BILLING_FREE_REVIEW_REQUIRED/);
    assert.equal(await result("select public.record_platform_billing_checkout($1,$2,'cs_test_ExpiredFixture',true) as result",
      [expiring.attemptId, account]), true);
    assert.deepEqual(await chooseFree(freeOrganization), { status: "free", replayed: false });
    assert.deepEqual(await chooseFree(freeOrganization), { status: "free", replayed: true });
    await db.exec("reset role");
    await assert.rejects(() => db.query("update public.organization_memberships set ends_at=null where id=$1", [oldStaff]), /PLAN_LIMIT_EXCEEDED/);
    assert.equal(await result("select count(*)::integer as result from audit.audit_events where organization_id=$1 and action_code='billing.subscriptionFreeSelected'", [freeOrganization]), 1);
    await db.exec("set role authenticated");
    const freeWorkspace = await result("select public.get_platform_billing_workspace($1) as result", [freeOrganization]);
    assert.equal(freeWorkspace.plan, "free");
    assert.equal(freeWorkspace.status, "active");

    await db.exec("reset role");
    await db.query("update public.organization_subscriptions set trial_ends_at=now()-interval '1 minute' where organization_id=$1", [organizationId]);
    await assert.rejects(() => addUnit("expired-trial"), /PLAN_UNAVAILABLE/);
    assert.equal(await canManageOwners(false), false);
    assert.equal(await canManageOwners(true), true);
    await db.exec("set role authenticated");
    assert.equal((await workspace()).status, "trial_ended");

    await db.exec("reset role; set role service_role");
    await assert.rejects(() => prepare("aal1"), /MFA_REQUIRED/);
    await assert.rejects(() => prepare("aal2", outsider), /BILLING_SCOPE_DENIED/);
    await assert.rejects(() => prepare("aal2", owner, "starter"), /BILLING_DOWNGRADE_UNAVAILABLE/);
    await assert.rejects(() => prepare("aal2", owner, "pro", "month", "US"), /BILLING_PRICE_BOOK_MISMATCH/);
    const reservation = await prepare();
    await assert.rejects(chooseFree, /BILLING_FREE_REVIEW_REQUIRED/);
    assert.deepEqual(await prepare(), reservation);
    assert.equal(reservation.sessionId, null);
    await assert.rejects(() => prepare("aal2", owner, "pro", "year"), /BILLING_CHECKOUT_PENDING/);

    await db.exec("reset role");
    await db.query("update private.platform_billing_attempts set created_at=now()-interval '21 hours' where id=$1", [reservation.attemptId]);
    await db.exec("set role service_role");
    await assert.rejects(prepare, /BILLING_CHECKOUT_RECONCILIATION_REQUIRED/);
    assert.equal(await result("select public.record_platform_billing_checkout($1,$2,$3,false) as result",
      [reservation.attemptId, account, session]), true);
    assert.equal((await prepare()).sessionId, session);

    const old = await claim("evt_Original", reservation.attemptId);
    const current = await claim("evt_Current", reservation.attemptId);
    assert.equal(await apply("evt_Original", old, "active", true), false);
    await assert.rejects(() => apply("evt_Current", current, "active", true, "sub_Other"), /BILLING_SUBSCRIPTION_BINDING_MISMATCH/);
    assert.equal(await apply("evt_Current", current, "active", false), true);
    await db.exec("reset role");
    assert.deepEqual(await state(), { plan: "growth", status: "trialing", providerCustomer: null, providerSubscription: null });

    await db.exec("set role service_role");
    assert.equal(await claim("evt_Current"), null);
    const paid = await claim("evt_Paid");
    assert.equal(await apply("evt_Paid", paid, "active", true), true);
    assert.equal(await apply("evt_Paid", paid, "active", true), true);
    await assert.rejects(prepare, /BILLING_SUBSCRIPTION_EXISTS/);
    const portal = () => result("select public.prepare_platform_billing_portal($1,'aal2',$2,$3) as result", [owner, organizationId, account]);
    assert.equal(await portal(), customer);
    await db.exec("reset role");
    assert.deepEqual(await state(), { plan: "pro", status: "active", providerCustomer: null, providerSubscription: null });
    assert.equal(await canManageOwners(false), true);
    await db.exec("set role service_role");
    assert.deepEqual(await sample(), { sampled: 1, hasMore: false });
    assert.deepEqual(await sample(), { sampled: 0, hasMore: false });
    await db.exec("reset role");
    assert.equal(await result("select quantity::int as result from public.usage_records where organization_id=$1 and source_type='platform_billing_daily'", [organizationId]), 1);
    await db.query("update public.units set archived_at=now() where id=$1", [firstUnit]);
    await db.exec("set role service_role");
    assert.deepEqual(await sample(), { sampled: 0, hasMore: false });
    await db.exec("reset role");
    assert.equal(await result("select quantity::int as result from public.usage_records where organization_id=$1 and source_type='platform_billing_daily'", [organizationId]), 1);

    await db.exec("set role service_role");
    const failed = await claim("evt_FailedRenewal");
    assert.equal(await apply("evt_FailedRenewal", failed, "past_due", false), true);
    await db.exec("reset role");
    assert.equal((await state()).status, "past_due");
    await db.exec("set role service_role");
    const ending = await claim("evt_ScheduledEnd");
    assert.equal(await apply("evt_ScheduledEnd", ending, "active", true, subscription, true), true);
    await db.exec("reset role; set role authenticated");
    assert.equal((await workspace()).cancelAtPeriodEnd, true);
    await db.exec("reset role; set role service_role");
    const canceled = await claim("evt_Canceled");
    assert.equal(await apply("evt_Canceled", canceled, "canceled", true), true);
    assert.equal(await claim("evt_LateOlderDelivery"), null);
    await assert.rejects(chooseFree, /BILLING_FREE_REVIEW_REQUIRED/);
    await db.exec("reset role");
    assert.equal((await state()).status, "restricted");
    await assert.rejects(() => addUnit("after-cancellation"), /PLAN_UNAVAILABLE/);
    await assert.rejects(() => db.query("update public.units set archived_at=null where id=$1", [firstUnit]), /PLAN_UNAVAILABLE/);
    assert.equal(await canManageOwners(false), false);
    assert.equal(await canManageOwners(true), true);
    const counts = await result("select jsonb_build_object("
      + "'audits',(select count(*) from audit.audit_events where organization_id=$1 and action_code='billing.subscriptionSynced'),"
      + "'outbox',(select count(*) from private.outbox_events where organization_id=$1 and event_type='billing.subscriptionSynced')) as result",
    [organizationId]);
    assert.deepEqual(counts, { audits: 5, outbox: 5 });
    await db.exec("set role authenticated");
    assert.equal((await workspace()).status, "canceled");
    await db.exec("reset role; set role service_role");
    const replacement = await prepare();
    assert.notEqual(replacement.attemptId, reservation.attemptId);
    assert.equal(replacement.customerId, customer);
  } finally {
    await db.exec("reset role; reset request.jwt.claim.sub; reset crecy.active_organization_id");
  }
}
