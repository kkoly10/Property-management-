import { randomUUID } from "node:crypto";

export async function validateRentalInquiry(db, { assert, expectDatabaseError, createOrganizationAsServer }) {
  const actor = "fa000000-0000-4000-8000-000000000001";
  const outsider = "fa000000-0000-4000-8000-000000000002";
  const scoped = "fa000000-0000-4000-8000-000000000003";
  await db.exec(`reset role; insert into auth.users(id) values ('${actor}'),('${outsider}'),('${scoped}')`);
  const binding = "operator_terms@0.1.0-draft+privacy_notice@0.1.0-draft#0123456789abcdef";
  const org = (await createOrganizationAsServer(
    db, actor,
    `'inquiry-homeowner','inquiry-homeowner','self_managing','US','en-US','America/New_York','${binding}','inq-org-0001'`,
  )).rows[0].result.organizationId;

  const act = async (userId = actor) => {
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${userId}'`);
  };
  const rpc = async (name, argsSql, params = []) =>
    (await db.query(`select public.${name}(${argsSql}) as r`, params)).rows[0].r;

  await act();
  const details = {
    property: {
      kind: "new", accountingBookId: null, legalName: "Inquiry Homeowner", entityType: "individual",
      name: "Inquiry House", addressLine1: "44 Hidden Lane", addressLine2: "",
      locality: "Fairfax", subdivisionCode: "VA", postalCode: "22030",
      countryCode: "US", timeZone: "America/New_York",
    },
    space: {
      name: "Garden apartment", type: "basement", bedrooms: 1, bathrooms: 1,
      entrance: "private", kitchen: "private", bathroom: "private", laundry: "shared",
      utilitiesNotes: "Water included", parkingNotes: "One space",
    },
  };
  const rental = await rpc("create_homeowner_rental", "$1,$2::jsonb,$3", [
    org, JSON.stringify(details), randomUUID(),
  ]);
  const other = await rpc("create_homeowner_rental", "$1,$2::jsonb,$3", [
    org, JSON.stringify({
      property: {
        ...details.property,
        accountingBookId: rental.accountingBookId,
        name: "Other House",
        addressLine1: "55 Other Lane",
      },
      space: { ...details.space, name: "Other room", type: "room" },
    }), randomUUID(),
  ]);

  const listingDetails = {
    title: "Garden apartment",
    summary: "Private garden apartment with its own entrance and one parking space.",
    rentAmountMinor: 140000,
    availableOn: "2026-10-01",
    leaseTermText: "12 months", petsText: "Ask about pets",
    utilitiesText: "Water included", parkingText: "One space",
    visibility: "unlisted", photos: [],
  };
  const draft = await rpc("save_rental_listing", "$1,$2,0,$3::jsonb,$4", [
    org, rental.unitId, JSON.stringify(listingDetails), randomUUID(),
  ]);
  const grant = await rpc(
    "create_document_upload_grant",
    "$1,'unit',$2,'rental_listing_photo','Garden photo','garden.jpg','image/jpeg',2048,$3",
    [org, rental.unitId, "inquiry-photo-grant-0001"],
  );
  await db.exec("reset role; set role service_role");
  const sha = "a".repeat(64);
  const finalized = await rpc("finalize_document", "$1,$2,$3,$4", [
    actor, grant.grantId, sha, "inquiry-photo-final-0001",
  ]);

  const claimed = await rpc("claim_document_scan_jobs", "100,$1", ["inquiry-scan-worker"]);
  const scanJob = claimed.jobs.find((job) => job.documentVersionId === finalized.versionId);
  assert(scanJob, "Inquiry listing photo scan job was not claimable.");
  await rpc("complete_document_scan", "$1,'clean',$2,'inquiry-test-scanner',$3", [
    scanJob.documentScanJobId, sha, "inquiry-photo-clean-0001",
  ]);
  await act();
  const saved = await rpc("save_rental_listing", "$1,$2,$3,$4::jsonb,$5", [
    org, rental.unitId, draft.version,
    JSON.stringify({
      ...listingDetails,
      photos: [{ documentVersionId: finalized.versionId, altText: "Garden entrance" }],
    }),
    randomUUID(),
  ]);
  const published = await rpc("set_rental_listing_status", "$1,$2,$3,'published',$4", [
    org, draft.listingId, saved.version, randomUUID(),
  ]);
  assert(published.status === "published", "Inquiry fixture listing did not publish.");

  const networkHash = "b".repeat(64);
  const submit = async (email, question, key, publicId = published.publicId, firstName = "Jamie", lastName = "Renter") => {
    await db.exec("reset role; set role service_role");
    return rpc(
      "submit_public_rental_inquiry",
      "$1,$2,$3,$4,$5,$6,'en-US',$7",
      [publicId, firstName, lastName, email, question, networkHash, key],
    );
  };

  const firstKey = randomUUID();
  const question = "Is water included, and is the parking space available every day?";
  const accepted = await submit("Jamie.Renter@example.com", question, firstKey);
  assert(accepted.accepted === true, "Published share listing did not accept an inquiry.");

  await db.exec("reset role");
  let rows = await db.query(
    "select * from public.rental_inquiries where organization_id=$1 order by created_at",
    [org],
  );
  assert(rows.rows.length === 1 && rows.rows[0].status === "pending_verification",
    "Inquiry was not stored pending verification.");
  const inquiry = rows.rows[0];
  const job = (await db.query(
    "select id,payload,status from private.notification_jobs where idempotency_key=$1",
    [`rental-inquiry-verification:${inquiry.id}`],
  )).rows[0];
  assert(job && /^[0-9a-f]{64}$/.test(job.payload.verificationToken),
    "Verification token was not queued as an opaque temporary secret.");
  const rawToken = job.payload.verificationToken;

  await act();
  let visible = await db.query(
    "select id from public.rental_inquiries where organization_id=$1 and unit_id=$2",
    [org, rental.unitId],
  );
  assert(visible.rows.length === 0, "Pending inquiry leaked into landlord RLS reads.");

  const replay = await submit("  JAMIE.RENTER@example.com  ", question, firstKey);
  assert(replay.accepted === true, "Exact public inquiry replay did not return accepted.");
  await db.exec("reset role");
  assert((await db.query("select count(*)::integer c from public.rental_inquiries where organization_id=$1", [org])).rows[0].c === 1,
    "Inquiry replay created a duplicate row.");
  assert((await db.query("select count(*)::integer c from private.rental_inquiry_attempts where listing_id=$1", [draft.listingId])).rows[0].c === 1,
    "Inquiry replay spent the rate budget twice.");
  assert((await db.query("select count(*)::integer c from private.notification_jobs where idempotency_key=$1", [`rental-inquiry-verification:${inquiry.id}`])).rows[0].c === 1,
    "Inquiry replay queued another verification message.");

  await expectDatabaseError(
    () => submit("jamie.renter@example.com", question + " Changed.", firstKey),
    "IDEMPOTENCY_CONFLICT",
  );

  await db.exec("reset role; set role service_role");
  const wrong = await rpc("verify_public_rental_inquiry", "$1", ["c".repeat(64)]);
  assert(wrong.verified === false, "Unknown verification token was accepted.");

  const verified = await rpc("verify_public_rental_inquiry", "$1", [rawToken]);
  assert(verified.verified === true && verified.status === "open",
    "Valid inquiry token did not verify.");
  const verifiedReplay = await rpc("verify_public_rental_inquiry", "$1", [rawToken]);
  assert(verifiedReplay.verified === true && verifiedReplay.inquiryReference === inquiry.public_reference,
    "Verified token replay was not idempotent.");

  await act();
  visible = await db.query(
    "select id,email,status from public.rental_inquiries where organization_id=$1 and unit_id=$2",
    [org, rental.unitId],
  );
  assert(visible.rows.length === 1 && visible.rows[0].status === "open",
    "Verified inquiry did not enter the landlord workspace.");
  assert(String(visible.rows[0].email).toLowerCase() === "jamie.renter@example.com",
    "Verified inquiry email was not normalized.");

  // Terminal notification bookkeeping removes the raw verification credential from durable payloads.
  await db.exec("reset role");
  await db.query("update private.notification_jobs set status='processing' where id=$1", [job.id]);
  await db.exec("set role service_role");
  await rpc("complete_notification_job", "$1,'test-mail','inq-message-1'", [job.id]);
  await db.exec("reset role");
  const scrubbed = (await db.query("select payload,status from private.notification_jobs where id=$1", [job.id])).rows[0];
  assert(scrubbed.status === "sent" && scrubbed.payload.verificationToken === undefined,
    "Sent inquiry mail retained its raw verification token.");

  // Email rate limiting uses normalized email, so case/whitespace cannot reset the budget.
  for (let i = 0; i < 4; i += 1) {
    const email = i % 2 ? " JAMIE.RENTER@EXAMPLE.COM " : "jamie.renter@example.com";
    assert((await submit(email, `${question} Follow-up ${i}.`, randomUUID())).accepted === true,
      "Pre-limit inquiry was not neutrally accepted.");
  }
  const limited = await submit("JaMiE.ReNtEr@example.com", question + " Limit check.", randomUUID());
  assert(limited.accepted === true, "Rate-limited inquiry leaked its limit state.");
  await db.exec("reset role");
  assert((await db.query(
    "select count(*)::integer c from public.rental_inquiries where listing_id=$1 and lower(email::text)=$2",
    [draft.listingId, "jamie.renter@example.com"],
  )).rows[0].c === 5, "Email rate limit allowed a sixth inquiry row.");

  // Network rate limiting is keyed and neutral as well.
  const network2 = "d".repeat(64);
  await db.exec("reset role");
  for (let i = 0; i < 20; i += 1) {
    await db.query(
      "insert into private.rental_inquiry_attempts(listing_id,email_hash,network_hash) values ($1,$2,$3)",
      [draft.listingId, String(i).padStart(64, "e").slice(-64), network2],
    );
  }
  await db.exec("set role service_role");
  const networkLimited = await rpc(
    "submit_public_rental_inquiry",
    "$1,'Taylor','Visitor','taylor@example.com','Is the rental still available?',$2,'en-US',$3",
    [published.publicId, network2, randomUUID()],
  );
  assert(networkLimited.accepted === true, "Network-limited inquiry leaked its limit state.");
  await db.exec("reset role");
  assert((await db.query(
    "select count(*)::integer c from public.rental_inquiries where listing_id=$1 and lower(email::text)='taylor@example.com'",
    [draft.listingId],
  )).rows[0].c === 0, "Network rate limit created an inquiry row.");

  // Expired verification never opens the landlord-visible record.
  const expiredEmail = "expired@example.com";
  await db.exec("reset role");
  await db.query("delete from private.rental_inquiry_attempts where network_hash=$1", [networkHash]);
  const exp = await submit(expiredEmail, "Can I ask about the laundry setup?", randomUUID());
  assert(exp.accepted === true, "Expired-token fixture could not be submitted.");
  await db.exec("reset role");
  const expInquiry = (await db.query(
    "select id from public.rental_inquiries where lower(email::text)=$1 order by created_at desc limit 1",
    [expiredEmail],
  )).rows[0];
  const expJob = (await db.query(
    "select payload from private.notification_jobs where idempotency_key=$1",
    [`rental-inquiry-verification:${expInquiry.id}`],
  )).rows[0];
  await db.query(
    "update private.rental_inquiry_verifications set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where inquiry_id=$1",
    [expInquiry.id],
  );
  await db.exec("set role service_role");
  const expired = await rpc("verify_public_rental_inquiry", "$1", [expJob.payload.verificationToken]);
  assert(expired.verified === false, "Expired verification token was accepted.");
  await db.exec("reset role");
  assert((await db.query("select status from public.rental_inquiries where id=$1", [expInquiry.id])).rows[0].status === "expired",
    "Expired inquiry did not leave pending state.");
  assert((await db.query(
    "select consumed_at is not null as consumed from private.rental_inquiry_verifications where inquiry_id=$1",
    [expInquiry.id],
  )).rows[0].consumed === true, "Expired verification credential remained unconsumed.");

  // A same-org staff member scoped only to another property cannot see or close this inquiry.
  const membershipId = randomUUID();
  await db.exec("reset role");
  await db.query(
    "insert into public.organization_memberships(id,organization_id,user_id,role_code,status) values ($1,$2,$3,'leasing_agent','active')",
    [membershipId, org, scoped],
  );
  await db.query(
    "insert into public.membership_property_scopes(organization_id,membership_id,property_id) values ($1,$2,$3)",
    [org, membershipId, other.propertyId],
  );
  await act(scoped);
  assert((await db.query("select id from public.rental_inquiries where id=$1", [inquiry.id])).rows.length === 0,
    "Wrong-property staff could read inquiry PII.");
  await expectDatabaseError(
    () => rpc("close_rental_inquiry", "$1,$2,$3,$4", [org, inquiry.id, 2, randomUUID()]),
    "INQUIRY_SCOPE_DENIED",
  );

  await act(outsider);
  assert((await db.query("select id from public.rental_inquiries where id=$1", [inquiry.id])).rows.length === 0,
    "Outsider could read inquiry PII.");

  await act();
  await expectDatabaseError(
    () => db.query("update public.rental_inquiries set question='tampered' where id=$1", [inquiry.id]),
    "permission denied",
  );

  const closeKey = randomUUID();
  const closed = await rpc("close_rental_inquiry", "$1,$2,2,$3", [org, inquiry.id, closeKey]);
  assert(closed.status === "closed" && closed.version === 3, "Verified inquiry did not close.");
  const closeReplay = await rpc("close_rental_inquiry", "$1,$2,2,$3", [org, inquiry.id, closeKey]);
  assert(closeReplay.status === "closed" && closeReplay.version === 3,
    "Close replay did not return the original result.");

  await db.exec("reset role; set role service_role");
  const verifiedAfterClose = await rpc("verify_public_rental_inquiry", "$1", [rawToken]);
  assert(verifiedAfterClose.verified === true && verifiedAfterClose.status === "closed",
    "Verification replay after close did not preserve the verified result.");

  // Paused/closed/draft share links cannot accept new questions.
  await act();
  const paused = await rpc("set_rental_listing_status", "$1,$2,$3,'paused',$4", [
    org, draft.listingId, published.version, randomUUID(),
  ]);
  assert(paused.status === "paused", "Inquiry fixture listing did not pause.");
  await expectDatabaseError(
    () => submit("blocked@example.com", "Can I ask a question about this rental?", randomUUID()),
    "LISTING_NOT_AVAILABLE",
  );

  await db.exec("reset role");
  return {
    pendingHidden: true,
    verifiedVisible: true,
    wrongTokenDenied: true,
    expiredTokenDenied: true,
    replayIdempotent: true,
    emailRateLimited: true,
    networkRateLimited: true,
    tokenScrubbed: true,
    scopedOperatorDenied: true,
    outsiderDenied: true,
    directWriteDenied: true,
    pausedListingDenied: true,
    closeIdempotent: true,
  };
}
