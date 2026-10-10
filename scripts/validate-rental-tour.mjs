import { randomUUID } from "node:crypto";

function localDateTime(daysAhead, hour, minute = 0) {
  const date = new Date(Date.now() + daysAhead * 86400000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export async function validateRentalTour(db, { assert, expectDatabaseError, createOrganizationAsServer }) {
  const actor = "fb000000-0000-4000-8000-000000000001";
  const outsider = "fb000000-0000-4000-8000-000000000002";
  const scoped = "fb000000-0000-4000-8000-000000000003";
  await db.exec(`reset role; insert into auth.users(id) values ('${actor}'),('${outsider}'),('${scoped}')`);
  const binding = "operator_terms@0.1.0-draft+privacy_notice@0.1.0-draft#0123456789abcdef";
  const org = (await createOrganizationAsServer(
    db, actor,
    `'tour-homeowner','tour-homeowner','self_managing','US','en-US','America/New_York','${binding}','tour-org-0001'`,
  )).rows[0].result.organizationId;

  const act = async (userId = actor) => {
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${userId}'`);
  };
  const rpc = async (name, argsSql, params = []) =>
    (await db.query(`select public.${name}(${argsSql}) as r`, params)).rows[0].r;

  await act();
  const details = {
    property: {
      kind: "new", accountingBookId: null, legalName: "Tour Homeowner", entityType: "individual",
      name: "Tour House", addressLine1: "77 Hidden Court", addressLine2: "",
      locality: "Fairfax", subdivisionCode: "VA", postalCode: "22030",
      countryCode: "US", timeZone: "America/New_York",
    },
    space: {
      name: "Walkout apartment", type: "basement", bedrooms: 1, bathrooms: 1,
      entrance: "private", kitchen: "private", bathroom: "private", laundry: "shared",
      utilitiesNotes: "Water included", parkingNotes: "One driveway space",
    },
  };
  const rental = await rpc("create_homeowner_rental", "$1,$2::jsonb,$3", [
    org, JSON.stringify(details), randomUUID(),
  ]);
  const other = await rpc("create_homeowner_rental", "$1,$2::jsonb,$3", [
    org, JSON.stringify({
      property: { ...details.property, accountingBookId: rental.accountingBookId, name: "Other Tour House", addressLine1: "88 Other Court" },
      space: { ...details.space, name: "Upstairs room", type: "room" },
    }), randomUUID(),
  ]);

  const listingDetails = {
    title: "Walkout apartment",
    summary: "Private walkout apartment with its own entrance and one driveway parking space.",
    rentAmountMinor: 145000,
    availableOn: localDateTime(10, 12).slice(0, 10),
    leaseTermText: "12 months", petsText: "Ask about pets",
    utilitiesText: "Water included", parkingText: "One driveway space",
    visibility: "unlisted", photos: [],
  };
  const draft = await rpc("save_rental_listing", "$1,$2,0,$3::jsonb,$4", [
    org, rental.unitId, JSON.stringify(listingDetails), randomUUID(),
  ]);
  const grant = await rpc(
    "create_document_upload_grant",
    "$1,'unit',$2,'rental_listing_photo','Tour photo','tour.jpg','image/jpeg',2048,$3",
    [org, rental.unitId, "tour-photo-grant-0001"],
  );
  await db.exec("reset role; set role service_role");
  const sha = "f".repeat(64);
  const finalized = await rpc("finalize_document", "$1,$2,$3,$4", [
    actor, grant.grantId, sha, "tour-photo-final-0001",
  ]);
  const claimed = await rpc("claim_document_scan_jobs", "100,$1", ["tour-scan-worker"]);
  const scanJob = claimed.jobs.find((job) => job.documentVersionId === finalized.versionId);
  assert(scanJob, "Tour listing photo scan job was not claimable.");
  await rpc("complete_document_scan", "$1,'clean',$2,'tour-test-scanner',$3", [
    scanJob.documentScanJobId, sha, "tour-photo-clean-0001",
  ]);

  await act();
  const saved = await rpc("save_rental_listing", "$1,$2,$3,$4::jsonb,$5", [
    org, rental.unitId, draft.version,
    JSON.stringify({
      ...listingDetails,
      photos: [{ documentVersionId: finalized.versionId, altText: "Walkout apartment entrance" }],
    }),
    randomUUID(),
  ]);
  const published = await rpc("set_rental_listing_status", "$1,$2,$3,'published',$4", [
    org, draft.listingId, saved.version, randomUUID(),
  ]);
  assert(published.status === "published", "Tour fixture listing did not publish.");

  const preferences = [
    localDateTime(5, 18),
    localDateTime(7, 10),
    localDateTime(8, 14, 30),
  ];
  const networkHash = "9".repeat(64);
  const submit = async (email, prefs, key, publicId = published.publicId) => {
    await db.exec("reset role; set role service_role");
    return rpc(
      "submit_public_rental_tour_request",
      "$1,'Jamie','Visitor',$2,$3::jsonb,$4,'en-US',$5",
      [publicId, email, JSON.stringify(prefs), networkHash, key],
    );
  };

  const firstKey = randomUUID();
  const accepted = await submit("Jamie.Visitor@example.com", preferences, firstKey);
  assert(accepted.accepted === true, "Published share listing did not accept a tour request.");

  await db.exec("reset role");
  let tours = await db.query(
    "select * from public.rental_tour_requests where organization_id=$1 order by created_at",
    [org],
  );
  assert(tours.rows.length === 1 && tours.rows[0].status === "pending_verification",
    "Tour request was not stored pending verification.");
  const tour = tours.rows[0];
  const prefRows = await db.query(
    "select position,to_char(local_start,'YYYY-MM-DD\"T\"HH24:MI') as local_start_text,starts_at,ends_at from public.rental_tour_preferences where tour_request_id=$1 order by position",
    [tour.id],
  );
  assert(prefRows.rows.length === 3, "Tour preferences were not stored exactly once.");
  assert(prefRows.rows[0].local_start_text === preferences[0],
    "Tour local time was not preserved in the property time zone.");

  const expectedStart = (await db.query(
    "select $1::timestamp at time zone 'America/New_York' as t",
    [preferences[0].replace("T", " ")],
  )).rows[0].t;
  assert(new Date(prefRows.rows[0].starts_at).getTime() === new Date(expectedStart).getTime(),
    "Tour preference was interpreted using the wrong time zone.");

  const job = (await db.query(
    "select id,payload,status from private.notification_jobs where idempotency_key=$1",
    [`rental-tour-verification:${tour.id}`],
  )).rows[0];
  assert(job && /^[0-9a-f]{64}$/.test(job.payload.verificationToken),
    "Tour verification token was not queued temporarily.");
  const rawToken = job.payload.verificationToken;

  await act();
  let visible = await db.query(
    "select id from public.rental_tour_requests where organization_id=$1 and unit_id=$2",
    [org, rental.unitId],
  );
  assert(visible.rows.length === 0, "Pending tour leaked into landlord RLS reads.");
  assert((await db.query(
    "select position from public.rental_tour_preferences where tour_request_id=$1",
    [tour.id],
  )).rows.length === 0, "Pending tour preferences leaked through RLS.");

  const replay = await submit("  JAMIE.VISITOR@example.com  ", preferences, firstKey);
  assert(replay.accepted === true, "Exact tour replay did not return accepted.");
  await db.exec("reset role");
  assert((await db.query(
    "select count(*)::integer c from public.rental_tour_requests where organization_id=$1",
    [org],
  )).rows[0].c === 1, "Tour replay created a duplicate row.");
  assert((await db.query(
    "select count(*)::integer c from private.rental_tour_attempts where listing_id=$1",
    [draft.listingId],
  )).rows[0].c === 1, "Tour replay spent the rate budget twice.");
  assert((await db.query(
    "select count(*)::integer c from private.notification_jobs where idempotency_key=$1",
    [`rental-tour-verification:${tour.id}`],
  )).rows[0].c === 1, "Tour replay queued another verification email.");

  await expectDatabaseError(
    () => submit("jamie.visitor@example.com", [preferences[0], preferences[1]], firstKey),
    "IDEMPOTENCY_CONFLICT",
  );
  await expectDatabaseError(
    () => submit("bad-pref@example.com", [preferences[0], preferences[0]], randomUUID()),
    "DUPLICATE_TOUR_PREFERENCE",
  );
  await expectDatabaseError(
    () => submit("dst-gap@example.com", ["2027-03-14T02:30"], randomUUID()),
    "INVALID_TOUR_LOCAL_TIME",
  );

  await db.exec("reset role; set role service_role");
  const wrong = await rpc("verify_public_rental_tour", "$1", ["a".repeat(64)]);
  assert(wrong.verified === false, "Unknown tour verification token was accepted.");

  const verified = await rpc("verify_public_rental_tour", "$1", [rawToken]);
  assert(verified.verified === true && verified.status === "requested",
    "Valid tour token did not verify.");
  const verifiedReplay = await rpc("verify_public_rental_tour", "$1", [rawToken]);
  assert(verifiedReplay.verified === true && verifiedReplay.tourReference === tour.public_reference,
    "Tour verification replay was not idempotent.");

  await act();
  visible = await db.query(
    "select id,email,status,property_time_zone,version from public.rental_tour_requests where id=$1",
    [tour.id],
  );
  assert(visible.rows.length === 1 && visible.rows[0].status === "requested",
    "Verified tour did not enter the landlord workspace.");
  assert(String(visible.rows[0].email).toLowerCase() === "jamie.visitor@example.com",
    "Verified tour email was not normalized.");
  assert(visible.rows[0].property_time_zone === "America/New_York",
    "Tour lost its property time zone.");

  // Terminal notification bookkeeping removes the raw verification credential.
  await db.exec("reset role");
  await db.query("update private.notification_jobs set status='processing' where id=$1", [job.id]);
  await db.exec("set role service_role");
  await rpc("complete_notification_job", "$1,'test-mail','tour-message-1'", [job.id]);
  await db.exec("reset role");
  const scrubbed = (await db.query(
    "select payload,status from private.notification_jobs where id=$1",
    [job.id],
  )).rows[0];
  assert(scrubbed.status === "sent" && scrubbed.payload.verificationToken === undefined,
    "Sent tour verification mail retained its raw token.");

  // Same-org staff assigned only to another property cannot read or confirm this tour.
  const membershipId = randomUUID();
  await db.query(
    "insert into public.organization_memberships(id,organization_id,user_id,role_code,status) values ($1,$2,$3,'leasing_agent','active')",
    [membershipId, org, scoped],
  );
  await db.query(
    "insert into public.membership_property_scopes(organization_id,membership_id,property_id) values ($1,$2,$3)",
    [org, membershipId, other.propertyId],
  );
  await act(scoped);
  assert((await db.query(
    "select id from public.rental_tour_requests where id=$1",
    [tour.id],
  )).rows.length === 0, "Wrong-property staff could read tour PII.");

  await expectDatabaseError(
    () => rpc("confirm_rental_tour", "$1,$2,$3,0,$4,$5", [org, tour.id, 2, "77 Hidden Court, Fairfax, VA", randomUUID()]),
    "TOUR_SCOPE_DENIED",
  );

  await act(outsider);
  assert((await db.query(
    "select id from public.rental_tour_requests where id=$1",
    [tour.id],
  )).rows.length === 0, "Outsider could read tour PII.");

  await act();
  await expectDatabaseError(
    () => db.query(
      "update public.rental_tour_requests set first_name='tampered' where id=$1",
      [tour.id],
    ),
    "permission denied",
  );

  const confirmKey = randomUUID();
  const confirmed = await rpc("confirm_rental_tour", "$1,$2,2,0,$3,$4", [
    org, tour.id, "77 Hidden Court, Fairfax, VA", confirmKey,
  ]);
  assert(confirmed.status === "confirmed" && confirmed.version === 3,
    "Verified tour was not confirmed.");
  assert(confirmed.confirmedPreferencePosition === 0,
    "Tour confirmation did not bind the selected preference.");
  const confirmReplay = await rpc("confirm_rental_tour", "$1,$2,2,0,$3,$4", [
    org, tour.id, "77 Hidden Court, Fairfax, VA", confirmKey,
  ]);
  assert(confirmReplay.status === "confirmed" && confirmReplay.version === 3,
    "Tour confirmation replay did not return the original result.");

  await db.exec("reset role");
  const confirmationJobs = await db.query(
    "select payload from private.notification_jobs where idempotency_key=$1",
    [`rental-tour-confirmed:${tour.id}`],
  );
  assert(confirmationJobs.rows.length === 1,
    "Tour confirmation queued more than one email.");
  assert(confirmationJobs.rows[0].payload.timeZone === "America/New_York",
    "Tour confirmation email lost the property time zone.");
  assert(confirmationJobs.rows[0].payload.meetingLocation === "77 Hidden Court, Fairfax, VA",
    "Tour confirmation email lost the private meeting location.");

  // A second verified request cannot be confirmed into an overlapping 30-minute slot for this unit.
  const secondAccepted = await submit(
    "second-tour@example.com",
    [preferences[0], localDateTime(9, 16)],
    randomUUID(),
  );
  assert(secondAccepted.accepted === true, "Second tour fixture was not accepted.");
  await db.exec("reset role");
  const secondTour = (await db.query(
    "select id from public.rental_tour_requests where lower(email::text)='second-tour@example.com' order by created_at desc limit 1",
  )).rows[0];
  const secondJob = (await db.query(
    "select payload from private.notification_jobs where idempotency_key=$1",
    [`rental-tour-verification:${secondTour.id}`],
  )).rows[0];
  await db.exec("set role service_role");
  assert((await rpc(
    "verify_public_rental_tour", "$1", [secondJob.payload.verificationToken],
  )).verified === true, "Second tour did not verify.");
  await act();
  await expectDatabaseError(
    () => rpc("confirm_rental_tour", "$1,$2,2,0,$3,$4", [org, secondTour.id, "77 Hidden Court, Fairfax, VA", randomUUID()]),
    "TOUR_SLOT_CONFLICT",
  );

  // Expired verification never enters the landlord-visible queue.
  const expiredEmail = "expired-tour@example.com";
  const expAccepted = await submit(
    expiredEmail, [localDateTime(12, 11)], randomUUID(),
  );
  assert(expAccepted.accepted === true, "Expired tour fixture could not be submitted.");
  await db.exec("reset role");
  const expTour = (await db.query(
    "select id from public.rental_tour_requests where lower(email::text)=$1 order by created_at desc limit 1",
    [expiredEmail],
  )).rows[0];
  const expJob = (await db.query(
    "select id,payload from private.notification_jobs where idempotency_key=$1",
    [`rental-tour-verification:${expTour.id}`],
  )).rows[0];
  await db.query(
    "update private.rental_tour_verifications set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where tour_request_id=$1",
    [expTour.id],
  );
  await db.exec("set role service_role");
  const expired = await rpc("verify_public_rental_tour", "$1", [expJob.payload.verificationToken]);
  assert(expired.verified === false, "Expired tour token was accepted.");
  await db.exec("reset role");
  const expiredState = (await db.query(
    "select status from public.rental_tour_requests where id=$1",
    [expTour.id],
  )).rows[0].status;
  assert(expiredState === "expired", "Expired tour did not leave pending state.");

  const expiredVerification = (await db.query(
    "select consumed_at is not null as consumed from private.rental_tour_verifications where tour_request_id=$1",
    [expTour.id],
  )).rows[0];
  assert(expiredVerification.consumed === true,
    "Expired tour verification credential remained reusable.");
  const expiredNotification = (await db.query(
    "select status,payload from private.notification_jobs where id=$1",
    [expJob.id],
  )).rows[0];
  assert(expiredNotification.status === "canceled"
    && expiredNotification.payload.verificationToken === undefined,
    "Expired tour verification job retained a raw credential.");

  // Normalized email and keyed network signals enforce neutral intake limits.
  await db.query("delete from private.rental_tour_attempts where network_hash=$1", [networkHash]);
  for (let i = 0; i < 5; i += 1) {
    const email = i % 2 ? " RATE.TOUR@EXAMPLE.COM " : "rate.tour@example.com";
    assert((await submit(email, [localDateTime(20 + i, 9 + i)], randomUUID())).accepted === true,
      "Pre-limit tour request was not neutrally accepted.");
  }
  const emailLimited = await submit(
    "RaTe.ToUr@example.com", [localDateTime(30, 15)], randomUUID(),
  );
  assert(emailLimited.accepted === true, "Email-limited tour leaked its limit state.");
  await db.exec("reset role");
  assert((await db.query(
    "select count(*)::integer c from public.rental_tour_requests where listing_id=$1 and lower(email::text)='rate.tour@example.com'",
    [draft.listingId],
  )).rows[0].c === 5, "Tour email rate limit allowed a sixth request row.");

  const network2 = "8".repeat(64);
  for (let i = 0; i < 20; i += 1) {
    await db.query(
      "insert into private.rental_tour_attempts(listing_id,email_hash,network_hash) values ($1,$2,$3)",
      [draft.listingId, String(i).padStart(64, "7").slice(-64), network2],
    );
  }
  await db.exec("set role service_role");
  const networkLimited = await rpc(
    "submit_public_rental_tour_request",
    "$1,'Taylor','Visitor','network-tour@example.com',$2::jsonb,$3,'en-US',$4",
    [published.publicId, JSON.stringify([localDateTime(25, 13)]), network2, randomUUID()],
  );
  assert(networkLimited.accepted === true, "Network-limited tour leaked its limit state.");
  await db.exec("reset role");
  assert((await db.query(
    "select count(*)::integer c from public.rental_tour_requests where listing_id=$1 and lower(email::text)='network-tour@example.com'",
    [draft.listingId],
  )).rows[0].c === 0, "Tour network limit created a request row.");

  // A paused listing no longer accepts new tour requests.
  await act();
  const listingRow = (await db.query(
    "select version from public.rental_listings where id=$1",
    [draft.listingId],
  )).rows[0];
  const paused = await rpc("set_rental_listing_status", "$1,$2,$3,'paused',$4", [
    org, draft.listingId, Number(listingRow.version), randomUUID(),
  ]);
  assert(paused.status === "paused", "Tour fixture listing did not pause.");
  await expectDatabaseError(
    () => submit("blocked-tour@example.com", [localDateTime(15, 12)], randomUUID()),
    "LISTING_NOT_AVAILABLE",
  );

  await db.exec("reset role");
  return {
    pendingHidden: true,
    verifiedVisible: true,
    wrongTokenDenied: true,
    expiredTokenDenied: true,
    verificationReplay: true,
    propertyTimeZoneUsed: true,
    duplicatePreferenceDenied: true,
    dstGapDenied: true,
    emailRateLimited: true,
    networkRateLimited: true,
    tokenScrubbed: true,
    scopedOperatorDenied: true,
    outsiderDenied: true,
    directWriteDenied: true,
    confirmationIdempotent: true,
    overlappingConfirmationDenied: true,
    pausedListingDenied: true,
  };
}
