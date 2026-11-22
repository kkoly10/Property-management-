import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const migration = (name) => readFile(new URL(`../supabase/${name}`, import.meta.url), "utf8");

export async function validateRuntimeReliability(db, {
  assert, expectDatabaseError, organizationId, ownerUserId, documentId, platformAdmin, platformAgent,
}) {
  const service = () => db.exec("reset role; set role service_role");
  const authenticate = (id) => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${id}'; set request.jwt.claim.aal='aal2'`);
  const result = async (sql, parameters) => (await db.query(sql, parameters)).rows[0].result;
  const priorRun = randomUUID();
  const currentRun = randomUUID();
  const notification = randomUUID();
  const version = randomUUID();
  const scan = randomUUID();
  const sha = "3".repeat(64);

  await db.exec("reset role");
  await db.exec(await migration("migrations/20261122144012_queue_attempt_and_runtime_health.sql"));
  await db.query(`insert into private.notification_jobs
    (id,organization_id,template_code,locale,channel,recipient_address,payload,idempotency_key,available_at)
    values ($1,$2,'staff_invitation','en-US','email','audit@example.invalid','{}',$3,'2024-01-01')`,
  [notification, organizationId, `runtime-fixture:${notification}`]);
  await db.query(`insert into public.document_versions
    (id,organization_id,document_id,version_number,storage_bucket,storage_path,mime_type,size_bytes,
     sha256_hex,original_filename,uploaded_by,upload_status)
    values ($1,$2,$3,99,'private-documents',$4,'application/pdf',12,$5,'worker.pdf',$6,'quarantined')`,
  [version, organizationId, documentId, `runtime/${version}.pdf`, sha, ownerUserId]);
  await db.query(`insert into private.document_scan_jobs
    (id,organization_id,document_version_id,storage_bucket,storage_path,expected_sha256_hex,available_at)
    values ($1,$2,$3,'private-documents',$4,$5,'2024-01-01')`,
  [scan, organizationId, version, `runtime/${version}.pdf`, sha]);

  const claimBoth = async (run) => {
    const notifications = await result("select public.claim_notification_jobs('email',1,$1) as result", [run]);
    const scans = await result("select public.claim_document_scan_jobs(1,$1) as result", [run]);
    assert(notifications.jobs[0]?.notificationJobId === notification, "Fixture notification was not claimed.");
    assert(scans.jobs[0]?.documentScanJobId === scan, "Fixture scan was not claimed.");
  };
  const completeNotification = (run, receipt) => result(
    "select public.complete_notification_attempt($1,$2,'fixture-relay',$3) as result", [notification, run, receipt]);
  const completeScan = (run, digest = sha) => result(
    "select public.complete_document_scan_attempt($1,$2,'clean',$3,'fixture-scanner','scan-reference') as result", [scan, run, digest]);

  await authenticate(ownerUserId);
  await expectDatabaseError(() => completeNotification(priorRun, "fixture-receipt"), "permission denied");
  await expectDatabaseError(() => completeScan(priorRun), "permission denied");
  await expectDatabaseError(() => db.query("select public.record_runtime_heartbeat('notifications',now(),200)"), "permission denied");
  await service();
  await claimBoth(priorRun);
  await db.exec("reset role");
  await db.query("update private.notification_jobs set claimed_at=now()-interval '2 hours' where id=$1", [notification]);
  await db.query("update private.document_scan_jobs set claimed_at=now()-interval '2 hours' where id=$1", [scan]);
  await service();
  await db.query("select public.requeue_stalled_notification_jobs(30), public.requeue_stalled_document_scans(30)");
  await db.exec("reset role");
  await db.query("update private.notification_jobs set available_at='2024-01-01' where id=$1 and status='queued'", [notification]);
  await db.query("update private.document_scan_jobs set available_at='2024-01-01' where id=$1 and status='queued'", [scan]);
  await service();
  await claimBoth(currentRun);

  await expectDatabaseError(() => completeNotification(priorRun, "stale-receipt"), "QUEUE_ATTEMPT_STALE");
  await expectDatabaseError(() => completeScan(priorRun), "QUEUE_ATTEMPT_STALE");
  await expectDatabaseError(() => db.query("select public.fail_notification_attempt($1,$2,'TIMEOUT',true)", [notification, priorRun]), "QUEUE_ATTEMPT_STALE");
  await expectDatabaseError(() => db.query("select public.fail_document_scan_attempt($1,$2,'TIMEOUT',true)", [scan, priorRun]), "QUEUE_ATTEMPT_STALE");
  await expectDatabaseError(() => completeNotification(currentRun, " "), "NOTIFICATION_RECEIPT_REQUIRED");
  await expectDatabaseError(() => completeScan(currentRun, "8".repeat(64)), "SCAN_TARGET_MISMATCH");

  await db.exec("reset role");
  await db.exec(await migration("migrations-contract/20261122144145_retire_unfenced_queue_settlement.sql"));
  await service();
  await expectDatabaseError(() => db.query("select public.complete_notification_job($1,'fixture-relay','legacy')", [notification]), "permission denied");
  await expectDatabaseError(() => db.query("select public.complete_document_scan($1,'clean',$2,'fixture-scanner','legacy')", [scan, sha]), "permission denied");
  assert((await completeNotification(currentRun, "fixture-receipt")).status === "sent", "Current receipt could not settle after contraction.");
  assert((await completeNotification(currentRun, "fixture-receipt")).duplicate, "Notification settlement replay was not idempotent.");
  assert((await completeScan(currentRun)).uploadStatus === "clean", "Current scan did not settle the exact version.");
  assert((await completeScan(currentRun)).duplicate, "Scan settlement replay was not idempotent.");

  await db.query("select public.record_runtime_heartbeat('recurring-charges',now(),502)");
  await db.query("select public.record_runtime_heartbeat('recurring-charges',now()-interval '1 hour',200)");
  await db.query("select public.record_runtime_heartbeat('operational-sweep',now(),200)");
  await authenticate(platformAgent);
  await expectDatabaseError(() => db.query("select public.platform_business_overview_with_runtime()"), "NOT_PLATFORM_ADMIN");
  await authenticate(platformAdmin);
  const snapshot = await result("select public.platform_business_overview_with_runtime() as result");
  assert(snapshot.operations.runtime.heartbeats["recurring-charges"].status === 502,
    "An older completed tick overwrote a newer scheduler failure.");
  assert(snapshot.operations.runtime.heartbeats["operational-sweep"].status === 200,
    "A scheduler tick with no domain write left no heartbeat.");
  await db.exec("reset role");
}
