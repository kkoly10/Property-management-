// Isolated full-schema PostgreSQL B4 transaction contention assertions.
// Called only by the identity-checked disposable database lifecycle harness.
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const host = "127.0.0.1";
const port = "55439";
const owner = "fb000000-0000-4000-8000-000000000001";
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function literal(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}
function connection(database) {
  assert(/^crecy_b4_lifecycle_[a-f0-9]{12}$/.test(database),
    "Refusing concurrency test outside disposable B4 database");
  const proc = spawn("psql", [
    "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
    "-h", host, "-p", port, "-d", database,
  ], { stdio: ["pipe", "pipe", "pipe"] });
  let out = "", err = "", ended = false;
  proc.stdout.on("data", (chunk) => { out += chunk.toString(); });
  proc.stderr.on("data", (chunk) => { err += chunk.toString(); });
  proc.on("exit", () => { ended = true; });
  return {
    send: (sql) => proc.stdin.write(sql + "\n"),
    get out() { return out; },
    get err() { return err; },
    async until(marker) {
      for (let i = 0; i < 100; i++) {
        if (out.includes(marker)) return;
        if (ended) throw new Error("PostgreSQL session exited: " + err.slice(-1000));
        await sleep(50);
      }
      throw new Error("PostgreSQL session stalled waiting for " + marker
        + "; stdout=" + out.slice(-500) + "; stderr=" + err.slice(-1000));
    },
    close() {
      if (!ended) { proc.stdin.write("ROLLBACK;\n\\q\n"); proc.stdin.end(); }
    },
    kill() { if (!ended) proc.kill("SIGTERM"); },
  };
}
function command(kind, candidate) {
  const { application, accessToken } = candidate;
  if (kind === "prepare") {
    return {
      role: "authenticated",
      sql: `select public.prepare_rental_application_lease(${literal(application.organization_id)}::uuid,${literal(application.id)}::uuid,${application.version},${literal(randomUUID())}::uuid);`,
    };
  }
  if (kind === "close") {
    return {
      role: "authenticated",
      sql: `select public.close_rental_application(${literal(application.organization_id)}::uuid,${literal(application.id)}::uuid,${application.version},${literal(randomUUID())});`,
    };
  }
  if (kind === "activate") {
    return {
      role: "authenticated",
      sql: `select public.activate_homeowner_lease_setup(${literal(application.organization_id)}::uuid,${literal(application.unit_id)}::uuid,${candidate.setupRevision},true,true);`,
    };
  }
  return {
    role: "service_role",
    sql: `select public.withdraw_public_rental_application(${literal(accessToken)},${literal(randomUUID())});`,
  };
}
function beginCommand(call, expectedError) {
  const roleSql = `BEGIN; SET LOCAL statement_timeout='8s'; SET ROLE ${call.role};
SET request.jwt.claim.sub=${literal(owner)};`;
  if (!expectedError) return `${roleSql}\n${call.sql}\n\\echo B4_STEP_READY`;
  const body = call.sql.replace(/^select /, "perform ").replace(/;$/, "");
  return `${roleSql}\nDO $b4$ BEGIN ${body}; RAISE NOTICE 'B4_UNEXPECTED_SUCCESS';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'B4_CAUGHT:%',SQLERRM; END $b4$;
\\echo B4_STEP_READY`;
}
async function seed(db, listing, day) {
  const email = `b4-race-${randomUUID()}@example.test`;
  await db.exec("reset role; set role service_role");
  await db.query(
    "select public.submit_public_rental_application($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10)",
    [listing.public_id, "Race", "Applicant", email, day, "", "",
      "8".repeat(64), "en-US", randomUUID()],
  );
  await db.exec("reset role");
  const application = (await db.query(
    "select id,organization_id,unit_id,status,version from public.rental_applications where email=$1",
    [email],
  )).rows[0];
  assert(application?.status === "pending_verification", "Race applicant submission failed");
  const job = (await db.query(
    "select payload from private.notification_jobs where idempotency_key=$1",
    [`rental-application-verification:${application.id}`],
  )).rows[0];
  await db.exec("set role service_role");
  const verified = (await db.query(
    "select public.verify_public_rental_application($1) result",
    [job.payload.verificationToken],
  )).rows[0].result;
  assert(verified.accessToken, "Race applicant verification failed");
  await db.exec("reset role");
  const current = (await db.query(
    "select id,organization_id,unit_id,status,version from public.rental_applications where id=$1",
    [application.id],
  )).rows[0];
  assert(current.status === "submitted", "Race applicant not submitted after verification");
  return { application: current, accessToken: verified.accessToken };
}
async function race(database, db, candidate, firstKind, secondKind, expectedStatus, expectedError) {
  const first = connection(database), second = connection(database);
  try {
    first.send(beginCommand(command(firstKind, candidate), null));
    await first.until("B4_STEP_READY");
    second.send(beginCommand(command(secondKind, candidate), expectedError));
    await sleep(300);
    assert(!second.out.includes("B4_STEP_READY"),
      `${firstKind} vs ${secondKind} did not wait on an active transaction`);
    first.send("COMMIT;\n\\echo B4_FIRST_COMMITTED");
    await first.until("B4_FIRST_COMMITTED");
    await second.until("B4_STEP_READY");
    second.send("COMMIT;\n\\echo B4_SECOND_COMMITTED");
    await second.until("B4_SECOND_COMMITTED");
    if (expectedError) {
      assert(second.err.includes(`B4_CAUGHT:${expectedError}`),
        `Expected ${expectedError}, got ${second.err.slice(-600)}`);
      assert(!second.err.includes("B4_UNEXPECTED_SUCCESS"), "Conflict RPC unexpectedly succeeded");
    } else {
      assert(!second.err.includes("B4_CAUGHT:"), "Expected second command success: " + second.err);
    }
  } finally {
    first.close(); second.close(); first.kill(); second.kill();
  }
  await db.exec("reset role");
  const state = (await db.query(
    `select status,version from public.rental_applications where id=$1`,
    [candidate.application.id],
  )).rows[0];
  assert(state.status === expectedStatus,
    `${firstKind}/${secondKind}: expected ${expectedStatus}, got ${state.status}`);
  const counts = (await db.query(`
    select
      (select count(*)::integer from audit.audit_events
       where resource_id=$1 and action_code='rental_application.lease_prepared') as prepared,
      (select count(*)::integer from audit.audit_events
       where resource_id=$1 and action_code='rental_application.withdrawn') as withdrawn,
      (select count(*)::integer from audit.audit_events
       where resource_id=$1 and action_code='rental_application.closed') as closed,
      (select count(*)::integer from private.outbox_events
       where aggregate_id=$1 and event_type in
       ('rental_application.lease_prepared','rental_application.withdrawn','rental_application.closed')) as outbox,
      (select count(*)::integer from private.homeowner_lease_setups
       where source_rental_application_id=$1) as drafts
  `, [candidate.application.id])).rows[0];
  const expectedPrepared = (firstKind === "prepare" || candidate.preparedBeforeRace) ? 1 : 0;
  const expectedWithdrawn = expectedStatus === "withdrawn" ? 1 : 0;
  const expectedClosed = expectedStatus === "closed" ? 1 : 0;
  assert(counts.prepared === expectedPrepared
    && counts.withdrawn === expectedWithdrawn
    && counts.closed === expectedClosed
    && counts.outbox === expectedPrepared + expectedWithdrawn + expectedClosed
    && counts.drafts === 0,
  `${firstKind}/${secondKind} audit/outbox/draft mismatch: ${JSON.stringify(counts)}`);
  await db.exec("set role service_role");
  const remainingAccess = (await db.query(
    "select public.get_public_rental_application_for_access($1) result",
    [candidate.accessToken],
  )).rows[0].result;
  assert(remainingAccess === null, "Terminal race left applicant access active");
  await db.exec("reset role");
}
// Two distinct verified applicants targeting one unit must not both advance to
// lease preparation, even when the losing manager's transaction began earlier.
async function competingPreparations(db, { database, listing, day }) {
  const firstApplicant = await seed(db, listing, day);
  const secondApplicant = await seed(db, listing, day);
  assert(firstApplicant.application.unit_id === secondApplicant.application.unit_id,
    "Competing preparation fixture must address the same unit");
  const winner = connection(database), loser = connection(database);
  try {
    winner.send(beginCommand(command("prepare", firstApplicant), null));
    await winner.until("B4_STEP_READY");
    loser.send(beginCommand(command("prepare", secondApplicant),
      "ANOTHER_APPLICATION_IN_LEASE_PREPARATION"));
    await sleep(300);
    assert(!loser.out.includes("B4_STEP_READY"),
      "Second applicant preparation did not wait on the first unit lock");
    winner.send("COMMIT;\n\\echo B4_PREP_WINNER_COMMITTED");
    await winner.until("B4_PREP_WINNER_COMMITTED");
    await loser.until("B4_STEP_READY");
    loser.send("COMMIT;\n\\echo B4_PREP_LOSER_SETTLED");
    await loser.until("B4_PREP_LOSER_SETTLED");
    assert(loser.err.includes("B4_CAUGHT:ANOTHER_APPLICATION_IN_LEASE_PREPARATION")
      && !loser.err.includes("B4_UNEXPECTED_SUCCESS"),
    "Concurrent competing application incorrectly prepared a second draft: " + loser.err.slice(-500));
  } finally {
    winner.close(); loser.close(); winner.kill(); loser.kill();
  }
  await db.exec("reset role");
  const result = (await db.query(`
    select
      (select status from public.rental_applications where id=$1) as winner_status,
      (select status from public.rental_applications where id=$2) as loser_status,
      (select count(*)::integer from private.homeowner_lease_setups
       where source_rental_application_id in ($1,$2)) as drafts,
      (select count(*)::integer from audit.audit_events
       where resource_id in ($1,$2) and action_code='rental_application.lease_prepared') as audits,
      (select count(*)::integer from private.outbox_events
       where aggregate_id in ($1,$2) and event_type='rental_application.lease_prepared') as outbox
  `, [firstApplicant.application.id, secondApplicant.application.id])).rows[0];
  assert(result.winner_status === "lease_preparation"
    && result.loser_status === "submitted"
    && result.drafts === 1 && result.audits === 1 && result.outbox === 1,
  "Competing applicant preparation violated single-winner invariant: " + JSON.stringify(result));
  // Losing preparation must not consume or cross-wire the other prospect's
  // private status capability; the applicant can still withdraw independently.
  await db.exec("set role service_role");
  const loserAccess = (await db.query(
    "select public.get_public_rental_application_for_access($1) result",
    [secondApplicant.accessToken],
  )).rows[0].result;
  await db.exec("reset role");
  assert(loserAccess?.status === "submitted",
    "Competing lease preparation revoked or leaked losing applicant access");
  // Leave the fixture's shared unit free for subsequent close/activation tests.
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${owner}'`);
  const closed = (await db.query(
    "select public.close_rental_application($1,$2,$3,$4) result",
    [firstApplicant.application.organization_id, firstApplicant.application.id,
      firstApplicant.application.version + 1, randomUUID()],
  )).rows[0].result;
  await db.exec("reset role");
  assert(closed?.status === "closed",
    "Competing preparation fixture did not release the winning draft");
  return true;
}

