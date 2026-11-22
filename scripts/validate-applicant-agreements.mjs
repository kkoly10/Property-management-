import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function validateApplicantAgreements(db, {
  assert, expectDatabaseError, organizationId, owner, renterOne, renterTwo, outsider, emails, wrongUnitVersion,
  migrationsApplied,
}) {
  await db.exec("reset role");
  if (!migrationsApplied) await db.exec(await readFile(new URL(
    "../supabase/migrations/20261122153750_bind_applicant_to_rental_agreement.sql", import.meta.url
  ), "utf8"));
  const rpc = async (sql, values) => (await db.query("select public." + sql + " as result", values)).rows[0].result;
  const auth = async (user, aal = "aal2") => {
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal',$2,false),set_config('request.jwt.claims','',false)",
      [user, aal]);
  };
  const service = async () => {
    await db.exec("reset role; set role service_role");
    await db.query("select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','',false)");
  };
  await auth(owner);
  const rental = await rpc("create_homeowner_rental($1,$2::jsonb,$3)", [organizationId, JSON.stringify({
    property: { kind: "new", accountingBookId: null, legalName: "Application Landlord", entityType: "individual",
      name: "Application Fixture Home", addressLine1: "20 Test Road", addressLine2: "", locality: "Richmond",
      subdivisionCode: "VA", postalCode: "23220", countryCode: "US", timeZone: "America/New_York" },
    space: { name: "Test suite", type: "basement", bedrooms: 1, bathrooms: 1, entrance: "private",
      kitchen: "private", bathroom: "private", laundry: "shared", utilitiesNotes: "", parkingNotes: "" },
  }), randomUUID()]);
  const { unitId, propertyId } = rental;
  const date = (await db.query("select ((now() at time zone 'America/New_York')::date+30)::text as day")).rows[0].day;
  const listing = randomUUID();
  await db.exec("reset role");
  await db.query(`insert into public.rental_listings(id,organization_id,property_id,unit_id,
    title,rent_amount_minor,currency_code,available_on,country_code) values($1,$2,$3,$4,'Agreement fixture',100000,'USD',$5,'US')`,
  [listing, organizationId, propertyId, unitId, date]);
  await db.query("insert into public.organization_memberships(organization_id,user_id,role_code,status) values ($1,$2,'org_owner','active')",
    [organizationId, outsider]);
  const createApplication = async (email, verified = true) => {
    await db.exec("reset role");
    const id = randomUUID();
    await db.query(`insert into public.rental_applications(id,public_reference,organization_id,listing_id,property_id,unit_id,
        first_name,last_name,email,desired_move_in_on,listing_title_snapshot,listing_rent_amount_minor,
        currency_code,listing_available_on,status,verified_at)
      values($1,$2,$3,$4,$5,$6,'Fixture','Applicant',$7,$8,'Application fixture',100000,'USD',$8,$9,
        case when $9='submitted' then now() end)`,
    [id, "APP-" + id.slice(0, 8).toUpperCase(), organizationId, listing, propertyId, unitId, email,
      date, verified ? "submitted" : "pending_verification"]);
    await auth(owner);
    return id;
  };
  const sourceHash = "c".repeat(64);
  const makeDocument = async (type = "rental_agreement_source") => {
    await db.exec("reset role");
    const [id, version] = [randomUUID(), randomUUID()];
    await db.query(`insert into public.documents(id,organization_id,property_id,unit_id,document_type,title,created_by)
      values($1,$2,$3,$4,$5,'Application fixture PDF',$6)`, [id, organizationId, propertyId, unitId, type, owner]);
    await db.query(`insert into public.document_versions(id,organization_id,document_id,version_number,storage_bucket,
       storage_path,mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status)
      values($1,$2,$3,1,'private-documents',$4,'application/pdf',120,$5,'fixture.pdf',$6,'clean')`,
    [version, organizationId, id, `organizations/${organizationId}/unit/${unitId}/${id}/fixture.pdf`, sourceHash, owner]);
    await auth(owner);
    return { id, version };
  };
  const prepare = (application) => rpc("prepare_rental_application_lease($1,$2,1,$3)", [organizationId, application, randomUUID()]);
  const setup = (application) => rpc("get_rental_application_signing_setup($1,$2)", [organizationId, application]);
  const issue = (prepared, documentVersionId, agreementId, version = prepared.applicationVersion, setupId = prepared.setupId) =>
    rpc("issue_rental_application_agreement($1,$2,$3,$4,$5,$6,14,true)", [organizationId, prepared.applicationId,
      setupId, version, agreementId, documentVersionId]);
  const read = (agreementId) => rpc("get_rental_agreement($1,null)", [agreementId]);
  const artifacts = (agreementId) => rpc("get_rental_agreement_artifacts($1,null)", [agreementId]);
  const sign = (agreementId, actor, version, name) => rpc(
    "sign_rental_agreement($1,$2,$3,$4,$5,'esign_consent@1.0.0#260463bcf84a7827',true,true)",
    [actor, agreementId, version, sourceHash, name]);
  const file = (agreementId) => rpc("file_executed_rental_agreement($1,$2)", [organizationId, agreementId]);

  const unverified = await createApplication(emails[0], false);
  await expectDatabaseError(() => setup(unverified), "APPLICATION_SIGNING_SETUP_UNAVAILABLE");
  const pending = await createApplication(emails[0]);
  const pendingSetup = await prepare(pending);
  const pendingSource = await makeDocument();
  const pendingAgreement = randomUUID();
  await auth(owner, "aal1");
  await expectDatabaseError(() => issue(pendingSetup, pendingSource.version, pendingAgreement), "MFA_REQUIRED");
  await auth(outsider);
  await expectDatabaseError(() => setup(pending), "APPLICATION_SIGNING_SETUP_UNAVAILABLE");
  await expectDatabaseError(() => issue(pendingSetup, pendingSource.version, pendingAgreement), "APPLICATION_SIGNING_SETUP_UNAVAILABLE");
  await auth(owner);
  const pendingContext = await setup(pending);
  assert(pendingContext.unitId === unitId && pendingContext.email === emails[0] && pendingContext.name === "Fixture Applicant"
    && pendingContext.setupId === pendingSetup.setupId, "The signing form did not use the verified applicant's exact draft.");
  await expectDatabaseError(() => issue(pendingSetup, pendingSource.version, pendingAgreement, 1), "APPLICATION_SIGNING_SETUP_CHANGED");
  await expectDatabaseError(() => issue(pendingSetup, pendingSource.version, pendingAgreement, pendingSetup.applicationVersion, randomUUID()),
    "APPLICATION_SIGNING_SETUP_CHANGED");
  await expectDatabaseError(() => issue(pendingSetup, wrongUnitVersion, pendingAgreement), "AGREEMENT_SOURCE_UNAVAILABLE");
  const generic = randomUUID();
  await rpc("issue_rental_agreement($1,$2,$3,$4,$5,14,true)", [organizationId, generic, unitId, pendingSource.version, [emails[0]]]);
  await expectDatabaseError(() => issue(pendingSetup, pendingSource.version, generic), "IDEMPOTENCY_CONFLICT");
  assert((await issue(pendingSetup, pendingSource.version, pendingAgreement)).status === "open"
    && (await issue(pendingSetup, pendingSource.version, pendingAgreement)).replayed
    && (await setup(pending)).agreementId === pendingAgreement, "Issuance lost the durable linked agreement ID.");
  await expectDatabaseError(() => issue(pendingSetup, pendingSource.version, randomUUID()), "APPLICATION_AGREEMENT_ALREADY_OPEN");
  await auth(renterTwo);
  await expectDatabaseError(() => read(pendingAgreement), "AGREEMENT_FORBIDDEN");
  await auth(renterOne);
  assert((await read(pendingAgreement)).requiredCount === 2, "The linked request did not name exactly the applicant and landlord.");
  await db.exec("reset role");
  const token = randomBytes(32).toString("hex");
  await db.query(`insert into private.rental_application_access(application_id,organization_id,token_hash,expires_at)
    values($1,$2,$3,now()+interval '1 day')`, [pending, organizationId, createHash("sha256").update(token).digest("hex")]);
  await service();
  assert((await rpc("withdraw_public_rental_application($1,$2)", [token, randomUUID()])).status === "withdrawn",
    "Application withdrawal did not retire the linked draft.");
  await expectDatabaseError(() => sign(pendingAgreement, renterOne, pendingSource.version, "Fixture Applicant"), "AGREEMENT_NOT_OPEN");
  await auth(renterOne);
  assert((await read(pendingAgreement)).status === "void" && (await artifacts(pendingAgreement)).source === null,
    "Withdrawal left a usable signing request or new download.");

  async function execute(email, signer) {
    const application = await createApplication(email);
    const prepared = await prepare(application);
    const document = await makeDocument();
    const agreement = randomUUID();
    await issue(prepared, document.version, agreement);
    await service();
    await sign(agreement, owner, document.version, "Fixture Landlord");
    assert((await sign(agreement, signer, document.version, "Fixture Applicant")).status === "executed", "Linked signing failed.");
    await auth(owner);
    const filed = await file(agreement);
    assert(filed.applicationId === application && filed.applicationSetupId === prepared.setupId
      && filed.documentId === document.id && filed.tenancyId === null, "Filing did not return the exact application draft.");
    return { application, prepared, document, agreement };
  }
  const closed = await execute(emails[0], renterOne);
  await rpc("close_rental_application($1,$2,$3,$4)", [organizationId, closed.application, closed.prepared.applicationVersion, randomUUID()]);
  const household = { displayName: "Fixture household", members: [{ firstName: "Fixture", lastName: "Applicant",
    email: emails[0], primaryContact: true, financiallyResponsible: true }] };
  await expectDatabaseError(() => rpc("activate_existing_lease($1,$2,$3,$4::jsonb,$5::jsonb,0,$6,$7)", [
    organizationId, propertyId, unitId, JSON.stringify(household),
    JSON.stringify({ source: "operator_supplied", startDate: date, endDate: "", rentAmountMinor: 100000,
      currencyCode: "USD", rentFrequency: "monthly", signedDocumentId: closed.document.id }), date, randomUUID(),
  ]), "AGREEMENT_APPLICATION_SETUP_REQUIRED");
  await auth(renterOne);
  assert((await artifacts(closed.agreement)).evidenceSha256, "Closing the application removed executed signature evidence.");

  const exact = await execute(emails[1], renterTwo);
  const foreignVersion = (await makeDocument("signed_lease")).version;
  const draft = await rpc("get_homeowner_lease_episode($1,$2,$3,null,false)", [organizationId, unitId, exact.prepared.setupId]);
  const save = (documentVersionId, revision) => rpc("save_homeowner_lease_episode($1,$2,$3,$4,$5::jsonb,$6)",
    [organizationId, unitId, exact.prepared.setupId, revision, JSON.stringify({ ...draft.draft, documentVersionId }), randomUUID()]);
  const activate = (revision) => rpc("activate_homeowner_lease_episode($1,$2,$3,$4,true,true)",
    [organizationId, unitId, exact.prepared.setupId, revision]);
  const wrongDraft = await save(foreignVersion, draft.revision);
  await expectDatabaseError(() => activate(wrongDraft.revision), "APPLICATION_AGREEMENT_REQUIRED");
  const exactDraft = await save(exact.document.version, wrongDraft.revision);
  const activated = await activate(exactDraft.revision);
  assert(activated.possessionStatus === "scheduled" && (await activate(exactDraft.revision)).tenancyId === activated.tenancyId
    && (await file(exact.agreement)).tenancyId === activated.tenancyId, "Exact linked activation did not reserve one tenancy.");
  await db.exec("reset role");
  const { rows: [result] } = await db.query(`select
    (select converted_tenancy_id from public.rental_applications where id=$1) as tenancy_id,
    (select count(*)::int from public.tenancies where unit_id=$2) as tenancy_count,
    (select signed_document_version_id from public.leases where id=$3) as version_id`,
  [exact.application, unitId, activated.leaseId]);
  assert(result.tenancy_id === activated.tenancyId && result.tenancy_count === 1 && result.version_id === exact.document.version,
    "Activation did not preserve the exact conversion and signed source, or a failed attempt committed.");
  return { verifiedContext: true, exactLink: true, pendingWithdrawalRevokes: true, executedHistoryRetained: true,
    terminalDirectActivationDenied: true, externalVersionDenied: true, exactActivation: true };
}
