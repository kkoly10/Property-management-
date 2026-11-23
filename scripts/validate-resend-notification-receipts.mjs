import { randomUUID } from "node:crypto";

export async function validateResendNotificationReceipts(db, { assert, expectDatabaseError }) {
  const recipient = randomUUID();
  const outsider = randomUUID();
  const [earlyJob, legacyJob, duplicateJob] = [randomUUID(), randomUUID(), randomUUID()];
  const [earlyEmail, legacyEmail, unrelatedEmail] = [randomUUID(), randomUUID(), randomUUID()];
  const issuerJobKey = randomUUID();
  const firstSentAt = "2026-01-01T00:00:00Z";
  const deliveredAt = "2026-01-01T00:00:11Z";
  const laterDelayAt = "2026-01-01T00:00:22Z";
  const bounceAt = "2026-01-01T00:00:30Z";
  const eventId = (key) => `msg_${key}_${issuerJobKey}`;
  const rpc = async (name, args, params = []) => (await db.query(`select public.${name}(${args}) as r`, params)).rows[0].r;
  const record = (key, email, status, at) =>
    rpc("record_resend_notification_event", "$1,$2,$3,$4", [eventId(key), email, status, at]);
  const complete = (job, providerMessageId) =>
    rpc("complete_notification_job", "$1,'relay',$2", [job, providerMessageId]);
  const recent = async (actor) => {
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${actor}'`);
    return (await rpc("get_notification_preferences_workspace", "")).recentDeliveries;
  };
  const statusFor = (details, job) => details.find((item) => item.notificationJobId === job)?.latestDeliveryStatus;

  await db.exec("reset role");
  await db.query("insert into auth.users(id) values ($1),($2)", [recipient, outsider]);
  await db.query(`insert into private.notification_jobs(id,template_code,locale,channel,recipient_user_id,payload,status,attempts,idempotency_key)
    values ($1::uuid,'message_rental_inquiry_received','en-US','email',$4,'{}','processing',1,($1::uuid)::text),
           ($2::uuid,'message_rental_inquiry_received','en-US','email',$4,'{}','processing',1,($2::uuid)::text),
           ($3::uuid,'message_rental_inquiry_received','en-US','email',$5,'{}','processing',1,($3::uuid)::text)`,
  [earlyJob, legacyJob, duplicateJob, recipient, outsider]);

  await db.exec("set role anon");
  await expectDatabaseError(() => record("anon", earlyEmail, "delivered", deliveredAt), "permission denied");
  await db.exec("reset role; set role authenticated");
  await expectDatabaseError(() => record("authenticated", earlyEmail, "delivered", deliveredAt), "permission denied");
  await db.exec("reset role; set role service_role");
  await expectDatabaseError(() => db.query("select * from private.resend_notification_events"), "permission denied");
  await expectDatabaseError(() => db.query("select * from private.get_notification_delivery_state($1)", [earlyJob]), "permission denied");
  await expectDatabaseError(() => record("invalid", earlyEmail, "opened", firstSentAt), "INVALID_RESEND_DELIVERY_EVENT");

  assert(await record("unrelated", unrelatedEmail, "delivered", deliveredAt) === true,
    "An early provider receipt could not be staged for later correlation.");
  assert(await record("early", earlyEmail, "delivered", deliveredAt) === true,
    "A verified receipt could not arrive before acceptance.");
  assert(await record("early", earlyEmail, "bounced", bounceAt) === false,
    "The same Svix event ID could overwrite an existing record.");
  assert(statusFor(await recent(recipient), earlyJob) === null,
    "The early receipt was published to history without a matching accepted provider ID.");

  await db.exec("reset role; set role service_role");
  await complete(earlyJob, earlyEmail);
  await complete(legacyJob, legacyEmail);
  assert(await record("late-delay", earlyEmail, "delayed", laterDelayAt) === true,
    "A valid out-of-order event could not be stored.");
  const delivered = await recent(recipient);
  assert(statusFor(delivered, earlyJob) === "delivered" && statusFor(delivered, legacyJob) === "accepted",
    "History did not distinguish the provider-confirmed and transport-accepted emails.");

  await db.exec("reset role; set role service_role");
  assert(await record("legacy-delay", legacyEmail, "delayed", laterDelayAt) === true,
    "An untagged receipt could not match its existing exact provider acceptance.");
  assert(statusFor(await recent(recipient), legacyJob) === "delayed",
    "A transient provider delay did not appear in history.");
  await db.exec("reset role; set role service_role");
  assert(await record("legacy-bounce", legacyEmail, "bounced", bounceAt) === true,
    "The provider bounce did not persist.");
  assert(await record("older-delivery", legacyEmail, "delivered", deliveredAt) === true,
    "An older provider confirmation could not be stored for dedupe.");
  const bounced = await recent(recipient);
  assert(statusFor(bounced, legacyJob) === "bounced" && statusFor(bounced, earlyJob) === "delivered",
    "An older or uncorrelated provider event replaced the correct outcome.");
  assert(!(await recent(outsider)).some((item) => item.notificationJobId === earlyJob || item.notificationJobId === legacyJob),
    "Another user received someone else's private mail health history.");

  await db.exec("reset role; set role service_role");
  await complete(duplicateJob, earlyEmail.toUpperCase());
  assert(statusFor(await recent(recipient), earlyJob) === "accepted" && statusFor(await recent(outsider), duplicateJob) === "accepted",
    "An ambiguous accepted provider identifier exposed a provider receipt.");
  await db.exec("reset role");
  await db.query("delete from private.notification_jobs where id=$1", [duplicateJob]);

  await db.exec("begin");
  try {
    await db.query("update private.resend_notification_events set received_at=now()-interval '3 days' where event_id in ($1,$2)",
      [eventId("unrelated"), eventId("early")]);
    await db.exec("set local role service_role");
    const swept = await rpc("sweep_expired_operational_records", "1000");
    assert(swept.purgedUnmatchedResendReceipts === 1, "The daily sweep did not purge the expired unlinked ID.");
    await db.exec("reset role");
    const remaining = (await db.query("select event_id from private.resend_notification_events where event_id in ($1,$2)",
      [eventId("unrelated"), eventId("early")])).rows;
    assert(remaining.length === 1 && remaining[0].event_id === eventId("early"),
      "The sweep removed linked history or preserved an expired unlinked receipt.");
  } finally {
    await db.exec("rollback");
  }

  const ids = [earlyEmail, legacyEmail, unrelatedEmail];
  const before = (await db.query("select count(*)::int as total from private.resend_notification_events where provider_message_id=any($1::uuid[])",
    [ids])).rows[0].total;
  assert(before === 6, "Exactly the provider events supported by the fixture should be persisted.");
  await db.query("delete from private.resend_notification_events where provider_message_id=any($1::uuid[])", [ids]);
  await db.query("delete from private.notification_jobs where id=any($1::uuid[])", [[earlyJob, legacyJob]]);

  return {
    unauthorizedIngestDenied: true, earlyReceiptReconciled: true, legacyExactCorrelation: true,
    replayDeduped: true, outOfOrderSafe: true, recipientIsolated: true, orphanSweepVerified: true,
  };
}