export async function validateRentalApplicationFullRaces(db, { database, listing, day }) {
  const cases = [
    ["prepare", "withdraw", "withdrawn", null],
    ["withdraw", "prepare", "withdrawn", "APPLICATION_VERSION_CONFLICT"],
    ["close", "withdraw", "closed", "APPLICATION_NOT_WITHDRAWABLE"],
    ["withdraw", "close", "withdrawn", "APPLICATION_VERSION_CONFLICT"],
  ];
  for (const [first, second, status, error] of cases) {
    const candidate = await seed(db, listing, day);
    await race(database, db, candidate, first, second, status, error);
  }
  const distinctApplicantPreparationSerialized = await competingPreparations(
    db, { database, listing, day });
  // Inverse of activation-first: closure commits while lease activation waits
  // on the unit lock. A closed application must never create a signed tenancy.
  const closeFirst = await seed(db, listing, day);
  const tenancyBefore = (await db.query(
    "select count(*)::integer n from public.tenancies where unit_id=$1",
    [closeFirst.application.unit_id],
  )).rows[0].n;
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${owner}'`);
  const draft = (await db.query(
    "select public.prepare_rental_application_lease($1,$2,$3,$4) result",
    [closeFirst.application.organization_id, closeFirst.application.id,
      closeFirst.application.version, randomUUID()],
  )).rows[0].result;
  await db.exec("reset role");
  assert(draft.setupRevision && draft.applicationVersion,
    "Close-first fixture did not prepare the operator-owned lease draft");
  await race(database, db, {
    ...closeFirst, application: { ...closeFirst.application, version: draft.applicationVersion },
    setupRevision: draft.setupRevision, preparedBeforeRace: true,
  }, "close", "activate", "closed", "SETUP_NOT_FOUND");
  const afterClose = (await db.query(`
    select
      (select count(*)::integer from public.tenancies where unit_id=$1) as tenancies,
      (select count(*)::integer from audit.audit_events
        where resource_id=$2 and action_code='rental_application.converted') as conversions,
      (select count(*)::integer from private.outbox_events
        where aggregate_id=$2 and event_type='rental_application.converted') as conversion_outbox
  `, [closeFirst.application.unit_id, closeFirst.application.id])).rows[0];
  assert(afterClose.tenancies === tenancyBefore
    && afterClose.conversions === 0 && afterClose.conversion_outbox === 0,
  "Close-first race leaked a signed tenancy or conversion event: " + JSON.stringify(afterClose));
  const crossListingNetworkSerialized = await crossListingNetworkBudget(
    db, { database, listing, day });
  return { isolatedPostgresTransactionRaces: cases.length + 2,
    prepareWithdraw: true, closeWithdraw: true, oppositeOrdering: true,
    distinctApplicantPreparationSerialized,
    closeBeforeActivation: true, crossListingNetworkSerialized };
}

