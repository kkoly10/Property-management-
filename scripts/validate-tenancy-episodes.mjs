import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function validateTenancyEpisodes(db, { assert, expectDatabaseError, createOrganizationAsServer }) {
  const [actor, alternate] = [randomUUID(), randomUUID()];
  await db.exec("reset role");
  await db.query("insert into auth.users(id,email) values($1,'episode-owner@example.com'),($2,'other-episode-operator@example.com')", [actor, alternate]);
  const owner = (await createOrganizationAsServer(db, actor,
    "'Tenancy Episodes','tenancy-episodes','self_managing','US','en-US','America/New_York','operator_terms@0.1.0-draft+privacy_notice@0.1.0-draft#0123456789abcdef','episode-fixture-create'",
  )).rows[0].result;
  const organizationId = owner.organizationId;
  const act = (id = actor) => db.exec("reset role; set role authenticated; set request.jwt.claim.sub='" + id + "'");
  const rpc = async (name, placeholders, args = []) => (await db.query(
    "select public." + name + "(" + placeholders + ") as result", args,
  )).rows[0].result;
  const rentalInput = {
    property: {
      kind: "new", accountingBookId: null, legalName: "Episode Landlord", entityType: "individual", name: "Episode House",
      addressLine1: "7 Episode Street", addressLine2: "", locality: "Richmond", subdivisionCode: "VA", postalCode: "23220",
      countryCode: "US", timeZone: "America/New_York",
    },
    space: { name: "Basement", type: "basement", bedrooms: 1, bathrooms: 1, entrance: "private",
      kitchen: "private", bathroom: "private", laundry: "shared", utilitiesNotes: "", parkingNotes: "" },
  };
  const rental = await rpc("create_homeowner_rental", "$1,$2::jsonb,$3", [organizationId, JSON.stringify(rentalInput), randomUUID()]);
  const unitId = rental.unitId;
  const scope = [organizationId, unitId];
  const get = (id = null, applicationId = null, fresh = false) => rpc("get_homeowner_lease_episode", "$1,$2,$3,$4,$5", [...scope, id, applicationId, fresh]);

  await db.exec("reset role");
  const { rows: [{ today, next_day, successor, later_end, application_start, application_end }] } = await db.query(
    "select local::text as today,(local+1)::text as next_day,(local+2)::text as successor,(local+4)::text as later_end,(local+5)::text as application_start,(local+8)::text as application_end from (select (now() at time zone 'America/New_York')::date as local) x",
  );
  const fixtureAgreement = async (label) => {
    const [documentId, versionId] = [randomUUID(), randomUUID()];
    await db.query("insert into public.documents(id,organization_id,property_id,unit_id,document_type,title,created_by) values($1,$2,$3,$4,'signed_lease',$5,$6)",
      [documentId, organizationId, rental.propertyId, unitId, label, actor]);
    await db.query("insert into public.document_versions(id,organization_id,document_id,version_number,storage_bucket,storage_path,mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status) values($1,$2,$3,1,'private-documents',$4,'application/pdf',1024,$5,$4,$6,'clean')",
      [versionId, organizationId, documentId, label + ".pdf", "a".repeat(64), actor]);
    return versionId;
  };
  // These are explicit fixture records. This probe does not certify a scan provider.
  const firstAgreement = await fixtureAgreement("first-episode");
  const laterAgreement = await fixtureAgreement("next-episode");
  const overlappingAgreement = await fixtureAgreement("overlap-episode");
  const applicationAgreement = await fixtureAgreement("application-episode");
  await db.query("insert into public.organization_memberships(organization_id,user_id,role_code,status) values ($1,$2,'org_owner','active')",
    [organizationId, alternate]);
  const draft = (label, startDate, endDate, documentVersionId, occupancy) => ({
    householdName: label,
    members: [{ firstName: label, lastName: "Fixture", email: label.toLowerCase() + "@example.com",
      phoneE164: "", primaryContact: true, financiallyResponsible: true }],
    startDate, endDate, documentVersionId, occupancy, rentAmount: "1300", openingBalance: "0",
    rentFrequency: "monthly", firstChargeDueDate: startDate, upload: null,
  });

  await act();
  const firstDraft = draft("First", today, next_day, firstAgreement, "existing");
  const oldSetup = await rpc("save_homeowner_lease_setup", "$1,$2,0,$3::jsonb,$4", [...scope, JSON.stringify(firstDraft), randomUUID()]);
  const first = await rpc("activate_homeowner_lease_setup", "$1,$2,$3,true,true", [...scope, oldSetup.revision]);

  await db.exec("reset role");
  for (const file of [
    "../supabase/migrations/20261122144708_tenancy_episodes_and_temporal_guards.sql",
    "../supabase/migrations-contract/20261122144712_enable_independent_tenancy_episodes.sql",
  ]) await db.exec(await readFile(new URL(file, import.meta.url), "utf8"));

  await act();
  assert((await get(oldSetup.setupId)).result.tenancyId === first.tenancyId, "The legacy receipt could not be loaded by its stable ID.");
  assert((await get(null, null, true)).setupId === null, "Starting another household re-opened an activated setup.");
  await expectDatabaseError(
    () => rpc("activate_homeowner_lease_setup", "$1,$2,$3,true,true", [...scope, oldSetup.revision]), "permission denied",
  );
  const save = (id, revision, value, key = randomUUID()) => rpc("save_homeowner_lease_episode", "$1,$2,$3,$4,$5::jsonb,$6",
    [...scope, id, revision, JSON.stringify(value), key]);
  const activate = (id, revision) => rpc("activate_homeowner_lease_episode", "$1,$2,$3,$4,true,true", [...scope, id, revision]);
  const nextDraft = draft("Successor", successor, later_end, laterAgreement, "future");
  const key = randomUUID();
  const nextEpisode = await save(null, 0, nextDraft, key);
  assert(nextEpisode.setupId === key && nextEpisode.setupId !== oldSetup.setupId, "New draft lost its independent stable ID.");
  assert((await save(null, 0, nextDraft, key)).setupId === key, "A lost first-save response allocated a second draft.");
  await expectDatabaseError(() => save(null, 0, nextDraft), "SETUP_DRAFT_ALREADY_EXISTS");

  await act(alternate);
  await expectDatabaseError(() => get(key), "SETUP_NOT_FOUND");
  await expectDatabaseError(() => activate(key, 1), "SETUP_NOT_FOUND");
  await act();
  const reservation = await activate(nextEpisode.setupId, nextEpisode.revision);
  assert(reservation.possessionStatus === "scheduled" && reservation.tenancyId !== first.tenancyId, "A back-to-back tenancy failed or prematurely took possession.");
  assert((await activate(oldSetup.setupId, oldSetup.revision)).tenancyId === first.tenancyId, "Replaying an old activation addressed the wrong episode.");
  assert((await activate(key, nextEpisode.revision)).tenancyId === reservation.tenancyId, "Replaying a reservation allocated another tenancy.");

  // The successor begins two days later. The inclusive last day is still unavailable.
  await act(alternate);
  const overlap = await save(null, 0, draft("Overlap", next_day, later_end, overlappingAgreement, "future"));
  await expectDatabaseError(() => activate(overlap.setupId, overlap.revision), "TENANCY_OVERLAP");

  await db.exec("reset role");
  const resolved = (await db.query("select private.import_resolve_tenancy($1,'Episode House','7 Episode Street','Richmond','US','Basement') as id",
    [organizationId])).rows[0].id;
  assert(resolved === first.tenancyId, "Unit-only import chose the later household over active possession.");
  const [listingId, applicationId, prepareKey] = [randomUUID(), randomUUID(), randomUUID()];
  await db.query("insert into public.rental_listings(id,organization_id,property_id,unit_id,title,rent_amount_minor,currency_code,available_on,country_code) values ($1,$2,$3,$4,'Future rental fixture',130000,'USD',$5,'US')",
    [listingId, organizationId, rental.propertyId, unitId, application_start]);
  await db.query("insert into public.rental_applications(id,public_reference,organization_id,listing_id,property_id,unit_id,first_name,last_name,email,desired_move_in_on,listing_title_snapshot,listing_rent_amount_minor,currency_code,listing_available_on,status,verified_at) values($1,'APP-FDEADBE0',$2,$3,$4,$5,'Later','Applicant','later-applicant@example.com',$6,'Future rental fixture',130000,'USD',$6,'submitted',now())",
    [applicationId, organizationId, listingId, rental.propertyId, unitId, application_start]);
  await act();
  const prepare = () => rpc("prepare_rental_application_lease", "$1,$2,1,$3", [organizationId, applicationId, prepareKey]);
  const preparation = await prepare();
  assert((await prepare()).setupId === preparation.setupId
    && (await get(null, applicationId)).setupId === preparation.setupId,
  "The later application did not retain its exact prepared episode across retry.");

  const promote = () => rpc("start_due_homeowner_tenancies", "($1::date::timestamp at time zone 'America/New_York'),500", [successor]);
  await db.exec("reset role; set role service_role");
  await promote();
  await act();
  assert((await get(key)).possessionStatus === "scheduled", "The worker promoted a future reservation while physical possession was occupied.");

  // The full move-out/settlement command is a later slice. Only the isolated fixture simulates its result.
  await db.exec("reset role");
  await db.query("update public.tenancies set status='closed' where id=$1", [first.tenancyId]);
  await db.exec("set role service_role");
  await promote();
  await act();
  assert((await get(key)).possessionStatus === "active" && (await get(oldSetup.setupId)).possessionStatus === "closed",
    "Starting the successor overwrote or failed to distinguish the previous receipt.");
  const applicationSetup = await get(preparation.setupId);
  const completedDraft = await save(preparation.setupId, applicationSetup.revision, {
    ...applicationSetup.draft, documentVersionId: applicationAgreement, endDate: application_end,
  });
  const applicationReservation = await activate(preparation.setupId, completedDraft.revision);
  const { rows: [converted] } = await db.query("select status,converted_tenancy_id from public.rental_applications where id=$1", [applicationId]);
  assert(applicationReservation.possessionStatus === "scheduled" && converted.status === "converted"
    && converted.converted_tenancy_id === applicationReservation.tenancyId, "The application converted into a different tenancy episode.");
  await db.exec("reset role");
  const starts = (await db.query("select count(*)::integer as n from private.outbox_events where event_type='tenancy.started' and aggregate_id=$1",
    [reservation.tenancyId])).rows[0].n;
  assert(starts === 1, "Conditional possession emitted more than one start event.");
  return { independentEpisode: true, isolatedEpisode: true, nonoverlapReserved: true, inclusiveOverlapRejected: true,
    currentImportTarget: true, priorPossessionProtected: true, legacyReceiptPreserved: true, laterApplicationConversion: true };
}
