import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const publishedDisclosure = "esign_consent@1.0.0#260463bcf84a7827";

export async function validateDocumentSigningBoundary(db, {
  assert, expectDatabaseError, organizationId, admin, signer, personId, outsider, documentId, versionId,
}) {
  const migration = (path) => readFile(new URL(path, import.meta.url), "utf8");
  await db.exec("reset role");
  await db.exec(await migration("../supabase/migrations/20261122072817_signing_review_and_access.sql"));

  const authenticate = (id) => db.exec("reset role; set role authenticated; set request.jwt.claim.sub='" + id + "'");
  const sign = (deliveryId, key, { actor = signer, version = versionId, sha = versionSha, consent = publishedDisclosure } = {}) =>
    db.query("select public.sign_reviewed_document($1,$2,$3,$4,$5,'Audit Fixture Signer',$6,$7) as receipt",
      [actor, organizationId, deliveryId, version, sha, consent, key]);

  const { rows: [baseVersion] } = await db.query("select * from public.document_versions where id=$1", [versionId]);
  const versionSha = baseVersion.sha256_hex;
  const siblingId = randomUUID();
  const quarantineId = randomUUID();
  const siblingHashes = ["7".repeat(64), "8".repeat(64)];

  for (const [index, id] of [siblingId, quarantineId].entries()) {
    const filename = index === 0 ? "clean-sibling.pdf" : "quarantined-sibling.pdf";
    const status = index === 0 ? "clean" : "quarantined";
    await db.query("insert into public.document_versions(id,organization_id,document_id,version_number,storage_bucket,storage_path,mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status) values ($1,$2,$3,$4,'private-documents',$5,'application/pdf',120,$6,$7,$8,$9)",
      [id, organizationId, documentId, index + 2, filename, siblingHashes[index], filename, admin, status]);
    await db.query("insert into storage.objects(bucket_id,name) values ('private-documents',$1)", [filename]);
  }

  await authenticate(admin);
  const deliver = (required, key, { channel = "portal", version = versionId } = {}) =>
    db.query("select public.deliver_document_with_purpose($1,$2,'resident_person',$3,$4,$5,$6,$7) as receipt",
      [organizationId, version, personId, channel, channel === "secure_link" ? 1 : null, key, required])
      .then(result => result.rows[0].receipt);
  const implicit = await deliver(false, "signing-fixture-receipt-only");
  const requested = await deliver(true, "signing-fixture-requested");
  assert(!implicit.signatureRequested && requested.signatureRequested, "Delivery did not record the explicit signature choice.");
  assert((await deliver(true, "signing-fixture-requested")).documentDeliveryId === requested.documentDeliveryId, "Wrapped delivery retry duplicated its row.");
  await expectDatabaseError(() => deliver(true, "signing-fixture-receipt-only"), "IDEMPOTENCY_CONFLICT");

  await db.exec("reset role");
  await db.exec(await migration("../supabase/migrations-contract/20261122072946_retire_unbound_signing_and_broad_download.sql"));
  const { rows: [grants] } = await db.query("select has_function_privilege('authenticated','public.sign_document(uuid,uuid,text,boolean,text,boolean,text,text,text,text)','execute') as legacy, has_function_privilege('authenticated','public.sign_reviewed_document(uuid,uuid,uuid,uuid,text,text,text,text)','execute') as reviewed, has_function_privilege('service_role','public.sign_reviewed_document(uuid,uuid,uuid,uuid,text,text,text,text)','execute') as trusted");
  assert(!grants.legacy && !grants.reviewed && grants.trusted, "Signing contract grants did not isolate the trusted server writer.");
  await authenticate(signer);
  await expectDatabaseError(() => sign(requested.documentDeliveryId, "signing-fixture-rpc-direct"), "permission denied");
  const { rows: versions } = await db.query("select id from public.document_versions where document_id=$1", [documentId]);
  assert(versions.length === 1 && versions[0].id === versionId, "A delivery-only recipient read a different version.");
  const rawObjects = () => db.query("select * from storage.objects where name in ('clean-sibling.pdf','quarantined-sibling.pdf')");
  assert((await rawObjects()).rows.length === 0, "Recipient storage policy exposed an undelivered sibling.");
  await authenticate(admin);
  assert((await rawObjects()).rows.map(row => row.name).join() === "clean-sibling.pdf", "Document manager storage access did not require a clean file.");

  const service = () => db.exec("reset role; set role service_role");
  await service();
  await expectDatabaseError(() => sign(implicit.documentDeliveryId, "signing-fixture-read-only"), "DOCUMENT_NOT_SIGNABLE");
  await expectDatabaseError(() => sign(requested.documentDeliveryId, "signing-fixture-outsider", { actor: outsider }), "DOCUMENT_DELIVERY_FORBIDDEN");
  await expectDatabaseError(() => sign(requested.documentDeliveryId, "signing-fixture-false-disclosure", { consent: "esign_consent@1.0.0#deadbeef" }), "ESIGN_CONSENT_VERSION_CHANGED");
  await expectDatabaseError(() => sign(requested.documentDeliveryId, "signing-fixture-sibling", { version: siblingId, sha: siblingHashes[0] }), "DOCUMENT_REVIEW_CHANGED");
  await expectDatabaseError(() => sign(requested.documentDeliveryId, "signing-fixture-wrong-sha", { sha: siblingHashes[0] }), "DOCUMENT_REVIEW_CHANGED");

  const deliveryState = async (status, expiresAt = null) => {
    await db.exec("reset role");
    await db.query("update public.document_deliveries set status=$1,expires_at=$2 where id=$3", [status, expiresAt, requested.documentDeliveryId]);
    await service();
  };
  for (const status of ["revoked", "queued", "failed"]) {
    await deliveryState(status);
    await expectDatabaseError(() => sign(requested.documentDeliveryId, "signing-fixture-" + status), "DOCUMENT_NOT_SIGNABLE");
  }
  await deliveryState("delivered", "2020-01-01T00:00:00Z");
  await expectDatabaseError(() => sign(requested.documentDeliveryId, "signing-fixture-expired"), "DOCUMENT_NOT_SIGNABLE");
  await deliveryState("delivered");

  await db.exec("reset role");
  await db.query("update public.user_relationships set status='revoked' where organization_id=$1 and user_id=$2 and relationship_id=$3", [organizationId, signer, personId]);
  await service();
  await expectDatabaseError(() => sign(requested.documentDeliveryId, "signing-fixture-relationship"), "DOCUMENT_DELIVERY_FORBIDDEN");
  await db.exec("reset role");
  await db.query("update public.user_relationships set status='active' where organization_id=$1 and user_id=$2 and relationship_id=$3", [organizationId, signer, personId]);
  await db.query("update public.documents set status='void' where id=$1", [documentId]);
  await service();
  await expectDatabaseError(() => sign(requested.documentDeliveryId, "signing-fixture-void"), "DOCUMENT_NOT_SIGNABLE");
  await db.exec("reset role");
  await db.query("update public.documents set status='active' where id=$1", [documentId]);

  await authenticate(admin);
  const declinedDelivery = await deliver(true, "signing-fixture-decline-request");
  const decline = (deliveryId, key) => db.query("select public.acknowledge_document_delivery($1,$2,'declined',$3,null,$4)",
    [organizationId, deliveryId, versionSha, key]);
  await authenticate(signer);
  await decline(declinedDelivery.documentDeliveryId, "signing-fixture-decline");
  await service();
  await expectDatabaseError(() => sign(declinedDelivery.documentDeliveryId, "signing-fixture-after-decline"), "DOCUMENT_NOT_SIGNABLE");
  const { rows: [{ receipt }] } = await sign(requested.documentDeliveryId, "signing-fixture-valid");
  assert(receipt.documentVersionId === versionId && receipt.documentSha256 === versionSha, "Trusted signature did not bind the reviewed file.");
  await authenticate(signer);
  await expectDatabaseError(() => decline(requested.documentDeliveryId, "signing-fixture-after-sign"), "DOCUMENT_ALREADY_SIGNED");

  await deliveryState("revoked");
  const { rows: [{ receipt: replay }] } = await sign(requested.documentDeliveryId, "signing-fixture-valid");
  assert(replay.signatureId === receipt.signatureId, "Stored signing replay should survive request revocation without a new write.");
  await authenticate(signer);
  const { rows: [evidence] } = await db.query("select ip_address,user_agent,auth_assurance_level from public.document_signatures where id=$1", [receipt.signatureId]);
  assert(evidence && Object.values(evidence).every(value => value === null), "New signature must omit unverified transport attribution.");
  await authenticate(admin);
  const email = await deliver(true, "signing-fixture-email", { channel: "email" });
  const secure = await deliver(true, "signing-fixture-secure", { version: siblingId, channel: "secure_link" });
  assert(email.status === "queued" && secure.status === "queued", "Off-portal requests should be queued pending the notification outcome.");
  await service();
  await expectDatabaseError(() => sign(email.documentDeliveryId, "signing-fixture-email-queued"), "DOCUMENT_NOT_SIGNABLE");
  const { rows: [{ jobs }] } = await db.query("select public.claim_notification_jobs('email',100,'signing-fixture-email-worker') as jobs");
  for (const delivery of [email, secure]) {
    const job = jobs.jobs.find(candidate => candidate.payload.documentDeliveryId === delivery.documentDeliveryId);
    assert(job, "The requested delivery was not queued for the email worker.");
    await db.query("select public.complete_notification_job($1::uuid,'relay','fixture-'||($1::uuid)::text)", [job.notificationJobId]);
  }
  const { rows: [{ receipt: emailReceipt }] } = await sign(email.documentDeliveryId, "signing-fixture-sent-email");
  assert(emailReceipt.documentVersionId === versionId, "A notification-accepted email request did not sign the pinned version.");

  const visibleSibling = () => db.query("select id from public.document_versions where id=$1", [siblingId]);
  await authenticate(signer);
  assert((await visibleSibling()).rows.length === 1, "A sent unexpired secure delivery should open its exact clean version.");
  await db.exec("reset role");
  await db.query("update public.document_deliveries set expires_at=now()-interval '1 minute' where id=$1", [secure.documentDeliveryId]);
  await authenticate(signer);
  assert((await visibleSibling()).rows.length === 0, "An expired unsigned secure delivery must not grant storage or version reads.");
  await service();
  await expectDatabaseError(
    () => sign(secure.documentDeliveryId, "signing-fixture-expired-secure", { version: siblingId, sha: siblingHashes[0] }),
    "DOCUMENT_NOT_SIGNABLE",
  );
  await db.exec("reset role");

  return { exactVersionAccess: true, cleanStorageGate: true, trustedWriteOnly: true, signatureReplay: true };
}
