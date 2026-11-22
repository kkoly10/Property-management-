import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function validateTenancyCloseout(db, { assert, expectDatabaseError, createOrganizationAsServer, verifyLockedHandback }) {
  await db.exec(await readFile(new URL("../supabase/migrations/20261122150548_tenancy_closeout_and_handback.sql", import.meta.url), "utf8"));
  const [actor, leasing, auditor, outsider] = Array.from({ length: 4 }, randomUUID);
  await db.query(`insert into auth.users(id,email) values
    ($1,'closeout-owner@example.com'),($2,'closeout-leasing@example.com'),
    ($3,'closeout-auditor@example.com'),($4,'closeout-outsider@example.com')`, [actor, leasing, auditor, outsider]);
  const { organizationId } = (await createOrganizationAsServer(db, actor,
    "'Closeout Fixture','closeout-fixture','self_managing','US','en-US','America/New_York','operator_terms@0.1.0-draft+privacy_notice@0.1.0-draft#0123456789abcdef','closeout-create-fixture'",
  )).rows[0].result;

  const act = (id = actor) => db.exec("reset role; set role authenticated; set request.jwt.claim.sub='" + id + "'");
  const rpc = async (name, placeholders, args = []) => (await db.query(
    "select public." + name + "(" + placeholders + ") as result", args,
  )).rows[0].result;
  const rental = await rpc("create_homeowner_rental", "$1,$2::jsonb,$3", [organizationId, JSON.stringify({
    property: {
      kind: "new", accountingBookId: null, legalName: "Closeout Fixture Owner", entityType: "individual", name: "Handback House",
      addressLine1: "80 Closeout Street", addressLine2: "", locality: "Richmond", subdivisionCode: "VA", postalCode: "23220",
      countryCode: "US", timeZone: "America/New_York",
    },
    space: { name: "Main", type: "apartment", bedrooms: 2, bathrooms: 1, entrance: "private",
      kitchen: "private", bathroom: "private", laundry: "private", utilitiesNotes: "", parkingNotes: "" },
  }), randomUUID()]);
  const { propertyId, unitId } = rental;
  await db.exec("reset role");
  const { rows: [{ today, yesterday, start, tomorrow, futureEnd }] } = await db.query(`
    select local::text as today,(local-1)::text as yesterday,(local-3)::text as start,
      (local+1)::text as tomorrow,(local+7)::text as "futureEnd"
    from (select (now() at time zone 'America/New_York')::date as local) x`);
  const documents = [];
  for (const label of ["prior", "successor", "overlap"]) {
    const [documentId, versionId] = [randomUUID(), randomUUID()];
    await db.query(`insert into public.documents(id,organization_id,property_id,unit_id,document_type,title,created_by)
      values($1,$2,$3,$4,'signed_lease',$5,$6)`, [documentId, organizationId, propertyId, unitId, label, actor]);
    await db.query(`insert into public.document_versions(id,organization_id,document_id,version_number,storage_bucket,
      storage_path,mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status)
      values($1,$2,$3,1,'private-documents',$4,'application/pdf',100,$5,$4,$6,'clean')`,
    [versionId, organizationId, documentId, "closeout-" + label + ".pdf", "c".repeat(64), actor]);
    documents.push(documentId);
  }
  await db.query(`with leasing as (
      insert into public.organization_memberships(organization_id,user_id,role_code,status)
      values($1,$2,'leasing_agent','active') returning id
    ), auditor as (
      insert into public.organization_memberships(organization_id,user_id,role_code,status)
      values($1,$3,'read_only_auditor','active') returning id
    )
    insert into public.membership_property_scopes(organization_id,membership_id,property_id)
    select $1,id,$4::uuid from leasing union all select $1,id,$4::uuid from auditor`, [organizationId, leasing, auditor, propertyId]);

  const activate = (label, doc, from, until, firstDue, opening) => rpc(
    "activate_existing_lease", "$1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8",
    [organizationId, propertyId, unitId,
      JSON.stringify({ displayName: label, members: [{ firstName: label, lastName: "Fixture",
        primaryContact: true, financiallyResponsible: true }] }),
      JSON.stringify({ source: "operator_supplied", startDate: from, endDate: until, rentAmountMinor: 130000,
        currencyCode: "USD", rentFrequency: "monthly", signedDocumentId: doc }),
      opening, firstDue, "closeout-fixture-" + label],
  );
  await act();
  const first = await activate("Prior", documents[0], start, tomorrow, today, 12500);
  await db.exec("reset role; set role service_role");
  const charge = await rpc("generate_recurring_charges", "$1,array[$2::uuid],$3",
    [today, first.chargeScheduleId, "closeout-before-handback"]);
  assert(charge.generatedCount===1, "The accounting fixture requires one posted rent charge.");
  await db.exec("reset role");
  // The isolated fixture represents a contract that already expired and whose
  // occupant overstayed. Dates are stable once the closeout workflow starts.
  await db.query("update public.leases set end_date=$1 where id=$2", [yesterday, first.leaseId]);
  await db.query("update public.tenancies set possession_end=$1 where id=$2", [yesterday, first.tenancyId]);
  await act();
  const successor = await activate("Successor", documents[1], tomorrow, futureEnd, tomorrow, 0);
  await db.exec("reset role");
  await db.query("update public.tenancies set possession_start=$1 where id=$2", [today, successor.tenancyId]);
  await db.query("update public.leases set start_date=$1 where id=$2", [today, successor.leaseId]);
  await db.query(`insert into public.payments (
      organization_id,operating_entity_id,accounting_book_id,receivable_account_id,tenancy_id,public_reference,
      payment_source,amount_minor,currency_code,status
    ) select s.organization_id,b.operating_entity_id,s.accounting_book_id,s.receivable_account_id,s.tenancy_id,
      'PAY-CLOSEOUT-FIXTURE','provider',3200,'USD','pending'
      from public.charge_schedules s join public.accounting_books b on b.id=s.accounting_book_id where s.id=$1`,
  [first.chargeScheduleId]);

  const get = (id = first.tenancyId, org = organizationId) => rpc("get_tenancy_closeout", "$1,$2", [org, id]);
  const transition = (action, version, when = null, confirmed = false, key = randomUUID(), id = first.tenancyId) =>
    rpc("transition_tenancy_closeout", "$1,$2,$3,$4,$5,$6,$7", [organizationId, id, action, version, when, confirmed, key]);
  const promote = (date) => rpc("start_due_homeowner_tenancies", "($1::date::timestamp at time zone 'America/New_York'),500", [date]);

  await act(outsider);
  await expectDatabaseError(() => get(), "CLOSEOUT_TENANCY_NOT_FOUND");
  await expectDatabaseError(() => transition("plan", 0, today), "CLOSEOUT_TENANCY_NOT_FOUND");
  await act(auditor);
  const readOnly = await get();
  assert(!readOnly.canManage && readOnly.accounting?.balanceMinor === "142500", "Read-only finance permission lost the exact receivable balance.");
  await expectDatabaseError(() => transition("plan", 0, today), "CLOSEOUT_TENANCY_NOT_FOUND");
  await act(leasing);
  assert((await get()).accounting===null, "Lease management permission disclosed financial aggregates.");
  await act();
  await expectDatabaseError(() => get(first.tenancyId, randomUUID()), "CLOSEOUT_TENANCY_NOT_FOUND");
  await expectDatabaseError(() => transition("plan", 0, tomorrow, false, randomUUID(), successor.tenancyId), "CLOSEOUT_TRANSITION_UNAVAILABLE");
  await expectDatabaseError(() => transition("record_return", 0, today), "INVALID_CLOSEOUT_ACTION");
  await expectDatabaseError(() => transition("record_return", 0, tomorrow, true), "CLOSEOUT_DATE_OUT_OF_RANGE");
  await expectDatabaseError(() => transition("plan", 0, yesterday), "CLOSEOUT_DATE_OUT_OF_RANGE");
  await expectDatabaseError(() => transition("cancel", 0), "CLOSEOUT_TRANSITION_UNAVAILABLE");

  const planned = await transition("plan", 0, tomorrow);
  assert(planned.version===1 && planned.state==="planned" && (await get()).tenancyStatus==="active",
    "Planning changed physical possession.");
  await expectDatabaseError(() => transition("cancel", 0), "CLOSEOUT_VERSION_CONFLICT");
  const canceled = await transition("cancel", 1);
  assert(canceled.state==="canceled" && canceled.plannedReturnOn===null, "Canceling did not clear the plan.");
  await transition("plan", 2, today);
  await db.exec("reset role; set role service_role");
  await promote(today);
  await act();
  assert((await get(successor.tenancyId)).tenancyStatus==="scheduled", "An active prior household did not block possession.");
  const key = randomUUID();
  const record = () => transition("record_return", 3, today, true, key);
  const returned = verifyLockedHandback
    ? await verifyLockedHandback({ record, actor, key, today, organizationId, tenancyId: first.tenancyId, successorId: successor.tenancyId })
    : await record();
  assert(returned.state==="returned" && returned.returnedOn===today && returned.plannedReturnOn===today && returned.version===4,
    "Closed tenancy did not preserve both handback dates.");
  assert((await record()).version===4, "Lost successful response advanced the version a second time.");
  await expectDatabaseError(() => transition("record_return", 3, yesterday, true, key), "CLOSEOUT_IDEMPOTENCY_CONFLICT");
  await expectDatabaseError(() => transition("plan", 4, tomorrow), "CLOSEOUT_TRANSITION_UNAVAILABLE");
  const review = await get();
  assert(review.tenancyStatus==="closed" && review.leaseStart===start && review.leaseEnd===yesterday,
    "Recording handback changed signed lease terms.");
  assert(review.accounting.balanceMinor==="142500" && review.accounting.openCharges===1 && review.accounting.unsettledPayments===1,
    "Accounting review did not preserve or isolate the ledger and unsettled activity.");
  await expectDatabaseError(() => activate("Overlap", documents[2], yesterday, futureEnd, today, 0), "TENANCY_OVERLAP");
  await db.exec("reset role");
  await expectDatabaseError(() => db.query(`insert into public.tenancies(
    organization_id,property_id,unit_id,household_id,lease_id,receivable_account_id,possession_start,possession_end,status)
    select organization_id,property_id,unit_id,household_id,lease_id,receivable_account_id,$1::date,$1::date,'active'
      from public.tenancies where id=$2`, [today, first.tenancyId]), "TENANCY_HANDBACK_OVERLAP");

  await db.exec("set role service_role");
  await promote(today);
  await act();
  assert((await get(successor.tenancyId)).tenancyStatus==="scheduled", "Same-day handback released inclusive possession early.");
  await db.exec("reset role; set role service_role");
  const chargeAfter = await rpc("generate_recurring_charges", "$1,array[$2::uuid],$3",
    [tomorrow, first.chargeScheduleId, "closeout-after-handback"]);
  assert(chargeAfter.generatedCount===0, "Automatic rent was generated after handback.");
  await promote(tomorrow);
  await promote(tomorrow);
  await act();
  assert((await get(successor.tenancyId)).tenancyStatus==="active", "The next local day did not release the eligible successor.");
  assert((await get()).state==="returned", "The successor displaced the prior closeout record.");

  await db.exec("reset role");
  const { rows: [effects] } = await db.query(`select t.possession_end::text as "possessionEnd",s.ends_on::text as "scheduleEnd",
    s.status as "scheduleStatus",s.next_run_on as "nextRun",a.status as "accountStatus",
    (select count(*)::int from public.journal_transactions j where j.organization_id=t.organization_id) as journals,
    (select count(*)::int from audit.audit_events e where e.organization_id=t.organization_id and e.resource_id=t.id
      and e.action_code='tenancy.possession_returned') as "returnAudit",
    (select count(*)::int from private.outbox_events e where e.organization_id=t.organization_id and e.aggregate_id=$2
      and e.event_type='tenancy.started') as "successorEvents"
    from public.tenancies t join public.charge_schedules s on s.tenancy_id=t.id
    join public.receivable_accounts a on a.id=t.receivable_account_id where t.id=$1`, [first.tenancyId, successor.tenancyId]);
  assert(effects.possessionEnd===yesterday && effects.scheduleEnd===tomorrow && effects.scheduleStatus==="ended"
    && effects.nextRun===null && effects.accountStatus==="active" && effects.journals===2
    && effects.returnAudit===1 && effects.successorEvents===1,
  "Closeout rewrote contractual records, moved funds, or emitted duplicate events.");
  return { handbackRecorded: true, priorTermPreserved: true, inclusiveSuccessorGate: true, futureRentStopped: true,
    exactReadOnlyAccounting: true, idempotentAndScoped: true, concurrentHandbackChecked: Boolean(verifyLockedHandback) };
}
