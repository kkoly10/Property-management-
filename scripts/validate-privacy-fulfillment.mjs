import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function validatePrivacyFulfillment(db, { assert, expectDatabaseError, organizationId, otherOrganizationId }) {
  await db.exec("reset role");
  await db.exec(await readFile(new URL(
    "../supabase/migrations/20261122161723_phase_8_privacy_fulfillment.sql", import.meta.url
  ), "utf8"));
  const [requester, reviewer, neighbor] = Array.from({ length: 3 }, () => randomUUID());
  await db.query("insert into auth.users(id,email,raw_user_meta_data) values ($1,'privacy-export@example.invalid',$4),($2,'reviewer@example.invalid','{}'),($3,'foreign@example.invalid','{}')",
    [requester, reviewer, neighbor, { mustNeverExport: "private auth fixture" }]);
  await db.query("insert into public.organization_memberships(organization_id,user_id,role_code,status) values ($1,$3,'org_admin','active'),($1,$4,'org_admin','active'),($2,$4,'org_admin','active')",
    [organizationId, otherOrganizationId, requester, reviewer]);
  await db.query("insert into public.notification_preferences(user_id,category,channel,enabled) values ($1,'messages','email',true),($2,'announcements','push',false)",
    [requester, neighbor]);
  await db.query(`insert into public.consent_records
    (user_id,organization_id,consent_type,purpose_code,legal_document_version,status,locale,source_surface,evidence_hash)
    values ($1,null,'platform_fixture','test','1','declined','en-US','test','private hash'),
           ($1,$2,'rental_fixture','test','1','declined','en-US','test','private hash')`, [requester, organizationId]);

  const signIn = (user, aal = "aal2") =>
    db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${user}'; set request.jwt.claim.aal='${aal}'`);
  const rpc = async (sql, args = []) => (await db.query(sql, args)).rows[0].receipt;
  const submit = (id, type, key) =>
    rpc("select public.submit_privacy_request($1,$2,null,$3) as receipt", [id, type, key]);
  const readExport = (id) => rpc("select public.get_own_privacy_account_export($1) as receipt", [id]);
  const readReceipt = (id) => rpc("select public.get_own_privacy_request_receipt($1) as receipt", [id]);
  const outcome = (organization, id, disposition = "fulfilled", version = 1, key = "privacy-fulfillment-review") =>
    rpc("select public.record_operator_privacy_outcome($1,$2,$3,$4,'Your workspace recorded a decision.','PRIVACY-432',$5) as receipt",
      [organization, id, version, disposition, key]);

  await signIn(requester);
  const platform = await submit(null, "export", "privacy-fulfillment-own");
  const scoped = await submit(organizationId, "correction", "privacy-fulfillment-workspace");
  const deletion = await submit(organizationId, "deletion", "privacy-fulfillment-deletion");
  const file = await readExport(platform.privacyRequestId);
  assert(file.scope === "crecy_platform_account" && file.account.email === "privacy-export@example.invalid"
    && file.notificationPreferences.length === 1 && file.notificationPreferences[0].category === "messages"
    && file.platformConsents.length === 1 && file.platformConsents[0].type === "platform_fixture"
    && !JSON.stringify(file).includes("private hash") && !JSON.stringify(file).includes("private auth fixture"),
  "Account export disclosed other tenants or private evidence.");
  assert((await readReceipt(platform.privacyRequestId)).canDownloadAccountExport === true,
    "The exact self receipt did not expose the account file.");
  await expectDatabaseError(() => readExport(scoped.privacyRequestId), "PRIVACY_EXPORT_NOT_FOUND");
  await signIn(requester, "aal1");
  await expectDatabaseError(() => readExport(platform.privacyRequestId), "MFA_STEP_UP_REQUIRED");
  const pending = await submit(null, "export", "privacy-fulfillment-pending");
  await expectDatabaseError(() => readExport(pending.privacyRequestId), "PRIVACY_EXPORT_NOT_FOUND");
  await signIn(neighbor);
  await expectDatabaseError(() => readExport(platform.privacyRequestId), "PRIVACY_EXPORT_NOT_FOUND");
  await expectDatabaseError(() => outcome(organizationId, scoped.privacyRequestId), "ORGANIZATION_SCOPE_DENIED");

  await signIn(reviewer, "aal1");
  await expectDatabaseError(() => outcome(organizationId, scoped.privacyRequestId), "MFA_STEP_UP_REQUIRED");
  await signIn(reviewer);
  await expectDatabaseError(() => readExport(platform.privacyRequestId), "PRIVACY_EXPORT_NOT_FOUND");
  await expectDatabaseError(() => outcome(otherOrganizationId, scoped.privacyRequestId), "PRIVACY_REQUEST_NOT_FOUND");
  await expectDatabaseError(() => outcome(organizationId, scoped.privacyRequestId, "fulfilled", 2), "VERSION_CONFLICT");
  await expectDatabaseError(() => outcome(organizationId, deletion.privacyRequestId), "PRIVACY_FULL_FULFILLMENT_UNAVAILABLE");

  await db.exec("reset role");
  await db.query("update private.privacy_request_jobs set status='blocked_by_hold' where privacy_request_id=$1 and job_type='delete'", [deletion.privacyRequestId]);
  await signIn(reviewer);
  const resolved = await outcome(organizationId, scoped.privacyRequestId);
  assert(resolved.status === "fulfilled" && resolved.version === 2
    && JSON.stringify(await outcome(organizationId, scoped.privacyRequestId)) === JSON.stringify(resolved),
  "Outcome did not preserve an exact idempotent receipt.");
  await expectDatabaseError(() => outcome(organizationId, scoped.privacyRequestId, "denied"), "IDEMPOTENCY_CONFLICT");
  const denied = await outcome(organizationId, deletion.privacyRequestId, "denied", 1, "privacy-fulfillment-hold");
  assert(denied.status === "denied", "A reviewed retained deletion did not record its outcome.");
  await expectDatabaseError(() => readReceipt(scoped.privacyRequestId), "PRIVACY_REQUEST_NOT_FOUND");

  await signIn(requester);
  const receipt = await readReceipt(scoped.privacyRequestId);
  assert(receipt.decisionReason === "Your workspace recorded a decision."
    && !JSON.stringify(receipt).includes("PRIVACY-432"),
  "The personal receipt did not limit the decision to its requester-facing fields.");
  await db.exec("reset role");
  const jobs = (await db.query("select status from private.privacy_request_jobs where privacy_request_id=$1",
    [deletion.privacyRequestId])).rows;
  assert(jobs.some(job => job.status === "blocked_by_hold") && jobs.every(job => ["blocked_by_hold","canceled"].includes(job.status)),
    "The operator outcome released a hold or left queued deletion work.");
  const audit = (await db.query("select after_data from audit.audit_events where resource_id=$1 and action_code='privacy_request.operator_outcome_recorded'",
    [scoped.privacyRequestId])).rows;
  assert(audit.length === 1 && audit[0].after_data.reviewReference === "PRIVACY-432", "Audit receipt failed or duplicated on replay.");
  return { exactAccountExport: true, mfaAndWorkspaceScope: true, durableOperatorDecision: true, holdsPreserved: true };
}
