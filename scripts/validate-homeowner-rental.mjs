import { randomUUID } from "node:crypto";

export async function validateHomeownerRental(db, { assert, expectDatabaseError, createOrganizationAsServer }) {
  const actor = "e1000000-0000-4000-8000-000000000001";
  const outsider = "e1000000-0000-4000-8000-000000000002";
  await db.exec(`reset role; insert into auth.users(id) values ('${actor}'),('${outsider}')`);
  const binding = "operator_terms@0.1.0-draft+privacy_notice@0.1.0-draft#0123456789abcdef";
  const makeOrg = async (name, path = "self_managing") => (await createOrganizationAsServer(db, actor,
    `'${name}','${name}','${path}','US','en-US','America/New_York','${binding}','homeowner-${name}'`)).rows[0].result.organizationId;
  const org = await makeOrg("homeowner-alpha");
  const otherOrg = await makeOrg("homeowner-beta");
  const professionalOrg = await makeOrg("homeowner-professional", "property_manager");
  const act = async (id = actor) => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${id}'`);
  await act();
  const details = {
    property: { kind: "new", accountingBookId: null, legalName: "Homeowner Test", entityType: "individual",
      name: "My home", addressLine1: "123 Test Street", addressLine2: "", locality: "Test City",
      subdivisionCode: "VA", postalCode: "22000", countryCode: "US", timeZone: "America/New_York" },
    space: { name: "Basement", type: "basement", bedrooms: 1, bathrooms: 1,
      entrance: "private", kitchen: "shared", bathroom: "private", laundry: "shared",
      utilitiesNotes: "Water included", parkingNotes: "One driveway space" },
  };
  const call = async (organizationId, payload = details, key = randomUUID()) =>
    (await db.query("select public.create_homeowner_rental($1,$2::jsonb,$3) as r", [organizationId, JSON.stringify(payload), key])).rows[0].r;
  const key = randomUUID();
  const created = await call(org, details, key);
  assert(created.unitId && created.propertyId && created.accountingBookId, "Rental setup did not return complete anchors.");
  const replay = await call(org, details, key);
  assert(JSON.stringify(replay) === JSON.stringify(created), "Rental setup replay created different resources.");
  await expectDatabaseError(() => call(org, { ...details, space: { ...details.space, name: "Different" } }, key), "IDEMPOTENCY_CONFLICT");
  const context = (await db.query("select public.list_operator_organizations() as r")).rows[0].r;
  assert(context.organizations.find((row) => row.organizationId === org)?.customerPath === "self_managing", "Switcher omitted self-managing path.");
  assert(context.organizations.find((row) => row.organizationId === professionalOrg)?.customerPath === "property_manager", "Professional path was overwritten.");
  const unit = (await db.query("select rental_details from public.units where id=$1", [created.unitId])).rows[0];
  assert(unit.rental_details.kitchen === "shared" && unit.rental_details.entrance === "private", "Private/shared space descriptors were not persisted.");
  await expectDatabaseError(() => db.query("update public.units set rental_details='{}' where id=$1", [created.unitId]), "permission denied");
  await expectDatabaseError(() => call(professionalOrg), "SELF_MANAGING_WORKSPACE_REQUIRED");
  await expectDatabaseError(() => call(otherOrg, { property: { kind: "existing", propertyId: created.propertyId }, space: details.space }), "PROPERTY_SCOPE_DENIED");
  await expectDatabaseError(() => call(otherOrg, { ...details, property: { ...details.property, accountingBookId: created.accountingBookId } }), "ACCOUNTING_BOOK_SCOPE_DENIED");
  const second = await call(org, { property: { kind: "existing", propertyId: created.propertyId }, space: { ...details.space, name: "Upstairs room", type: "room" } });
  assert(second.propertyId === created.propertyId && second.accountingBookId === created.accountingBookId, "Adding another space duplicated its property or book.");
  const third = await call(org, { ...details, property: { ...details.property, accountingBookId: created.accountingBookId, name: "Second home", addressLine1: "456 Test Street" } });
  assert(third.accountingBookId === created.accountingBookId && third.operatingEntityId === created.operatingEntityId && third.propertyId !== created.propertyId, "Explicit rental-account reuse created another account or reused the wrong property.");
  await expectDatabaseError(() => call(org, { ...details, property: { ...details.property, timeZone: "Not/A_Zone" } }), "INVALID_PROPERTY");
  await expectDatabaseError(() => call(org, { ...details, space: { ...details.space, bedrooms: 1.7 } }), "INVALID_ROOM_COUNT");
  await expectDatabaseError(() => call(org, { ...details, space: { ...details.space, kitchen: "public" } }), "INVALID_SPACE_ACCESS");
  await expectDatabaseError(() => call(org, { ...details, publish: true }), "INVALID_RENTAL_DETAILS");
  await act(outsider);
  await expectDatabaseError(() => call(org), "ORGANIZATION_SCOPE_DENIED");
  assert((await db.query("select id from public.units where organization_id=$1", [org])).rows.length === 0, "Rental details leaked to outsider.");
  await db.exec("reset role; set role anon");
  await expectDatabaseError(() => call(org), "permission denied");
  await db.exec("reset role");
  const receipt = (await db.query("select expires_at::text as expiry from private.idempotency_records where organization_id=$1 and route='CreateHomeownerRental' and idempotency_key=$2", [org,key])).rows[0];
  assert(receipt.expiry === "infinity", "Setup receipts can expire and permit duplicate late retries.");
  const counts = async () => (await db.query(`select
    (select count(*)::int from public.operating_entities where organization_id=$1) as entities,
    (select count(*)::int from public.accounting_books where organization_id=$1) as books,
    (select count(*)::int from public.properties where organization_id=$1) as properties,
    (select count(*)::int from public.units where organization_id=$1) as units,
    (select count(*)::int from audit.audit_events where organization_id=$1) as audits,
    (select count(*)::int from private.outbox_events where organization_id=$1) as events,
    (select count(*)::int from private.idempotency_records where organization_id=$1) as operations`, [org])).rows[0];
  const before = await counts();
  const limits = (await db.query("select plan_code,limit_value from public.plan_entitlements where feature_code='core.unit'")).rows;
  await db.exec("update public.plan_entitlements set limit_value=0 where feature_code='core.unit'");
  await act();
  await expectDatabaseError(() => call(org, { ...details, property: { ...details.property, legalName: "Another operator" }, space: { ...details.space, name: "Blocked room" } }), "PLAN_LIMIT_EXCEEDED");
  await db.exec("reset role");
  assert(JSON.stringify(await counts()) === JSON.stringify(before), "Unit-cap rejection left partial setup, audit, or idempotency rows.");
  for (const row of limits) await db.query("update public.plan_entitlements set limit_value=$1 where plan_code=$2 and feature_code='core.unit'", [row.limit_value,row.plan_code]);
  const traces = (await db.query(`select
    (select count(*)::int from audit.audit_events where resource_id=$1 and action_code='homeowner_rental.created') as audits,
    (select count(*)::int from private.outbox_events where aggregate_id=$1 and event_type='homeowner_rental.created') as events`, [created.unitId])).rows[0];
  assert(traces.audits === 1 && traces.events === 1, "Rental setup traces are missing or duplicated on retry.");
  const membership = (await db.query("select id from public.organization_memberships where organization_id=$1 and user_id=$2", [org,actor])).rows[0].id;
  await db.query("update public.organization_memberships set role_code='property_manager' where id=$1", [membership]);
  await db.query("insert into public.membership_property_scopes(organization_id,membership_id,property_id) values($1,$2,$3)", [org,membership,created.propertyId]);
  await act();
  await expectDatabaseError(() => call(org), "ORGANIZATION_SCOPE_DENIED");
  await db.exec("reset role");
  await db.query("delete from public.membership_property_scopes where membership_id=$1", [membership]);
  await db.query("update public.organization_memberships set role_code='org_owner' where id=$1", [membership]);
  await db.query("delete from private.idempotency_records where organization_id=$1 and idempotency_key like $2", [org,`HR:${key}:%`]);
  await act();
  assert((await call(org, details, key)).unitId === created.unitId, "Late replay duplicated setup after child receipts were cleaned up.");
  await db.exec("reset role");
  await db.query("update public.organization_memberships set starts_at=now()-interval '2 days',ends_at=now()-interval '1 second' where organization_id=$1 and user_id=$2", [org,actor]);
  await act();
  await expectDatabaseError(() => call(org, details, key), "ORGANIZATION_SCOPE_DENIED");
  const revoked = (await db.query("select public.list_operator_organizations() as r")).rows[0].r;
  assert(!revoked.organizations.some((row) => row.organizationId === org), "Expired membership remains in the workspace switcher.");
  await db.exec("reset role");
  return { rentalSpaces: 3, scopedStaffDenied: true, atomicRollback: true, durableReplay: true, crossOrganizationDenied: true, expiredMembershipDenied: true };
}
