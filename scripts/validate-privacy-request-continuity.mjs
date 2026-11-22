import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function validatePrivacyRequestContinuity(db, { assert, expectDatabaseError, organizationId, otherOrganizationId }) {
  await db.exec("reset role");
  const [requester, neighbor, reviewer, personId] = Array.from({ length: 4 }, () => randomUUID());
  await db.query("insert into auth.users(id) values ($1),($2),($3)", [requester, neighbor, reviewer]);
  await db.query(`insert into public.people(id,organization_id,first_name,last_name) values ($1,$2,'Former','Resident')`,
    [personId, organizationId]);
  await db.query(`insert into public.user_relationships(user_id,organization_id,relationship_type,relationship_id,status)
    values ($1,$2,'resident_person',$3,'active')`, [requester, organizationId, personId]);
  await db.query(`insert into public.organization_memberships(organization_id,user_id,role_code,status)
    values ($1,$3,'org_admin','active'),($2,$3,'org_admin','active'),($2,$4,'org_admin','active'),($1,$5,'org_admin','active')`,
  [organizationId, otherOrganizationId, reviewer, requester, neighbor]);

  const signIn = (userId, level = "aal2") =>
    db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${userId}'; set request.jwt.claim.aal='${level}'`);
  const command = async (sql, inputs = []) => (await db.query(sql, inputs)).rows[0].receipt;
  const submit = (orgId, type, key, jurisdiction = null) =>
    command("select public.submit_privacy_request($1,$2,$3,$4) as receipt", [orgId, type, jurisdiction, key]);
  const receipt = (id) => command("select public.get_own_privacy_request_receipt($1) as receipt", [id]);
  const personal = () => command("select public.get_relationship_privacy_request_workspace() as receipt");
  const workplace = (orgId) => command("select public.get_privacy_request_workspace($1) as receipt", [orgId]);
  const cancel = (id, version, key) =>
    command("select public.cancel_privacy_request($1,$2,'Fixture cancellation.',$3) as receipt", [id, version, key]);

  await signIn(requester);
  const legacy = await submit(organizationId, "access", "privacy-continuity-legacy");
  const platform = await submit(null, "restriction", "privacy-continuity-platform");
  await signIn(neighbor);
  const foreign = await submit(organizationId, "correction", "privacy-continuity-foreign");
  await signIn(requester, "aal1");
  const pending = await submit(organizationId, "export", "privacy-continuity-pending");
  await db.exec("reset role");
  await db.exec(await readFile(new URL(
    "../supabase/migrations/20261122151039_preserve_privacy_request_receipts.sql", import.meta.url
  ), "utf8"));

  await signIn(reviewer);
  const operatorCases = await workplace(organizationId);
  const otherWorkspace = await workplace(otherOrganizationId);
  assert(operatorCases.items.some(item => item.privacyRequestId === legacy.privacyRequestId)
    && operatorCases.items.every(item => item.organizationId === organizationId && !item.canViewReceipt),
  "Authorized review failed to stay scoped to the selected organization.");
  assert(!otherWorkspace.items.some(item => item.privacyRequestId === legacy.privacyRequestId),
    "A second workspace inherited the first workspace's request.");
  assert((await personal()).items.length === 0, "Personal history inherited workspace review permissions.");
  await expectDatabaseError(() => receipt(legacy.privacyRequestId), "PRIVACY_REQUEST_NOT_FOUND");

  await db.exec("reset role");
  await db.query(`update public.user_relationships set status='revoked'
    where user_id=$1 and organization_id=$2`, [requester, organizationId]);
  await db.query(`update public.organization_memberships set status='revoked'
    where user_id=$1 and organization_id=$2`, [reviewer, organizationId]);

  await signIn(requester, "aal1");
  const ownCases = await personal();
  assert(ownCases.organizations.length === 0
    && ownCases.items.some(item => item.privacyRequestId === legacy.privacyRequestId)
    && ownCases.items.some(item => item.privacyRequestId === platform.privacyRequestId)
    && !ownCases.items.some(item => item.privacyRequestId === foreign.privacyRequestId),
  "A former resident's exact personal cases were lost or foreign cases appeared.");
  assert(!(await workplace(otherOrganizationId)).items.some(item => item.privacyRequestId === legacy.privacyRequestId),
    "The requester's former organization history appeared in their current workspace.");
  await expectDatabaseError(() => workplace(organizationId), "ORGANIZATION_SCOPE_DENIED");
  await expectDatabaseError(() => receipt(legacy.privacyRequestId), "MFA_STEP_UP_REQUIRED");
  await expectDatabaseError(() => receipt(foreign.privacyRequestId), "PRIVACY_REQUEST_NOT_FOUND");
  await expectDatabaseError(() => receipt(pending.privacyRequestId), "PRIVACY_REQUEST_NOT_FOUND");
  await expectDatabaseError(() => submit(organizationId, "access", "privacy-continuity-new"), "ORGANIZATION_SCOPE_DENIED");
  const replay = await submit(organizationId, "access", "privacy-continuity-legacy");
  assert(JSON.stringify(replay) === JSON.stringify(legacy), "A legacy intake could not confirm its receipt after relationship loss.");
  await expectDatabaseError(() => submit(organizationId, "export", "privacy-continuity-legacy"), "IDEMPOTENCY_CONFLICT");

  await signIn(requester);
  const verified = await command("select public.verify_privacy_request($1,1,$2) as receipt",
    [pending.privacyRequestId, "privacy-continuity-verify"]);
  assert(verified.status === "operator_action_required" && verified.version === 2,
    "A pending case could not complete verification after relationship loss.");
  const canceled = await cancel(pending.privacyRequestId, verified.version, "privacy-continuity-cancel");
  assert(canceled.status === "canceled" && canceled.version === 3
    && JSON.stringify(await cancel(pending.privacyRequestId, verified.version, "privacy-continuity-cancel")) === JSON.stringify(canceled),
  "Cancel did not return a stable terminal result.");
  await expectDatabaseError(() => cancel(pending.privacyRequestId, 3, "privacy-continuity-new-cancel"), "PRIVACY_REQUEST_NOT_CANCELABLE");
  await expectDatabaseError(() => db.query("select requester_user_id from public.privacy_requests"), "permission denied");
  await expectDatabaseError(() => db.query("select result from private.privacy_request_jobs"), "permission denied");

  await db.exec("reset role");
  await db.query(`delete from private.idempotency_records where resource_id=$1 and route in ('SubmitPrivacyRequest','VerifyPrivacyRequest','CancelPrivacyRequest')`,
    [pending.privacyRequestId]);
  const jobs = (await db.query(`select status from private.privacy_request_jobs where privacy_request_id=$1`,
    [pending.privacyRequestId])).rows;
  assert(jobs.length === 2 && jobs.every(job => job.status === "canceled"), "Cancellation did not retire the private jobs.");
  await signIn(requester);
  const terminal = await receipt(pending.privacyRequestId);
  assert(terminal.privacyRequestId === pending.privacyRequestId && terminal.status === "canceled"
    && terminal.completedAt && terminal.identityVerifiedAt
    && Object.keys(terminal).length === 8 && !("decisionReason" in terminal) && !("exportDocumentVersionId" in terminal),
  "The durable receipt failed after idempotency cleanup or exposed a private field.");
  await db.exec("reset role");
  await db.query(`insert into public.privacy_requests
      (requester_user_id,request_type,controller_role,due_at,created_at)
    select $1,'access','platform',now()+interval '30 days',now()+n*interval '1 second'
      from generate_series(1,101) n`, [requester]);
  await signIn(requester);
  const recent = await personal();
  const older = (cursor) => command("select public.get_relationship_privacy_request_workspace($1) as receipt", [cursor]);
  const historical = await older(recent.nextCursor);
  assert(recent.items.length === 100 && !recent.items.some(item => item.privacyRequestId === pending.privacyRequestId)
    && historical.items.some(item => item.privacyRequestId === pending.privacyRequestId)
    && historical.items.every(item => !recent.items.some(current => current.privacyRequestId === item.privacyRequestId))
    && !historical.nextCursor && (await older(foreign.privacyRequestId)).items.length === 0,
  "History pagination lost the old receipt or accepted a foreign cursor.");
  await signIn(reviewer);
  await expectDatabaseError(() => workplace(organizationId), "ORGANIZATION_SCOPE_DENIED");
  await expectDatabaseError(() => receipt(pending.privacyRequestId), "PRIVACY_REQUEST_NOT_FOUND");
  await db.exec("reset role; set role anon");
  await expectDatabaseError(() => receipt(pending.privacyRequestId), "permission denied");
  await db.exec("reset role");

  return { selectedWorkspaceIsolated: true, exactSelfHistory: true, receiptStepUp: true,
    legacyIntakeReplayAfterAccessEnds: true, verifiedAfterRelationshipEnds: true, durableCancellationReceipt: true,
    personalHistoryPagination: true };
}