export async function validateApplicationActivationVersusClose(db, {
  database, application, setupRevision,
}) {
  const candidate = { application, setupRevision };
  const activating = connection(database), closing = connection(database);
  let activated;
  try {
    activating.send(beginCommand(command("activate", candidate), null));
    await activating.until("B4_STEP_READY");
    const resultLine = activating.out.split("\n").find((line) => line.trim().startsWith("{"));
    assert(resultLine, "Lease activation did not return its signed tenancy receipt");
    activated = JSON.parse(resultLine);
    assert(activated.tenancyId && activated.householdId,
      "Activation returned no signed tenancy/household receipt");

    closing.send(beginCommand(command("close", candidate), "APPLICATION_VERSION_CONFLICT"));
    await sleep(300);
    assert(!closing.out.includes("B4_STEP_READY"),
      "Close did not wait for the still-uncommitted lease activation");
    activating.send("COMMIT;\n\\echo B4_ACTIVATION_COMMITTED");
    await activating.until("B4_ACTIVATION_COMMITTED");
    await closing.until("B4_STEP_READY");
    closing.send("COMMIT;\n\\echo B4_CLOSE_SETTLED");
    await closing.until("B4_CLOSE_SETTLED");
    assert(closing.err.includes("B4_CAUGHT:APPLICATION_VERSION_CONFLICT")
      && !closing.err.includes("B4_UNEXPECTED_SUCCESS"),
    "Activation-vs-close did not reject the stale close: " + closing.err.slice(-500));
  } finally {
    activating.close(); closing.close(); activating.kill(); closing.kill();
  }
  await db.exec("reset role");
  const row = (await db.query(
    "select status,converted_tenancy_id,converted_household_id from public.rental_applications where id=$1",
    [application.id],
  )).rows[0];
  assert(row.status === "converted" && row.converted_tenancy_id === activated.tenancyId
    && row.converted_household_id === activated.householdId,
  "Losing close transaction altered the signed tenancy conversion");
  const counts = (await db.query(`
    select
      (select count(*)::integer from audit.audit_events
       where resource_id=$1 and action_code='rental_application.converted') as converted,
      (select count(*)::integer from audit.audit_events
       where resource_id=$1 and action_code='rental_application.closed') as closed,
      (select count(*)::integer from private.outbox_events
       where aggregate_id=$1 and event_type='rental_application.converted') as converted_outbox,
      (select count(*)::integer from private.outbox_events
       where aggregate_id=$1 and event_type='rental_application.closed') as closed_outbox
  `, [application.id])).rows[0];
  assert(counts.converted === 1 && counts.closed === 0 &&
    counts.converted_outbox === 1 && counts.closed_outbox === 0,
  "Activation/closure contention duplicated or contradicted audit/outbox records: " +
    JSON.stringify(counts));
  return activated;
}

