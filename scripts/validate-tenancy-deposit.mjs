import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function validateTenancyDeposit(db, { assert, expectDatabaseError }) {
  await db.exec(await readFile(new URL("../supabase/migrations/20261122152123_record_external_tenancy_deposits.sql", import.meta.url), "utf8"));
  const { rows: [fixture] } = await db.query(`
    select t.id as "tenancyId",u.id as actor,t.organization_id as "organizationId",
      t.property_id as "propertyId",(now() at time zone p.time_zone)::date::text as today,
      ((now() at time zone p.time_zone)::date+1)::text as tomorrow
    from public.tenancies t join public.properties p on p.id=t.property_id and p.name='Handback House'
    join auth.users u on u.email='closeout-owner@example.com' where t.status='closed'`);
  const { rows: [{ successorId }] } = await db.query(`select id as "successorId" from public.tenancies
    where property_id=$1 and id<>$2 and status='active'`, [fixture.propertyId, fixture.tenancyId]);
  const { rows: [users] } = await db.query(`
    select (select id from auth.users where email='closeout-auditor@example.com') as auditor,
      (select id from auth.users where email='closeout-leasing@example.com') as leasing`);
  const { actor, organizationId, tenancyId, propertyId, today, tomorrow } = fixture;
  const act = (id = actor) => db.exec("reset role; set role authenticated; set request.jwt.claim.sub='" + id + "'");
  const rpc = async (name, placeholders, args = []) => (await db.query(
    "select public." + name + "(" + placeholders + ") as result", args,
  )).rows[0].result;
  const get = (id = tenancyId) => rpc("get_tenancy_deposit", "$1,$2", [organizationId, id]);
  const record = (version, entry, key = randomUUID(), id = tenancyId) => rpc(
    "record_tenancy_deposit_entry", "$1,$2,$3,$4,$5::jsonb", [organizationId, id, version, key, JSON.stringify(entry)],
  );
  const moneyCounts = async () => (await db.query(`
    select (select count(*)::int from public.journal_transactions where organization_id=$1) as journals,
      (select count(*)::int from public.payments where organization_id=$1) as payments,
      (select count(*)::int from public.charges where organization_id=$1) as charges`, [organizationId])).rows[0];
  const before = await moneyCounts();
  const document = async (status, type = "deposit_evidence") => {
    const [id, version] = [randomUUID(), randomUUID()];
    await db.query(`insert into public.documents(id,organization_id,property_id,document_type,title,created_by)
      values($1,$2,$3,$4,'Synthetic deposit evidence',$5)`, [id, organizationId, propertyId, type, actor]);
    await db.query(`insert into public.document_versions(id,organization_id,document_id,version_number,storage_bucket,
      storage_path,mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status)
      values($1,$2,$3,1,'private-documents',$4,'application/pdf',100,$5,'evidence.pdf',$6,$7)`,
    [version, organizationId, id, version + ".pdf", "d".repeat(64), actor, status]);
    return version;
  };
  // Seed explicit scan result fixtures. Upload grants are tested separately without contacting storage.
  const evidence = await document("clean");
  const pending = await document("quarantined");
  const unrelated = await document("clean", "property_record");
  const obligation = { kind: "obligation", effectiveOn: today, amountMinor: 120000 };
  const receipt = { kind: "receipt", effectiveOn: today, amountMinor: 100000,
    reference: "EXT-REC-101", custodian: "External custody file", confirmed: true };
  const refund = { kind: "refund", effectiveOn: today, amountMinor: 50000, reference: "EXT-REF-201", confirmed: true };
  const correction = { kind: "correction", detail: "Corrected from the external custodian’s record" };

  await act(users.leasing);
  await expectDatabaseError(() => get(), "TENANCY_DEPOSIT_NOT_FOUND");
  await act(users.auditor);
  const readOnly = await get();
  assert(readOnly.version===0 && !readOnly.canManage && !readOnly.canUploadEvidence && readOnly.evidenceOptions.length===0,
    "Read-only finance scope gained document or financial write permission.");
  await expectDatabaseError(() => record(0, obligation), "TENANCY_DEPOSIT_NOT_FOUND");
  await act();
  await expectDatabaseError(() => rpc("get_tenancy_deposit", "$1,$2", [randomUUID(), tenancyId]), "TENANCY_DEPOSIT_NOT_FOUND");
  await expectDatabaseError(() => record(0, receipt), "DEPOSIT_OBLIGATION_REQUIRED");
  const grant = await rpc("create_document_upload_grant", "$1,'property',$2,'deposit_evidence','Move-out evidence','evidence.pdf','application/pdf',128,$3",
    [organizationId, propertyId, randomUUID()]);
  assert(grant.storagePath.includes(propertyId), "Deposit upload grant was not anchored to the property document workflow.");
  const key = randomUUID();
  const first = await record(0, obligation, key);
  const replay = await record(0, obligation, key);
  assert(first.entryId===replay.entryId && replay.version===1, "Replaying the obligation changed the register.");
  await expectDatabaseError(() => record(0, { ...obligation, amountMinor: 0 }, key), "DEPOSIT_IDEMPOTENCY_CONFLICT");
  await expectDatabaseError(() => record(0, receipt), "DEPOSIT_VERSION_CONFLICT");
  await expectDatabaseError(() => record(1, { ...obligation, amountMinor: 130000 }), "DEPOSIT_CORRECTION_REASON_REQUIRED");
  await expectDatabaseError(() => record(1, { ...receipt, confirmed: false }), "INVALID_DEPOSIT_ENTRY");
  await expectDatabaseError(() => record(1, { ...receipt, effectiveOn: tomorrow }), "INVALID_DEPOSIT_ENTRY");

  const receiptA = await record(1, receipt);
  await expectDatabaseError(() => record(2, { ...receipt, reference: "ext-rec-101" }), "DEPOSIT_RECEIPT_REFERENCE_EXISTS");
  const receiptB = await record(2, { ...receipt, amountMinor: 20000, reference: "EXT-REC-102" });
  await record(3, { ...refund, targetId: receiptA.entryId });
  await expectDatabaseError(() => record(4, { ...refund, targetId: receiptA.entryId, amountMinor: 50001 }), "DEPOSIT_AMOUNT_EXCEEDS_HELD");
  const deduction = { kind: "deduction", effectiveOn: today, amountMinor: 30000, reference: "EXT-DEC-1",
    confirmed: true, targetId: receiptA.entryId, detail: "Externally documented cleaning cost", evidenceVersionId: evidence,
    noticeReference: "NOTICE-TEST-1", approvalReference: "APPROVAL-TEST-1" };
  await expectDatabaseError(() => record(4, { ...deduction, evidenceVersionId: pending }), "DEPOSIT_EVIDENCE_NOT_READY");
  await expectDatabaseError(() => record(4, { ...deduction, evidenceVersionId: unrelated }), "DEPOSIT_EVIDENCE_NOT_READY");
  await expectDatabaseError(() => record(4, { ...deduction, noticeReference: "" }), "INVALID_DEPOSIT_ENTRY");
  await record(4, deduction);
  const other = await record(5, { ...refund, kind: "other", amountMinor: 20000, reference: "EXT-OTHER-1",
    targetId: receiptA.entryId, detail: "External disposition noted in custody statement" });
  const afterDisposition = await get();
  assert(afterDisposition.receivedMinor==="120000" && afterDisposition.disposedMinor==="100000"
    && afterDisposition.heldMinor==="20000" && afterDisposition.entries.find((e) => e.id===receiptA.entryId).remainingMinor==="0",
  "Receipt lots did not reconcile after itemized dispositions.");
  await expectDatabaseError(() => record(6, { ...correction, targetId: receiptA.entryId }), "DEPOSIT_RECEIPT_HAS_DISPOSITIONS");
  await record(6, { ...correction, targetId: other.entryId });
  await record(7, { ...correction, targetId: receiptB.entryId });
  await expectDatabaseError(() => record(8, { ...refund, targetId: receiptB.entryId, amountMinor: 1 }), "DEPOSIT_TARGET_INVALID");
  await expectDatabaseError(() => record(8, { ...correction, targetId: other.entryId }), "DEPOSIT_TARGET_INVALID");
  await record(8, { ...obligation, amountMinor: 100000, detail: "Corrected recorded obligation to match signed agreement" });
  const end = await get();
  assert(end.obligationMinor==="100000" && end.receivedMinor==="100000" && end.disposedMinor==="80000" && end.heldMinor==="20000"
    && end.entries.length===9 && end.entries.find((e) => e.id===other.entryId).corrected,
  "Append-only corrections failed to preserve prior entries or recompute the balance.");
  const otherTenancy = await get(successorId);
  assert(otherTenancy.obligationMinor===null && otherTenancy.entries.length===0 && !otherTenancy.evidenceOptions.some((e) => e.id===evidence),
    "A successor could see the previous tenancy’s balance or its pinned evidence.");
  await record(0, obligation, randomUUID(), successorId);
  const successorReceipt = await record(1, receipt, randomUUID(), successorId);
  await expectDatabaseError(() => record(2, deduction, randomUUID(), successorId), "DEPOSIT_TARGET_INVALID");
  await expectDatabaseError(() => record(2, { ...deduction, targetId: successorReceipt.entryId }, randomUUID(), successorId), "DEPOSIT_EVIDENCE_NOT_READY");

  await db.exec("reset role");
  const after = await moneyCounts();
  assert(JSON.stringify(before)===JSON.stringify(after), "External deposit evidence created a ledger, charge, or payment entry.");
  const { rows: [eventCounts] } = await db.query(`select
    (select count(*)::int from audit.audit_events where organization_id=$1 and resource_type='tenancy_deposit_entry') as audits,
    (select count(*)::int from private.outbox_events where organization_id=$1 and aggregate_type='tenancy_deposit_entry') as events`, [organizationId]);
  assert(eventCounts.audits===11 && eventCounts.events===11, "Deposit history did not emit exactly one audit and outbox event for each committed entry.");
  return { exactObligation: true, externalReceipt: true, itemizedDisposition: true, scopedEvidence: true,
    immutableCorrections: true, fundsUntouched: true };
}
