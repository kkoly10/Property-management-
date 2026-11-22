import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function validateTenancyMoveIn(db, { assert, expectDatabaseError, migrationsApplied = false }) {
  await db.exec("reset role");
  if (!migrationsApplied) await db.exec(await readFile(new URL("../supabase/migrations/20261122152304_record_tenancy_move_in_handover.sql", import.meta.url), "utf8"));

  const [owner, outsider, documentId, versionId] = Array.from({ length: 4 }, () => randomUUID());
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'move-in-owner@example.com',now()),($2,'move-in-outsider@example.com',now())", [owner, outsider]);
  const rpc = async (sql, args = []) => (await db.query("select public." + sql + " as result", args)).rows[0].result;
  const act = async (actor = owner) => {
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal','aal2',false),set_config('request.jwt.claims','',false)", [actor]);
  };
  const service = () => db.exec("reset role; set role service_role");
  await service();
  const { organizationId } = await rpc("create_organization_as_actor($1,'Move-in fixture','move-in-fixture','self_managing','US','en-US','America/New_York','operator_terms@0.1.0-draft+privacy_notice@0.1.0-draft#0123456789abcdef',$2)", [owner, randomUUID()]);
  await act();
  const rental = await rpc("create_homeowner_rental($1,$2::jsonb,$3)", [organizationId, JSON.stringify({
    property: { kind: "new", accountingBookId: null, legalName: "Fixture Owner", entityType: "individual",
      name: "Move-in House", addressLine1: "17 Fixture Road", addressLine2: "", locality: "Richmond",
      subdivisionCode: "VA", postalCode: "23220", countryCode: "US", timeZone: "America/New_York" },
    space: { name: "Suite", type: "basement", bedrooms: 1, bathrooms: 1, entrance: "private",
      kitchen: "private", bathroom: "private", laundry: "shared", utilitiesNotes: "", parkingNotes: "" },
  }), randomUUID()]);

  await db.exec("reset role");
  const { today, tomorrow, end } = (await db.query("select d::text as today,(d+1)::text as tomorrow,(d+5)::text as end from (select (now() at time zone 'America/New_York')::date as d) x")).rows[0];
  await db.query("insert into public.documents(id,organization_id,property_id,unit_id,document_type,title,source,status,operator_supplied_unverified,created_by) values($1,$2,$3,$4,'signed_lease','Move-in fixture lease','operator_supplied','active',true,$5)", [documentId, organizationId, rental.propertyId, rental.unitId, owner]);
  await db.query("insert into public.document_versions(id,organization_id,document_id,version_number,storage_bucket,storage_path,mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status) values($1,$2,$3,1,'private-documents',$4,'application/pdf',100,$5,'fixture.pdf',$6,'clean')", [versionId,organizationId,documentId,"organizations/" + organizationId + "/unit/" + rental.unitId + "/" + versionId + "/fixture.pdf","c".repeat(64),owner]);

  await act();
  const tenure = await rpc("activate_existing_lease($1,$2,$3,$4::jsonb,$5::jsonb,0,$6,$7)", [
    organizationId,rental.propertyId,rental.unitId,JSON.stringify({ displayName:"Move-in household", members:[
      { firstName:"Fixture",lastName:"Resident",email:"move-in-resident@example.com",primaryContact:true,financiallyResponsible:true },
    ] }),JSON.stringify({ source:"operator_supplied",startDate:today,endDate:end,rentAmountMinor:10000,
      currencyCode:"USD",rentFrequency:"monthly",signedDocumentId:documentId }),today,randomUUID(),
  ]);
  // Model a preexisting due reservation before the clock worker picks it up.
  await db.exec("reset role");
  await db.query("update public.tenancies set status='scheduled' where id=$1", [tenure.tenancyId]);
  await db.query("update public.leases set signed_document_version_id=$2 where id=$1", [tenure.leaseId, versionId]);

  const status = () => rpc("get_tenancy_move_in($1,$2)",[organizationId,tenure.tenancyId]);
  const change = (version, action, date, { operation = randomUUID(), keys = null, condition = null, keepDates = false } = {}) =>
    rpc("record_tenancy_move_in($1,$2,$3,$4,$5,$6,$7,$8,$9)",[organizationId,tenure.tenancyId,version,operation,action,date,keys,condition,keepDates]);
  const runClock = async () => {
    await service();
    await rpc("start_due_homeowner_tenancies(clock_timestamp(),100)");
    await act();
    return (await status()).status;
  };

  await act(outsider);
  await expectDatabaseError(() => status(), "ORGANIZATION_SCOPE_DENIED");
  await expectDatabaseError(() => change(0,"plan",today), "ORGANIZATION_SCOPE_DENIED");
  await act();
  assert((await status()).state === "unplanned", "New handover status was not empty.");
  const operation = randomUUID();
  const first = await change(0,"plan",tomorrow,{operation});
  assert(first.state === "planned" && (await change(0,"plan",tomorrow,{operation})).version === 1, "Move-in plan did not replay the exact response.");
  await expectDatabaseError(() => change(0,"plan",today,{operation}),"IDEMPOTENCY_CONFLICT");
  await expectDatabaseError(() => change(0,"plan",today),"MOVE_IN_VERSION_CONFLICT");
  assert(await runClock() === "scheduled", "The scheduler released a planned tenancy before handover.");
  assert((await change(1,"plan",today)).version === 2, "The appointment could not be rescheduled.");
  assert((await change(2,"no_show",today)).state === "no_show", "The at-date no-show was not recorded.");
  assert(await runClock() === "scheduled", "The scheduler released a no-show.");
  await expectDatabaseError(() => change(3,"handover",today,{ keys:2,condition:"Fixture condition #1" }),"MOVE_IN_INVALID_INPUT");
  assert((await change(3,"handover",today,{ keys:2,condition:"Fixture condition #1",keepDates:true })).state === "handed_over",
    "The handover was not confirmed with keys and condition.");

  await db.exec("reset role");
  await db.query("update public.document_versions set upload_status='quarantined' where id=$1",[versionId]);
  assert(await runClock() === "scheduled", "A pinned but unclean version released the tenancy.");
  await db.exec("reset role");
  await db.query("update public.document_versions set upload_status='clean' where id=$1",[versionId]);
  assert(await runClock() === "active", "The confirmed and signed tenancy did not start.");
  const final = await status();
  assert(final.version === 4 && final.events.length === 4 && final.keysTransferred === 2 && final.conditionReference === "Fixture condition #1",
    "The move-in record lost confirmed evidence or appointment history.");
  await expectDatabaseError(() => change(4,"plan",today),"MOVE_IN_ACTION_UNAVAILABLE");
  await db.exec("reset role");
  const retained = (await db.query("select l.start_date::text as starts,l.end_date::text as ends,s.starts_on::text as first_due from public.leases l join public.charge_schedules s on s.tenancy_id=$2 where l.id=$1", [tenure.leaseId, tenure.tenancyId])).rows[0];
  assert(retained.starts === today && retained.ends === end && retained.first_due === today, "Move-in changed the signed term or previously confirmed rent dates.");
  return { planHold:true, noShowHold:true, rescheduled:true, idempotent:true, scoped:true, exactCleanSource:true, keysAndCondition:true, preservedFinancialDates:true };
}