async function crossListingNetworkBudget(db, { database, listing, day }) {
  await db.exec("reset role");
  // A separate synthetic published listing in the same organization isolates
  // the cross-listing network lock. Only this disposable fixture bypasses
  // listing publication/photo setup; every application uses the real RPC.
  const second = (await db.query(`
    insert into public.rental_listings(
      organization_id,property_id,unit_id,title,summary,rent_amount_minor,
      currency_code,available_on,country_code,status,visibility,published_at)
    select l.organization_id, u.property_id,u.id,
      'Second B4 network contention unit',
      'Isolated cross-listing network rate budget test listing.',
      l.rent_amount_minor,l.currency_code,l.available_on,l.country_code,
      'published','unlisted',now()
    from public.rental_listings l
    join lateral (
      select x.id,x.property_id from public.units x
      where x.organization_id=l.organization_id and x.id<>l.unit_id
      order by x.id limit 1
    ) u on true where l.id=$1
    returning id,public_id
  `, [listing.id])).rows[0];
  assert(second?.id && second.id !== listing.id, "No independent second rental listing fixture");
  const network = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  await db.query(`
    insert into private.rental_application_attempts(listing_id,email_hash,network_hash)
    select $1,encode(sha256(convert_to('network-prefill:'||g::text,'UTF8')),'hex'),$2
    from generate_series(1,19) g
  `, [listing.id, network]);
  const firstEmail = `b4-network-first-${randomUUID()}@example.test`;
  const secondEmail = `b4-network-second-${randomUUID()}@example.test`;
  const submitSql = (publicId, email) =>
    `select public.submit_public_rental_application(
       ${literal(publicId)}::uuid,'Network','Budget',${literal(email)},
       ${literal(day)}::date,'','',${literal(network)},'en-US',${literal(randomUUID())});`;
  const first = connection(database), secondSession = connection(database);
  try {
    first.send(beginCommand({ role: "service_role",
      sql: submitSql(listing.public_id, firstEmail) }, null));
    await first.until("B4_STEP_READY");
    secondSession.send(beginCommand({ role: "service_role",
      sql: submitSql(second.public_id, secondEmail) }, null));
    await sleep(300);
    assert(!secondSession.out.includes("B4_STEP_READY"),
      "Network budget did not serialize two independent listing submissions");
    first.send("COMMIT;\n\\echo B4_NETWORK_FIRST_COMMITTED");
    await first.until("B4_NETWORK_FIRST_COMMITTED");
    await secondSession.until("B4_STEP_READY");
    secondSession.send("COMMIT;\n\\echo B4_NETWORK_SECOND_COMMITTED");
    await secondSession.until("B4_NETWORK_SECOND_COMMITTED");
    assert(first.out.includes('"accepted": true')
      && secondSession.out.includes('"accepted": true'),
    "Network budget response exposed the limit or failed neutral acceptance");
  } finally {
    first.close(); secondSession.close(); first.kill(); secondSession.kill();
  }
  await db.exec("reset role");
  const result = (await db.query(`
    select
      (select count(*)::integer from private.rental_application_attempts
        where network_hash=$1) as attempts,
      (select count(*)::integer from public.rental_applications
        where email=$2) as first_application,
      (select count(*)::integer from public.rental_applications
        where email=$3) as second_application,
      (select count(*)::integer from private.notification_jobs
        where recipient_address in ($2,$3)
          and template_code='rental_application_verification') as notices
  `, [network, firstEmail, secondEmail])).rows[0];
  assert(result.attempts === 21 && result.first_application === 1
    && result.second_application === 0 && result.notices === 1,
  "Concurrent listings overspent shared 20/hour budget: " + JSON.stringify(result));
  return true;
}
