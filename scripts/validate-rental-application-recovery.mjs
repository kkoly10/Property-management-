import { createHash, randomUUID } from "node:crypto";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const contactDigest = (reference, email) => digest(`${reference}|${email}`);

export async function validateRentalApplicationRecovery(db, { assert, expectDatabaseError }) {
  const fixture = (await db.query(`
    select l.public_id,greatest(l.available_on,(now() at time zone p.time_zone)::date+7)::text as move_in
    from public.rental_listings l join public.properties p on p.id=l.property_id
    where l.status='published' and l.visibility='unlisted' order by l.id limit 1
  `)).rows[0];
  assert(fixture, "Applicant recovery needs a published synthetic listing.");
  const email = "b4-recovery-applicant@example.test";
  const network = digest("fixture-recovery-network");

  async function request(reference, address, key = randomUUID(), networkHash = network) {
    return (await db.query("select public.request_rental_application_recovery($1,$2,$3,$4,$5) result",
      [reference, address, contactDigest(reference, address), networkHash, key])).rows[0].result;
  }
  async function confirm(token) {
    return (await db.query("select public.confirm_rental_application_recovery($1) result", [token])).rows[0].result;
  }
  async function getStatus(token) {
    return (await db.query("select public.get_public_rental_application_for_access($1) result", [token])).rows[0].result;
  }
  async function currentChallenge(id) {
    return (await db.query(`
      select j.id,j.status,j.payload from private.rental_application_recovery_challenges c
      join private.notification_jobs j on j.id=c.notification_job_id where c.application_id=$1
    `, [id])).rows[0];
  }

  await db.exec("reset role; set role anon");
  await expectDatabaseError(() => request("APP-000000000000", email), "permission denied");
  await expectDatabaseError(() => confirm(digest("unknown")), "permission denied");
  await db.exec("reset role; set role service_role");
  await expectDatabaseError(() => db.query("select * from private.rental_application_recovery_challenges"), "permission denied");
  await db.query("select public.submit_public_rental_application($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10)",
    [fixture.public_id, "Recovery", "Applicant", email, fixture.move_in, "", "", network, "en-US", randomUUID()]);
  await db.exec("reset role");
  const application = (await db.query(`
    select a.id,a.public_reference,j.payload->>'verificationToken' as initial_token
    from public.rental_applications a join private.rental_application_verifications v on v.application_id=a.id
    join private.notification_jobs j on j.id=v.notification_job_id where a.email=$1
  `, [email])).rows[0];
  assert(application?.initial_token, "Initial verification was not queued.");

  await db.exec("set role service_role");
  const pending = await request(application.public_reference, email, randomUUID(), digest("pending network"));
  assert(pending.accepted === true && Object.keys(pending).length === 1, "Pending recovery receipt leaked application state.");
  await db.exec("reset role");
  assert(!await currentChallenge(application.id), "Recovery bypassed initial email verification.");
  await db.query("delete from private.rental_application_recovery_attempts where application_contact_hash=$1", [contactDigest(application.public_reference, email)]);
  await db.exec("set role service_role");
  const verified = (await db.query("select public.verify_public_rental_application($1) result", [application.initial_token])).rows[0].result;
  const wrongEmail = await request(application.public_reference, "wrong-recovery-applicant@example.test");
  assert(wrongEmail.accepted === true && Object.keys(wrongEmail).length === 1, "Wrong email recovery leaked application state.");
  for (const guess of ["APP-1234ABCDEF01", "APP-1234ABCDEF02", "APP-1234ABCDEF03"]) {
    const unrecognized = await request(guess, email);
    assert(JSON.stringify(unrecognized) === JSON.stringify(wrongEmail), "An unknown reference disclosed the recovery state.");
  }
  await db.exec("reset role");
  assert(!await currentChallenge(application.id), "A foreign email generated a recovery challenge.");

  const throttledNetwork = digest("throttled network");
  await db.query(`insert into private.rental_application_recovery_attempts(application_contact_hash,operation_key,network_hash)
    select repeat('a',64),gen_random_uuid(),$1 from generate_series(1,20)`, [throttledNetwork]);
  await db.exec("set role service_role");
  const throttled = await request(application.public_reference, email, randomUUID(), throttledNetwork);
  assert(JSON.stringify(throttled) === JSON.stringify(wrongEmail), "Network throttling disclosed application existence.");
  await db.exec("reset role");
  assert(!await currentChallenge(application.id), "Recovery crossed the network budget using a different application contact.");

  const operation = randomUUID();
  await db.exec("set role service_role");
  const neutral = await request(application.public_reference, email, operation);
  assert(JSON.stringify(neutral) === JSON.stringify(wrongEmail), "Recovery differentiated matching and nonmatching applications.");
  assert((await request(application.public_reference, email, operation)).accepted, "Recovery replay did not return its neutral receipt.");
  assert((await getStatus(verified.accessToken))?.applicationReference === application.public_reference,
    "Requesting recovery invalidated the existing browser before email confirmation.");
  await db.exec("reset role");
  const first = await currentChallenge(application.id);
  assert(first?.payload?.verificationToken, "Recovery did not queue a private email challenge.");
  const firstAttemptCount = (await db.query(
    "select count(*)::int as n from private.rental_application_recovery_attempts where application_contact_hash=$1",
    [contactDigest(application.public_reference, email)],
  )).rows[0].n;
  assert(firstAttemptCount === 1, "Replay or guessed references consumed the exact application's contact budget.");

  await db.query(`update private.rental_application_recovery_challenges
    set created_at=now()-interval '31 minutes',expires_at=now()-interval '1 minute' where application_id=$1`, [application.id]);
  await db.exec("set role service_role");
  assert((await confirm(first.payload.verificationToken)).verified === false, "Expired recovery token remained usable.");
  await request(application.public_reference, email);
  await db.exec("reset role");
  const replacement = await currentChallenge(application.id);
  const canceled = (await db.query("select status,payload from private.notification_jobs where id=$1", [first.id])).rows[0];
  assert(replacement.id !== first.id && canceled.status === "canceled" && !canceled.payload.verificationToken,
    "Superseded recovery notice was not canceled and scrubbed.");

  await db.exec("set role service_role");
  assert((await confirm(first.payload.verificationToken)).verified === false, "Superseded challenge restored access.");
  assert((await confirm(application.initial_token)).verified === false, "Initial submission credential was accepted as recovery.");
  const restored = await confirm(replacement.payload.verificationToken);
  assert(restored.verified && restored.applicationReference === application.public_reference
    && restored.accessToken !== verified.accessToken, "Recovery did not rotate the exact application capability.");
  assert((await getStatus(restored.accessToken))?.applicationReference === application.public_reference,
    "New browser capability cannot read the exact application.");
  assert(await getStatus(verified.accessToken) === null, "Superseded browser capability remained readable.");
  assert((await confirm(replacement.payload.verificationToken)).verified === false, "Recovery link was reusable.");
  await expectDatabaseError(() => db.query("select public.withdraw_public_rental_application($1,$2)",
    [verified.accessToken, randomUUID()]), "APPLICATION_ACCESS_NOT_FOUND");
  await request(application.public_reference, email);
  await db.exec("reset role");
  const terminal = await currentChallenge(application.id);
  assert(terminal.id !== replacement.id && terminal.payload.verificationToken, "Second device recovery could not be requested.");
  await db.exec("set role service_role");
  await request(application.public_reference, email, randomUUID(), digest("different network"));
  await db.exec("reset role");
  const budget = (await db.query(
    "select count(*)::int as n from private.rental_application_recovery_attempts where application_contact_hash=$1",
    [contactDigest(application.public_reference, email)],
  )).rows[0].n;
  assert(budget === 3, "The application contact's recovery budget was bypassed from another network.");
  await db.exec("set role service_role");
  await db.query("select public.withdraw_public_rental_application($1,$2)", [restored.accessToken, randomUUID()]);
  assert((await confirm(terminal.payload.verificationToken)).verified === false, "Recovery reopened a withdrawn application.");
  await db.exec("reset role");
  const terminalNotice = await currentChallenge(application.id);
  assert(terminalNotice.status === "canceled" && !terminalNotice.payload.verificationToken,
    "The pending notice for the withdrawn application was not canceled and scrubbed.");
  return { neutralRequest: true, exactContactBudget: true, networkBudget: true,
    idempotent: true, expiredDenied: true, exactOneTimeRotatedAccess: true, terminalDenied: true };
}
