import { randomUUID } from "node:crypto";

// Executable positive B4 lifecycle coverage on the existing isolated PGlite schema.
// This is not PostgreSQL concurrency or full lease-conversion certification.
export async function validateRentalApplicationLifecycle(db, { assert, expectDatabaseError, runFullPostgresRaces, runFullPostgresActivationRace }) {
  await db.exec("reset role");
  const listing = (await db.query(`
    select id, public_id from public.rental_listings
    where title='Walkout apartment' and status='paused' and visibility='unlisted'
    order by created_at desc limit 1
  `)).rows[0];
  assert(listing, "B4 test requires the previously validated B3 tour listing.");
  await db.query("update public.rental_listings set status='published',version=version+1 where id=$1", [listing.id]);
  const day = (await db.query(
    "select ((now() at time zone 'America/New_York')::date + 30)::text as move_on",
  )).rows[0].move_on;
  const email = "b4-lifecycle-applicant@example.test";
  const args = [listing.public_id, "B4", "Applicant", email, day, "", "", "9".repeat(64), "en-US", randomUUID()];
  await db.exec("set role service_role");
  const submit = async (values) => (await db.query(
    "select public.submit_public_rental_application($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10) result",
    values,
  )).rows[0].result;
  assert((await submit(args)).accepted === true, "B4 positive submission failed.");
  assert((await submit(args)).accepted === true, "B4 idempotent replay failed.");
  await expectDatabaseError(
    () => submit([...args.slice(0, 1), "Changed", ...args.slice(2)]),
    "IDEMPOTENCY_CONFLICT",
  );
  await db.exec("reset role");
  const application = (await db.query(
    "select id,public_reference,status from public.rental_applications where email=$1",
    [email],
  )).rows[0];
  assert(application?.status === "pending_verification", "B4 submission did not persist pending application.");
  const job = (await db.query(
    "select payload from private.notification_jobs where idempotency_key=$1",
    [`rental-application-verification:${application.id}`],
  )).rows[0];
  assert(/^[0-9a-f]{64}$/.test(job?.payload?.verificationToken ?? ""), "B4 verification was not queued.");
  await db.exec("set role service_role");
  const token = job.payload.verificationToken;
  const verified = (await db.query(
    "select public.verify_public_rental_application($1) result", [token],
  )).rows[0].result;
  assert(verified.verified && verified.applicationReference === application.public_reference
    && /^[0-9a-f]{64}$/.test(verified.accessToken), "B4 email verification did not issue application access.");
  const replay = (await db.query(
    "select public.verify_public_rental_application($1) result", [token],
  )).rows[0].result;
  assert(replay.verified === true && replay.accessToken === undefined, "B4 verification replay leaked a credential.");
  const status = (await db.query(
    "select public.get_public_rental_application_for_access($1) result", [verified.accessToken],
  )).rows[0].result;
  assert(status.applicationReference === application.public_reference && status.status === "submitted",
    "B4 capability did not return the correct verified application.");
  const withdrawn = (await db.query(
    "select public.withdraw_public_rental_application($1,$2) result",
    [verified.accessToken, randomUUID()],
  )).rows[0].result;
  assert(withdrawn.withdrawn === true && withdrawn.status === "withdrawn", "B4 withdrawal did not persist.");
  const accessAfter = (await db.query(
    "select public.get_public_rental_application_for_access($1) result", [verified.accessToken],
  )).rows[0].result;
  assert(accessAfter === null, "B4 withdrawal left an active applicant capability.");
  await db.exec("reset role");
  // A separate verified applicant can be selected by the owner, then closed
  // without leaving an activation-ready lease setup behind.
  const prepareEmail = "b4-preparation-applicant@example.test";
  const prepareArgs = [...args];
  prepareArgs[3] = prepareEmail;
  prepareArgs[9] = randomUUID();
  await db.exec("set role service_role");
  assert((await submit(prepareArgs)).accepted, "Second application submission failed.");
  await db.exec("reset role");
  const selected = (await db.query(
    "select id,organization_id,unit_id,version from public.rental_applications where email=$1",
    [prepareEmail],
  )).rows[0];
  const preparedJob = (await db.query(
    "select payload from private.notification_jobs where idempotency_key=$1",
    [`rental-application-verification:${selected.id}`],
  )).rows[0];
  await db.exec("set role authenticated; set request.jwt.claim.sub='fb000000-0000-4000-8000-000000000001'");
  const unverifiedOwnerRead = (await db.query(
    "select id from public.rental_applications where id=$1", [selected.id],
  )).rows;
  assert(unverifiedOwnerRead.length === 0, "Landlord saw unverified applicant PII.");
  await db.exec("reset role; set role service_role");
  const selectedVerified = (await db.query(
    "select public.verify_public_rental_application($1) result",
    [preparedJob.payload.verificationToken],
  )).rows[0].result;
  assert(selectedVerified.verified && selectedVerified.accessToken,
    "Selected applicant was not email verified.");
  const owner = "fb000000-0000-4000-8000-000000000001";
  const outsider = "fb000000-0000-4000-8000-000000000002";
  const operationKey = randomUUID();
  const prepare = () => db.query(
    "select public.prepare_rental_application_lease($1,$2,$3,$4) result",
    [selected.organization_id, selected.id, selected.version + 1, operationKey],
  );
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${outsider}'`);
  await expectDatabaseError(prepare, "HOMEOWNER_LEASE_SCOPE_DENIED");
  // Existing same-organization staff can manage another property but must
  // neither read this application nor prepare its lease.
  const wrongPropertyActor = "fb000000-0000-4000-8000-000000000003";
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${wrongPropertyActor}'`);
  const scopedRows = (await db.query(
    "select id from public.rental_applications where id=$1", [selected.id],
  )).rows;
  assert(scopedRows.length === 0, "Wrong-property staff read application PII.");
  await expectDatabaseError(prepare, "HOMEOWNER_LEASE_SCOPE_DENIED");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${owner}'`);
  await expectDatabaseError(
    () => db.query(
      "select public.prepare_rental_application_lease($1,$2,$3,$4)",
      [selected.organization_id, selected.id, selected.version, randomUUID()],
    ),
    "APPLICATION_VERSION_CONFLICT",
  );
  const prepared = (await prepare()).rows[0].result;
  assert(prepared.status === "lease_preparation" && prepared.setupId,
    "Owner did not receive an application-linked lease draft.");
  await expectDatabaseError(
    () => db.query(
      "update public.rental_applications set first_name='Forged' where id=$1",
      [selected.id],
    ),
    "permission denied",
  );
  const samePrepare = (await prepare()).rows[0].result;
  assert(samePrepare.setupId === prepared.setupId,
    "Preparing a lease twice created a duplicate draft.");

  // A separately authorized operator at THIS property must not take over
  // another actor's application-linked draft, even with lease.manage.
  const manager = "fb000000-0000-4000-8000-000000000004";
  const managerMembership = randomUUID();
  await db.exec("reset role");
  await db.query("insert into auth.users(id) values ($1)", [manager]);
  await db.query(
    "insert into public.organization_memberships(id,organization_id,user_id,role_code,status) values($1,$2,$3,'leasing_agent','active')",
    [managerMembership, selected.organization_id, manager],
  );
  const selectedProperty = (await db.query(
    "select property_id from public.rental_applications where id=$1", [selected.id],
  )).rows[0].property_id;
  await db.query(
    "insert into public.membership_property_scopes(organization_id,membership_id,property_id) values($1,$2,$3)",
    [selected.organization_id, managerMembership, selectedProperty],
  );
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${manager}'`);
  const managerView = (await db.query(
    "select public.get_homeowner_lease_setup($1,$2) result",
    [selected.organization_id, selected.unit_id],
  )).rows[0].result;
  assert(managerView.setupId === null, "Manager read another operator's private lease draft.");
  await expectDatabaseError(
    () => db.query(
      "select public.prepare_rental_application_lease($1,$2,$3,$4)",
      [selected.organization_id, selected.id, prepared.applicationVersion, randomUUID()],
    ),
    "APPLICATION_PREPARATION_OWNED_BY_ANOTHER_ACTOR",
  );
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${owner}'`);
  await expectDatabaseError(
    () => db.query(
      "select public.close_rental_application($1,$2,$3,$4)",
      [selected.organization_id, selected.id, selected.version + 1, randomUUID()],
    ),
    "APPLICATION_VERSION_CONFLICT",
  );
  const closeKey = randomUUID();
  const closeApplication = () => db.query(
    "select public.close_rental_application($1,$2,$3,$4) result",
    [selected.organization_id, selected.id, prepared.applicationVersion, closeKey],
  );
  const closed = (await closeApplication()).rows[0].result;
  assert(closed.status === "closed", "Landlord closure failed.");
  const closedReplay = (await closeApplication()).rows[0].result;
  assert(JSON.stringify(closedReplay) === JSON.stringify(closed),
    "Landlord closure replay did not preserve its durable receipt.");
  await db.exec("reset role");
  const remainingDrafts = (await db.query(
    "select count(*)::int n from private.homeowner_lease_setups where source_rental_application_id=$1",
    [selected.id],
  )).rows[0].n;
  assert(remainingDrafts === 0, "Closing an application retained a linked draft.");
  const closeEvents = (await db.query(
    "select count(*)::int n from audit.audit_events where resource_id=$1 and action_code='rental_application.closed'",
    [selected.id],
  )).rows[0].n;
  assert(closeEvents === 1, "Closure retry emitted duplicate audit records.");
  await db.exec("set role service_role");
  const selectedAccess = (await db.query(
    "select public.get_public_rental_application_for_access($1) result",
    [selectedVerified.accessToken],
  )).rows[0].result;
  assert(selectedAccess === null, "Closed application access was not revoked.");
  await db.exec("reset role");
  // The PostgreSQL-only callback holds real simultaneous transactions over
  // independent connections. PGlite runs the other positive cases unchanged.
  const postgresRaces = runFullPostgresRaces
    ? await runFullPostgresRaces({ db, listing, day }) : null;

  // Applicant withdrawal during live lease preparation must invalidate the
  // owner-owned draft without waiting for a scheduler or the owner to close it.
  const withdrawingEmail = "b4-withdraw-draft@example.test";
  const withdrawingArgs = [...args];
  withdrawingArgs[3] = withdrawingEmail;
  withdrawingArgs[9] = randomUUID();
  await db.exec("set role service_role");
  assert((await submit(withdrawingArgs)).accepted, "Preparation-withdrawal applicant could not submit.");
  await db.exec("reset role");
  const withdrawingApp = (await db.query(
    "select id,organization_id,unit_id,version from public.rental_applications where email=$1",
    [withdrawingEmail],
  )).rows[0];
  const withdrawingJob = (await db.query(
    "select payload from private.notification_jobs where idempotency_key=$1",
    [`rental-application-verification:${withdrawingApp.id}`],
  )).rows[0];
  await db.exec("set role service_role");
  const withdrawingVerified = (await db.query(
    "select public.verify_public_rental_application($1) result",
    [withdrawingJob.payload.verificationToken],
  )).rows[0].result;
  assert(withdrawingVerified.accessToken, "Preparation-withdrawal applicant did not verify.");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${owner}'`);
  const withdrawingPrepared = (await db.query(
    "select public.prepare_rental_application_lease($1,$2,$3,$4) result",
    [withdrawingApp.organization_id, withdrawingApp.id, withdrawingApp.version + 1, randomUUID()],
  )).rows[0].result;
  assert(withdrawingPrepared.setupId, "Owner could not prepare the withdrawal fixture.");
  await db.exec("reset role; set role service_role");
  const withdrewDuringPreparation = (await db.query(
    "select public.withdraw_public_rental_application($1,$2) result",
    [withdrawingVerified.accessToken, randomUUID()],
  )).rows[0].result;
  assert(withdrewDuringPreparation.status === "withdrawn",
    "Withdrawal during preparation did not end the application.");
  await db.exec("reset role");
  const withdrawnDraftCount = (await db.query(
    "select count(*)::int n from private.homeowner_lease_setups where source_rental_application_id=$1",
    [withdrawingApp.id],
  )).rows[0].n;
  assert(withdrawnDraftCount === 0, "Withdrawal during preparation left a live lease draft.");
  const withdrawnStatus = (await db.query(
    "select public.get_public_rental_application_for_access($1) result",
    [withdrawingVerified.accessToken],
  )).rows[0].result;
  assert(withdrawnStatus === null, "Withdrawal during preparation left applicant access usable.");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${owner}'`);
  await expectDatabaseError(
    () => db.query(
      "select public.activate_homeowner_lease_setup($1,$2,$3,true,true)",
      [withdrawingApp.organization_id, withdrawingApp.unit_id, withdrawingPrepared.setupRevision],
    ),
    "SETUP_NOT_FOUND",
  );
  await db.exec("reset role");
  // The selected applicant must become the real signed-tenancy primary contact.
  const conversionArgs = [...args];
  conversionArgs[3] = "b4-conversion-applicant@example.test";
  conversionArgs[9] = randomUUID();
  await db.exec("set role service_role");
  assert((await submit(conversionArgs)).accepted, "Conversion application submission failed.");
  await db.exec("reset role");
  const conversionApp = (await db.query(
    "select id,organization_id,unit_id,version from public.rental_applications where email=$1",
    [conversionArgs[3]],
  )).rows[0];
  const conversionJob = (await db.query(
    "select payload from private.notification_jobs where idempotency_key=$1",
    [`rental-application-verification:${conversionApp.id}`],
  )).rows[0];
  await db.exec("set role service_role");
  const conversionVerified = (await db.query(
    "select public.verify_public_rental_application($1) result",
    [conversionJob.payload.verificationToken],
  )).rows[0].result;
  assert(conversionVerified.verified && conversionVerified.accessToken,
    "Conversion candidate did not receive verified applicant access.");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${owner}'`);
  const conversionPrepared = (await db.query(
    "select public.prepare_rental_application_lease($1,$2,$3,$4) result",
    [conversionApp.organization_id, conversionApp.id, conversionApp.version + 1, randomUUID()],
  )).rows[0].result;
  assert(conversionPrepared.setupId, "Conversion candidate did not receive a linked lease setup.");
  const grant = (await db.query(
    "select public.create_document_upload_grant($1,'unit',$2,'signed_lease','B4 signed agreement','b4-agreement.pdf','application/pdf',2048,$3) result",
    [conversionApp.organization_id, conversionApp.unit_id, randomUUID()],
  )).rows[0].result;
  await db.exec("reset role; set role service_role");
  const checksum = "d".repeat(64);
  const finalized = (await db.query(
    "select public.finalize_document($1,$2,$3,$4) result",
    [owner, grant.grantId, checksum, randomUUID()],
  )).rows[0].result;
  const scanJobs = (await db.query(
    "select public.claim_document_scan_jobs(100,$1) result", ["b4-conversion-test-scan"],
  )).rows[0].result;
  const scan = scanJobs.jobs.find((item) => item.documentVersionId === finalized.versionId);
  assert(scan, "Signed B4 fixture document was not queued for scanning.");
  await db.query(
    "select public.complete_document_scan($1,'clean',$2,'b4-fixture-scanner',$3)",
    [scan.documentScanJobId, checksum, randomUUID()],
  );
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${owner}'`);
  const leaseState = (await db.query(
    "select public.get_homeowner_lease_setup($1,$2) result",
    [conversionApp.organization_id, conversionApp.unit_id],
  )).rows[0].result;
  const signedDraft = { ...leaseState.draft, documentVersionId: finalized.versionId };
  const wrongDraft = {
    ...signedDraft,
    members: [{ ...signedDraft.members[0], firstName: "Wrong" }],
  };
  const wrongSaved = (await db.query(
    "select public.save_homeowner_lease_setup($1,$2,$3,$4::jsonb,$5) result",
    [conversionApp.organization_id, conversionApp.unit_id, leaseState.revision, JSON.stringify(wrongDraft), randomUUID()],
  )).rows[0].result;
  await expectDatabaseError(
    () => db.query(
      "select public.activate_homeowner_lease_setup($1,$2,$3,true,true)",
      [conversionApp.organization_id, conversionApp.unit_id, wrongSaved.revision],
    ),
    "APPLICATION_PRIMARY_CONTACT_MISMATCH",
  );
  const corrected = (await db.query(
    "select public.save_homeowner_lease_setup($1,$2,$3,$4::jsonb,$5) result",
    [conversionApp.organization_id, conversionApp.unit_id, wrongSaved.revision, JSON.stringify(signedDraft), randomUUID()],
  )).rows[0].result;
  const activated = runFullPostgresActivationRace
    ? await runFullPostgresActivationRace({ db, application: {
      ...conversionApp, version: corrected.applicationVersion ?? conversionPrepared.applicationVersion,
    }, setupRevision: corrected.revision })
    : (await db.query(
      "select public.activate_homeowner_lease_setup($1,$2,$3,true,true) result",
      [conversionApp.organization_id, conversionApp.unit_id, corrected.revision],
    )).rows[0].result;
  await db.exec("reset role");
  const converted = (await db.query(
    "select status,converted_tenancy_id,converted_household_id from public.rental_applications where id=$1",
    [conversionApp.id],
  )).rows[0];
  assert(converted.status === "converted" &&
    converted.converted_tenancy_id === activated.tenancyId &&
    converted.converted_household_id === activated.householdId,
  "The signed tenancy did not atomically convert the selected application.");
  // Once a real tenancy is activated, neither an operator nor a holder of
  // the old applicant capability may reverse the rental application state.
  const convertedCurrentVersion = (await db.query(
    "select version from public.rental_applications where id=$1",
    [conversionApp.id],
  )).rows[0].version;
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${owner}'`);
  await expectDatabaseError(
    () => db.query(
      "select public.close_rental_application($1,$2,$3,$4)",
      [conversionApp.organization_id, conversionApp.id, convertedCurrentVersion, randomUUID()],
    ),
    "APPLICATION_NOT_CLOSABLE",
  );
  await db.exec("reset role; set role service_role");
  await expectDatabaseError(
    () => db.query(
      "select public.withdraw_public_rental_application($1,$2)",
      [conversionVerified.accessToken, randomUUID()],
    ),
    "APPLICATION_NOT_WITHDRAWABLE",
  );
  await db.exec("reset role");
  // Repeated distinct requests for the same email are counted even when an
  // application is already pending. Public responses must stay neutral and
  // must not enqueue multiple verification credentials.
  // Attempts are abuse-budget state, not permanent audit records. Verify
  // the bounded sweep removes expired hashes without touching younger rows.
  const staleAttempt = randomUUID();
  const retainedAttempt = randomUUID();
  await db.query(`
    insert into private.rental_application_attempts(id,listing_id,email_hash,attempted_at)
    values ($1,$2,$3,now()-interval '49 hours'),
           ($4,$2,$5,now()-interval '47 hours')
  `, [staleAttempt, listing.id, "0".repeat(64),
    retainedAttempt, "1".repeat(64)]);
  const limitedEmail = "b4-rate-budget@example.test";
  const limitedArgs = [...args];
  limitedArgs[3] = limitedEmail;
  await db.exec("set role service_role");
  for (let attempt = 0; attempt < 4; attempt++) {
    limitedArgs[9] = randomUUID();
    const response = await submit(limitedArgs);
    assert(response.accepted === true && !("applicationId" in response),
      "A repeated/rate-limited submission leaked application existence.");
  }
  const replayLimited = await submit(limitedArgs);
  assert(replayLimited.accepted === true, "Rate-limited request replay failed.");
  await db.exec("reset role");
  const limitedCounts = (await db.query(`
    select
      (select count(*)::integer from public.rental_applications
        where email=$1) as applications,
      (select count(*)::integer from private.notification_jobs
        where recipient_address=$1 and template_code='rental_application_verification') as notices,
      (select count(*)::integer from private.rental_application_attempts
        where email_hash=encode(sha256(convert_to($1::text,'UTF8')),'hex')) as attempts
  `, [limitedEmail])).rows[0];
  assert(limitedCounts.applications === 1 && limitedCounts.notices === 1
    && limitedCounts.attempts === 4,
    "B4 email rate budget, deduplication, or idempotent replay diverged.");
  const remainingAttemptIds = (await db.query(
    "select id from private.rental_application_attempts where id in ($1,$2)",
    [staleAttempt, retainedAttempt],
  )).rows.map((row) => row.id);
  assert(!remainingAttemptIds.includes(staleAttempt)
    && remainingAttemptIds.includes(retainedAttempt),
  "B4 attempt retention pruned an in-budget row or retained an expired hash.");

  return { submission: true, replay: true, verification: true, status: true,
    withdrawal: true, revokedOnWithdrawal: true, outsiderPreparationDenied: true,
    pendingHiddenFromLandlord: true, wrongPropertyStaffDenied: true,
    operatorDirectWriteDenied: true, samePropertyActorDraftIsolation: true,
    ownerLeasePrepared: true, staleVersionDenied: true,
    preparationIdempotent: true, closureIdempotent: true, closureCancelsDraft: true,
    revokedOnClosure: true, withdrawalCancelsDraft: true,
    revokedOnWithdrawalDuringPreparation: true, wrongApplicantConversionDenied: true,
    fullLeaseConversion: true, convertedApplicationTerminal: true,
    rateLimitNoDisclosure: true, attemptRetentionBounded: true,
    realPostgresPreparationAndClosureRaces: postgresRaces?.isolatedPostgresTransactionRaces === 6
      && postgresRaces?.closeBeforeActivation === true
      && postgresRaces?.distinctApplicantPreparationSerialized === true,
    realPostgresDistinctApplicantPreparationRace: postgresRaces?.distinctApplicantPreparationSerialized === true,
    realPostgresNetworkBudgetRace: postgresRaces?.crossListingNetworkSerialized === true,
    realPostgresActivationCloseRace: Boolean(runFullPostgresActivationRace),
    concurrency: false };
}
