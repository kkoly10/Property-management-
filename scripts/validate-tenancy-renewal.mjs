import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function validateTenancyRenewal(db, { assert, expectDatabaseError, createOrganizationAsServer }) {
  await db.exec("reset role");
  await db.exec(await readFile(new URL("../supabase/migrations/20261122153344_record_same_tenancy_renewal.sql", import.meta.url), "utf8"));
  const [owner, resident, stranger] = Array.from({ length: 3 }, () => randomUUID());
  await db.query(`insert into auth.users(id,email) values($1,'renewal-owner@example.com'),
    ($2,'renewal-resident@example.com'),($3,'renewal-stranger@example.com')`, [owner, resident, stranger]);
  const { organizationId } = (await createOrganizationAsServer(db, owner,
    "'Renewal Workspace','renewal-workspace','self_managing','US','en-US','Etc/GMT+12','operator_terms@0.1.0-draft+privacy_notice@0.1.0-draft#0123456789abcdef','renewal-workspace-create'",
  )).rows[0].result;
  const act = (id = owner) => db.exec("reset role; set role authenticated; set request.jwt.claim.sub='" + id + "'");
  const rpc = async (name, placeholders, values = []) => (await db.query(
    "select public." + name + "(" + placeholders + ") as result", values,
  )).rows[0].result;
  const rental = await rpc("create_homeowner_rental", "$1,$2::jsonb,$3", [organizationId, JSON.stringify({
    property: { kind: "new", accountingBookId: null, legalName: "Fixture Owner", entityType: "individual",
      name: "Renewal House", addressLine1: "102 Fixture Road", addressLine2: "", locality: "Richmond",
      subdivisionCode: "VA", postalCode: "23220", countryCode: "US", timeZone: "Etc/GMT+12" },
    space: { name: "Main", type: "apartment", bedrooms: 2, bathrooms: 1, entrance: "private",
      kitchen: "private", bathroom: "private", laundry: "private", utilitiesNotes: "", parkingNotes: "" },
  }), randomUUID()]);
  const { propertyId, unitId } = rental;
  await db.exec("reset role");
  const dates = (await db.query(`select (earliest-30)::text as "priorStart",(latest-1)::text as "priorEnd",
    latest::text as "renewalStart",(latest+75)::text as "renewalEnd",
    (latest+70)::text as "competingStart",(latest+100)::text as "competingEnd"
    from (select (now() at time zone 'Etc/GMT+12')::date as earliest,
      (now() at time zone 'Pacific/Kiritimati')::date as latest) x`)).rows[0];
  const documents = {};
  for (const [role, scan] of [["original", "clean"], ["renewal", "clean"], ["blocked", "quarantined"], ["otherHousehold", "clean"]]) {
    const [id, version] = [randomUUID(), randomUUID()];
    await db.query(`insert into public.documents(id,organization_id,property_id,unit_id,document_type,title,created_by)
      values($1,$2,$3,$4,'signed_lease',$5,$6)`, [id, organizationId, propertyId, unitId, "Fixture " + role, owner]);
    await db.query(`insert into public.document_versions(id,organization_id,document_id,version_number,storage_bucket,
      storage_path,mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status)
      values($1,$2,$3,1,'private-documents',$4,'application/pdf',100,$5,'fixture.pdf',$6,$7)`,
    [version, organizationId, id, "renewal-fixture-" + role + ".pdf", "e".repeat(64), owner, scan]);
    documents[role] = { id, version };
  }
  assert((await db.query("select private.first_renewal_rent_date('monthly','2028-01-31',31::smallint,'2028-02-01')::text as date")).rows[0].date==="2028-02-29",
    "Renewal changed the canonical month-end charge cadence.");
  await act();
  const activate = (name, from, to, first, documentId) => rpc("activate_existing_lease", "$1,$2,$3,$4::jsonb,$5::jsonb,0,$6,$7", [
    organizationId, propertyId, unitId, JSON.stringify({ displayName: name, members: [{
      firstName: name, lastName: "Fixture", email: "renewal-resident@example.com", primaryContact: true, financiallyResponsible: true,
    }] }), JSON.stringify({ source: "operator_supplied", startDate: from, endDate: to,
      rentAmountMinor: 125000, currencyCode: "USD", rentFrequency: "monthly", signedDocumentId: documentId }),
    first, randomUUID(),
  ]);
  // The fixed synthetic offsets straddle a real local date boundary regardless
  // of test time, without changing the workstation or any service clock.
  await db.exec("set time zone 'Etc/GMT+12'");
  const current = await activate("Continuing household", dates.priorStart, dates.priorEnd, dates.priorEnd, documents.original.id);
  await db.exec("reset role; set role service_role");
  const generate = (date, scheduleId, run) => rpc("generate_recurring_charges", "$1,array[$2::uuid],$3", [date, scheduleId, run]);
  assert((await generate(dates.priorEnd, current.chargeScheduleId, "renewal-fixture-prior-run")).generatedCount===1,
    "Original term needs a real posted charge for the continuity check.");
  await db.exec("reset role");
  await db.query(`insert into public.user_relationships(user_id,organization_id,relationship_type,relationship_id)
    select $1,h.organization_id,'resident_person',h.person_id from public.household_members h where h.household_id=$2`,
  [resident, current.householdId]);
  const get = () => rpc("get_tenancy_renewal", "$1,$2", [organizationId, current.tenancyId]);
  const transition = (action, { id = null, prior = null, end = null, first = null, doc = null, confirm = false, key = randomUUID() } = {}) =>
    rpc("transition_tenancy_renewal", "$1,$2,$3,$4,$5,$6,$7,$8,$9,$10",
      [organizationId, current.tenancyId, action, key, id, prior, end, first, doc, confirm]);

  await act(stranger);
  await expectDatabaseError(() => get(), "RENEWAL_TENANCY_NOT_FOUND");
  await act();
  const initial = await get();
  assert(initial.canSchedule && initial.renewalStart===dates.renewalStart && initial.firstContinuingChargeOn>dates.priorEnd,
    "The contiguous renewal and next charge must derive from the recorded term and existing recurrence.");
  const schedule = { prior: current.leaseId, end: dates.renewalEnd, first: initial.firstContinuingChargeOn, doc: documents.renewal.version, confirm: true };
  await expectDatabaseError(() => transition("schedule", { ...schedule, first: dates.renewalStart }), "RENEWAL_FIRST_CHARGE_INVALID");
  await expectDatabaseError(() => transition("schedule", { ...schedule, doc: documents.blocked.version }), "RENEWAL_DOCUMENT_NOT_READY");
  await expectDatabaseError(() => transition("schedule", { ...schedule, confirm: false }), "INVALID_RENEWAL_REQUEST");
  const key = randomUUID();
  const planned = await transition("schedule", { ...schedule, key });
  assert(planned.state==="scheduled" && (await transition("schedule", { ...schedule, key })).renewalId===planned.renewalId,
    "A retry allocated another renewal.");
  await expectDatabaseError(() => transition("schedule", { ...schedule, key, end: dates.competingEnd }), "RENEWAL_RETRY_CONFLICT");
  await expectDatabaseError(() => transition("apply", { id: planned.renewalId }), "RENEWAL_EFFECTIVE_DATE_UNAVAILABLE");
  await expectDatabaseError(() => activate("Other household", dates.competingStart, dates.competingEnd, dates.competingStart, documents.otherHousehold.id),
    "TENANCY_OVERLAP");
  await db.exec("reset role");
  await expectDatabaseError(() => db.query("update public.documents set tenancy_id=$1 where id=$2", [current.tenancyId, documents.renewal.id]),
    "RENEWAL_DOCUMENT_RESERVED");
  const { rows: [plannedEffects] } = await db.query(`select t.lease_id as lease_id,l.end_date::text as lease_end,
    t.possession_end::text as possession_end, (select count(*)::int from public.charge_schedules s where s.tenancy_id=t.id) as schedules
    from public.tenancies t join public.leases l on l.id=t.lease_id where t.id=$1`, [current.tenancyId]);
  assert(plannedEffects.lease_id===current.leaseId && plannedEffects.lease_end===dates.priorEnd && plannedEffects.possession_end===dates.renewalEnd
    && plannedEffects.schedules===1, "Scheduling advanced the old signed term or rent before the effective date.");
  await act();
  assert((await transition("cancel", { id: planned.renewalId })).state==="canceled", "A pending reservation could not be released.");
  assert((await get()).canSchedule, "Canceling the future term did not release the existing lease dates.");
  const confirmed = await transition("schedule", schedule);
  await db.exec("reset role");
  await db.query("update public.properties set time_zone='Pacific/Kiritimati' where id=$1", [propertyId]);
  await act();
  const applyKey = randomUUID();
  const applied = await transition("apply", { id: confirmed.renewalId, key: applyKey });
  assert(applied.state==="effective" && applied.leaseId!==current.leaseId
    && (await transition("apply", { id: confirmed.renewalId, key: applyKey })).leaseId===applied.leaseId,
  "Renewal failed to preserve the exact applied receipt.");
  await expectDatabaseError(() => transition("cancel", { id: confirmed.renewalId }), "RENEWAL_TERM_UNAVAILABLE");

  await act(resident);
  const leaseReads = await db.query("select id from public.leases where id=any(array[$1::uuid,$2::uuid])", [current.leaseId, applied.leaseId]);
  assert(leaseReads.rows.length===2, "The unchanged resident lost access to the original or renewed term.");
  await act(stranger);
  const foreignReads = await db.query("select id from public.leases where id=any(array[$1::uuid,$2::uuid])", [current.leaseId, applied.leaseId]);
  assert(foreignReads.rows.length===0, "Renewal history disclosure crossed household boundaries.");
  await db.exec("reset role");
  const { rows: [effects] } = await db.query(`select t.household_id,t.receivable_account_id,l.supersedes_lease_id,
    prior.end_date::text as original_end,prev.ends_on::text as prior_schedule_end,prev.status as prior_schedule_status,
    s.id as renewal_schedule,s.starts_on::text as renewal_first_charge,d.tenancy_id as document_tenancy,
    (select count(*)::int from public.journal_entries j where j.tenancy_id=t.id) as journal_entries
    from public.tenancies t join public.leases l on l.id=t.lease_id
    join public.leases prior on prior.id=l.supersedes_lease_id
    join public.charge_schedules prev on prev.id=$2
    join public.charge_schedules s on s.tenancy_id=t.id and s.id<>prev.id
    join public.document_versions v on v.id=l.signed_document_version_id join public.documents d on d.id=v.document_id
    where t.id=$1`, [current.tenancyId, current.chargeScheduleId]);
  assert(effects.household_id===current.householdId && effects.receivable_account_id===current.receivableAccountId
    && effects.supersedes_lease_id===current.leaseId && effects.original_end===dates.priorEnd && effects.prior_schedule_end===dates.priorEnd
    && effects.prior_schedule_status==="ended" && effects.renewal_first_charge===initial.firstContinuingChargeOn
    && effects.document_tenancy===current.tenancyId && effects.journal_entries===2,
  "Renewal changed a party, account, old lease, posted ledger, or scheduled cutoff.");
  await db.exec("set role service_role");
  assert((await generate(initial.firstContinuingChargeOn, effects.renewal_schedule, "renewal-fixture-continuing-run")).generatedCount===1,
    "The existing charge worker did not continue the already-confirmed rent schedule.");
  await db.exec("reset role; reset timezone");
  return { sameTenancyAndReceivable: true, fixedTermHistory: true, inclusiveReservation: true,
    scopedEvidenceAndReads: true, noEarlyBilling: true, canonicalNextCharge: true, idempotent: true };
}
