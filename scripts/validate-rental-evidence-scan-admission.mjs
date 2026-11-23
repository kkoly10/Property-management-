import { randomUUID } from "node:crypto";

export async function validateRentalEvidenceScanAdmission(connection, { assert, expectDatabaseError }, fixture) {
  const { applicationId, organizationId, applicantId, digest } = fixture;
  const ids = Array.from({ length: 4 }, () => randomUUID());
  const [first, exact, third, fourth] = ids;
  const claimOne = randomUUID();
  const batchClaim = randomUUID();
  const retry = randomUUID();
  const result = async (sql, args) => (await connection.query(`select public.${sql} as result`, args)).rows[0].result;
  const claim = (runId, limit, fileId = null) => result("claim_rental_evidence_scan_batch($1,$2,$3)", [runId, limit, fileId]);

  await connection.exec("begin");
  try {
    await connection.exec("reset role");
    await connection.query(`insert into private.rental_application_evidence_files(
      id,organization_id,application_id,uploader_user_id,document_type,object_key,
      content_type,size_bytes,sha256,status,next_scan_at
    ) select id,$1,$2,$3,'income_evidence',format('%s/%s/%s',$1::uuid,$2::uuid,id),
      'application/pdf',13,$4,'quarantined',now()-interval '1 day'
    from unnest($5::uuid[]) as fixture(id)`, [organizationId, applicationId, applicantId, digest, ids]);

    await connection.exec("set local role authenticated");
    await connection.exec("savepoint denied_scan_claim");
    await expectDatabaseError(() => claim(claimOne, 1, exact), "permission denied");
    await connection.exec("rollback to savepoint denied_scan_claim");

    await connection.exec("set local role service_role");
    assert((await claim(claimOne, 1, randomUUID())).length === 0, "An unrecognized exact file claimed different evidence.");
    const one = await claim(claimOne, 1, exact);
    assert(one.length === 1 && one[0].id === exact, "The expedited claim did not return the exact file.");
    assert((await claim(randomUUID(), 1, exact)).length === 0, "A competing worker claimed a live lease.");

    const batch = await claim(batchClaim, 3);
    assert(batch.length === 2 && batch.every(({ id }) => [first, third, fourth].includes(id)),
      "The scheduled worker did not fill the remaining two scan slots.");
    const pending = [first, third, fourth].find((id) => batch.every((item) => item.id !== id));
    assert((await claim(randomUUID(), 1, pending)).length === 0
      && (await result("claim_rental_evidence_scan($1)", [randomUUID()])) === null,
    "An exact or legacy worker bypassed the global capacity limit.");
    assert(!(await result("settle_rental_evidence_scan($1,$2,'clean',$3)", [batchClaim, exact, digest])),
      "A different batch settled a file it did not claim.");

    await connection.exec("reset role");
    await connection.query("update private.rental_application_evidence_files set claim_until=now()-interval '1 second' where id=$1", [exact]);
    await connection.exec("set local role service_role");
    assert((await claim(retry, 1, exact))[0]?.id === exact, "Expired exact work was not reclaimable.");
    assert(!(await result("settle_rental_evidence_scan($1,$2,'clean',$3)", [claimOne, exact, digest]))
      && (await result("settle_rental_evidence_scan($1,$2,'clean',$3)", [retry, exact, digest])),
    "The stale claim was not fenced off from the newer attempt.");
    assert((await result("claim_rental_evidence_scan($1)", [randomUUID()]))?.id === pending,
      "The previous worker could not resume scanning when a slot freed.");
  } finally {
    await connection.exec("rollback");
  }
  return { exactClaim: true, sharedCapacity: true, expiredLeaseRecovery: true };
}
