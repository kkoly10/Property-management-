import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { validateApplicantAgreements } from "./validate-applicant-agreements.mjs";

const disclosure = "esign_consent@1.0.0#260463bcf84a7827";

export async function validateRentalAgreements(db, { assert, expectDatabaseError, migrationsApplied = false }) {
  await db.exec("reset role");
  if (!migrationsApplied) {
    await db.exec(await readFile(new URL("../supabase/migrations/20261122145424_native_rental_agreement_envelopes.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/20261122151535_file_executed_rental_agreements.sql", import.meta.url), "utf8"));
  }

  const [owner, renterOne, renterTwo, outsider, unverified, documentId, versionId, quarantineDoc, quarantineId, agreementId] = Array.from({ length: 10 }, () => randomUUID());
  const emails = ["one@agreement.example", "two@agreement.example"];
  const sourceHash = "a".repeat(64);
  const rpc = async (sql, values = []) => (await db.query("select public." + sql + " as result", values)).rows[0].result;
  const auth = async (id, level = "aal1") => {
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal',$2,false),set_config('request.jwt.claims','',false)", [id, level]);
  };
  const service = () => db.exec("reset role; set role service_role");
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'owner@agreement.example',now()),($2,$3,now()),($4,$5,now()),($6,'outsider@agreement.example',now()),($7,'unverified@agreement.example',null)",
    [owner, renterOne, emails[0], renterTwo, emails[1], outsider, unverified]);

  await service();
  const makeOrganization = (actor, slug) => rpc(
    "create_organization_as_actor($1,'Agreement Fixture',$2,'self_managing','US','en-US','America/New_York','operator_terms@0.1.0-draft+privacy_notice@0.1.0-draft#0123456789abcdef',$3)",
    [actor, slug, randomUUID()],
  );
  const { organizationId } = await makeOrganization(owner, "agreements-fixture");
  const secondOrg = (await makeOrganization(outsider, "agreements-outsider")).organizationId;
  await auth(owner, "aal2");
  const rental = await rpc("create_homeowner_rental($1,$2::jsonb,$3)", [organizationId, JSON.stringify({
    property: { kind: "new", accountingBookId: null, legalName: "Fixture Landlord", entityType: "individual",
      name: "Agreement Home", addressLine1: "9 Test Road", addressLine2: "", locality: "Richmond",
      subdivisionCode: "VA", postalCode: "23220", countryCode: "US", timeZone: "America/New_York" },
    space: { name: "Suite", type: "basement", bedrooms: 1, bathrooms: 1, entrance: "private",
      kitchen: "private", bathroom: "private", laundry: "shared", utilitiesNotes: "", parkingNotes: "" },
  }), randomUUID()]);
  await db.exec("reset role");
  await db.query("insert into public.documents(id,organization_id,property_id,unit_id,document_type,title,source,status,operator_supplied_unverified,created_by) values($1,$2,$3,$4,'rental_agreement_source','Suite agreement','operator_supplied','active',true,$5),($6,$2,$3,$4,'rental_agreement_source','Still scanning','operator_supplied','active',true,$5)",
    [documentId, organizationId, rental.propertyId, rental.unitId, owner, quarantineDoc]);
  for (const [index, id] of [versionId, quarantineId].entries()) {
    await db.query("insert into public.document_versions(id,organization_id,document_id,version_number,storage_bucket,storage_path,mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status) values($1,$2,$3,$4,'private-documents',$5,'application/pdf',100,$6,'source.pdf',$7,$8)",
      [id, organizationId, index === 0 ? documentId : quarantineDoc, 1, "organizations/" + organizationId + "/unit/" + rental.unitId + "/" + id + "/source.pdf", sourceHash, owner, index === 0 ? "clean" : "quarantined"]);
  }

  const issue = (id = agreementId, version = versionId, named = emails, days = 14) =>
    rpc("issue_rental_agreement($1,$2,$3,$4,$5,$6,true)", [organizationId, id, rental.unitId, version, named, days]);
  const read = (id = agreementId, org = null) => rpc("get_rental_agreement($1,$2)", [id, org]);
  const list = (org = null) => rpc("list_rental_agreements($1)", [org]);
  const artifacts = (id = agreementId, org = null) => rpc("get_rental_agreement_artifacts($1,$2)", [id, org]);
  const sign = (id, actor, name, consent = disclosure, version = versionId, sha = sourceHash) =>
    rpc("sign_rental_agreement($1,$2,$3,$4,$5,$6,true,true)", [actor, id, version, sha, name, consent]);
  const close = (id, action, org = null) => rpc("close_pending_rental_agreement($1,$2,$3)", [id, action, org]);

  const file = (id = agreementId, org = organizationId) => rpc("file_executed_rental_agreement($1,$2)", [org, id]);
  const filing = (id = agreementId, org = organizationId) => rpc("get_rental_agreement_filing($1,$2)", [org, id]);

  await auth(owner);
  await expectDatabaseError(() => issue(), "MFA_REQUIRED");
  await auth(owner, "aal2");
  await expectDatabaseError(() => issue(randomUUID(), quarantineId), "AGREEMENT_SOURCE_UNAVAILABLE");
  await expectDatabaseError(() => issue(randomUUID(), versionId, ["unverified@agreement.example"]), "AGREEMENT_SIGNERS_UNAVAILABLE");
  assert((await issue()).status === "open", "An authorized owner did not issue the envelope.");
  await expectDatabaseError(() => file(), "AGREEMENT_EXECUTION_REQUIRED");
  assert((await issue(agreementId, versionId, [...emails].reverse())).replayed, "Issue did not replay for identical parties.");
  await expectDatabaseError(() => issue(agreementId, versionId, emails, 15), "IDEMPOTENCY_CONFLICT");
  const ownerList = await list(organizationId);
  assert(ownerList.length === 1 && ownerList[0].myCapacity === "landlord" && ownerList[0].requiredCount === 3, "The operator list returned the wrong signers or scope.");
  await expectDatabaseError(() => close(agreementId, "declined"), "AGREEMENT_FORBIDDEN");

  await auth(outsider, "aal2");
  assert((await list(secondOrg)).length === 0 && (await list()).length === 0, "An outsider could list the agreement.");
  await expectDatabaseError(() => read(), "AGREEMENT_FORBIDDEN");
  await expectDatabaseError(() => artifacts(agreementId, secondOrg), "AGREEMENT_FORBIDDEN");
  await auth(renterOne);
  const renterView = await read();
  assert(renterView.myCapacity === "lessee" && renterView.requiredCount === 3 && renterView.signedCount === 0, "The named pre-tenancy renter could not read the request.");
  const openArtifacts = await artifacts();
  assert(openArtifacts.source.versionId === versionId && openArtifacts.evidenceText === null, "The open envelope did not pin the reviewed PDF or hide unfinished evidence.");
  await expectDatabaseError(() => sign(agreementId, renterOne, "First Renter"), "permission denied");
  await expectDatabaseError(() => db.query("select user_id from private.rental_agreement_signers"), "permission denied");

  await service();
  await expectDatabaseError(() => sign(agreementId, outsider, "Outsider"), "AGREEMENT_FORBIDDEN");
  await expectDatabaseError(() => sign(agreementId, renterOne, "First Renter", disclosure, quarantineId), "AGREEMENT_SOURCE_CHANGED");
  await expectDatabaseError(() => sign(agreementId, renterOne, "First Renter", disclosure, versionId, "b".repeat(64)), "AGREEMENT_SOURCE_CHANGED");
  await expectDatabaseError(() => sign(agreementId, renterOne, "First Renter", "obsolete"), "AGREEMENT_DISCLOSURE_CHANGED");
  assert((await sign(agreementId, owner, "Fixture Landlord")).status === "open", "The landlord alone executed a multi-party agreement.");
  assert((await sign(agreementId, renterOne, "First Renter")).status === "open", "One co-renter executed the agreement while another signature was missing.");
  assert((await sign(agreementId, renterTwo, "Elisa Peña")).status === "executed", "The final signature did not execute the agreement.");
  assert((await sign(agreementId, renterTwo, "Elisa Peña")).replayed, "The final signature was not idempotent.");
  await expectDatabaseError(() => sign(agreementId, renterTwo, "Different Name"), "IDEMPOTENCY_CONFLICT");
  await auth(renterOne);
  const completed = await artifacts();
  const evidence = JSON.parse(completed.evidenceText);
  assert(evidence.signatures.length === 3 && evidence.sourceSha256 === sourceHash && evidence.signatures.every((signature) => signature.consentVersion === disclosure)
    && evidence.signatures.some((signature) => signature.name === "Elisa Peña")
    && createHash("sha256").update(completed.evidenceText).digest("hex") === completed.evidenceSha256,
  "Executed evidence did not preserve the exact parties, disclosure, source, or downloadable evidence bytes.");
  assert((await read()).status === "executed" && (await list())[0].iSigned, "Execution was absent from the named renter's inbox.");

  const [declinedId, voidId, expiredId] = Array.from({ length: 3 }, () => randomUUID());
  await auth(owner, "aal2");
  for (const id of [declinedId, voidId, expiredId]) await issue(id);
  await auth(renterTwo);
  assert((await close(declinedId, "declined")).status === "declined" && (await close(declinedId, "declined")).replayed, "Decline was not durable or replay-safe.");
  assert((await artifacts(declinedId)).source === null, "A declined envelope exposed an open source link.");
  await auth(owner);
  await expectDatabaseError(() => close(voidId, "void", organizationId), "MFA_REQUIRED");
  await auth(owner, "aal2");
  assert((await close(voidId, "void", organizationId)).status === "void", "The operator could not void a pending request.");
  await expectDatabaseError(() => close(agreementId, "void", organizationId), "AGREEMENT_NOT_OPEN");

  await db.exec("reset role");
  await db.query("update private.rental_agreements set issued_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id=$1", [expiredId]);
  const result = (await db.query("select (select count(*)::int from audit.audit_events where resource_id=$1 and action_code='rental_agreement.executed') as executions,(select count(*)::int from private.outbox_events where aggregate_id=$1 and event_type='rental_agreement.executed') as events,(select count(*)::int from public.tenancies where unit_id=$2) as tenancies", [agreementId, rental.unitId])).rows[0];
  assert(result.executions === 1 && result.events === 1 && result.tenancies === 0, "An execution was duplicated, untraceable, or illegally created tenancy access.");
  await service();
  await expectDatabaseError(() => sign(expiredId, renterOne, "First Renter"), "AGREEMENT_NOT_OPEN");
  await auth(renterTwo);
  assert((await read(expiredId)).status === "expired" && (await artifacts(expiredId)).source === null, "Expiration did not close the signing and download window.");
  await db.exec("reset role");
  await auth(outsider, "aal2");
  await expectDatabaseError(() => file(agreementId, secondOrg), "AGREEMENT_FORBIDDEN");
  await auth(owner);
  await expectDatabaseError(() => file(), "MFA_REQUIRED");
  await auth(owner, "aal2");
  const filed = await file();
  assert(filed.documentId === documentId && filed.tenancyId === null && (await file()).documentId === documentId,
    "Filing did not make exactly one document selectable without creating a tenancy.");
  const date = (await db.query("select ((now() at time zone 'America/New_York')::date+2)::text as day")).rows[0].day;
  const members = [0, 1].map(index => ({
    firstName: index ? "Elisa" : "First", lastName: index ? "Peña" : "Renter",
    email: emails[index], phoneE164: "", primaryContact: index === 0, financiallyResponsible: true,
  }));
  const activationKey = randomUUID();
  const activate = (household, key = activationKey) => rpc("activate_existing_lease($1,$2,$3,$4::jsonb,$5::jsonb,0,$6,$7)", [
    organizationId,rental.propertyId,rental.unitId,JSON.stringify({ displayName: "Verified agreement household", members: household }),
    JSON.stringify({ source: "operator_supplied", startDate: date, endDate: "", rentAmountMinor: 100000,
      currencyCode: "USD", rentFrequency: "monthly", signedDocumentId: documentId }),date,key,
  ]);
  await expectDatabaseError(() => activate([{ ...members[0], email: "different@agreement.example" }, members[1]]), "AGREEMENT_HOUSEHOLD_MISMATCH");
  await db.exec("reset role");
  await db.query("update auth.users set email='changed@agreement.example' where id=$1", [renterTwo]);
  await auth(owner, "aal2");
  await expectDatabaseError(() => activate(members), "AGREEMENT_SIGNING_ADDRESS_CHANGED");
  assert((await filing()).tenancyId === null, "Failed activation linked the agreement to a tenancy.");
  await db.exec("reset role");
  await db.query("update auth.users set email=$1 where id=$2", [emails[1], renterTwo]);
  await auth(owner, "aal2");
  const tenancy = await activate(members);
  assert(tenancy.possessionStatus === "scheduled" && (await activate(members)).tenancyId === tenancy.tenancyId
    && (await filing()).tenancyId === tenancy.tenancyId, "Explicit activation did not reserve one exact scheduled tenancy.");
  await expectDatabaseError(() => activate(members, randomUUID()), "SIGNED_DOCUMENT_NOT_READY");
  await db.exec("reset role");
  const { rows: [bound] } = await db.query("select l.signed_document_version_id as version_id, l.executed_at=a.closed_at as execution_date_preserved,(select count(*)::int from public.tenancies where unit_id=$2) as count from public.leases l cross join private.rental_agreements a where l.id=$1 and a.id=$3", [tenancy.leaseId, rental.unitId, agreementId]);
  assert(bound.version_id === versionId && bound.execution_date_preserved && bound.count === 1, "Tenancy did not retain the source version, effective signature timestamp or atomicity.");
  await auth(renterOne);
  assert((await artifacts()).evidenceSha256 === completed.evidenceSha256, "Filing or activation changed the retained evidence.");
  await db.exec("reset role");
  const applicantHandoff = await validateApplicantAgreements(db, { assert, expectDatabaseError, organizationId,
    owner, renterOne, renterTwo, outsider, emails, wrongUnitVersion: versionId, migrationsApplied });
  return { filedIntoExactTenancy: true, rejectedSubstitutedRenter: true, rejectedChangedAddress: true, exactSource: true, exactDisclosure: true, multiPartyExecution: true, idempotent: true, scopeIsolated: true, tenantAccessUnchanged: true, executedEvidenceVerified: true, closeAndExpire: true, applicantHandoff };
}
