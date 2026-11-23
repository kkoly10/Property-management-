import { randomUUID } from "node:crypto";

export async function validateRentalProspectTours(db, { assert, expectDatabaseError }, fixture) {
  const { tour, renter, date, network, operator, confirmed, confirm, organizationId, owner } = fixture;
  const rpc = async (functionCall, args) => (await db.query(`select public.${functionCall} as r`, args)).rows[0].r;
  const service = () => db.exec("reset role; set local role service_role");
  const operation = randomUUID();
  await db.exec("begin");
  try {
    await service();
    const mailId = await rpc("recover_rental_conversation($1,$2,$3)", [tour.public_reference, renter, network]);
    await db.exec("reset role");
    const { rows: [{ token }] } = await db.query("select payload->>'conversationToken' as token from private.notification_jobs where id=$1", [mailId]);
    await service();
    const session = (await rpc("redeem_rental_conversation($1)", [token])).session;
    const read = (reference = tour.public_reference) => rpc("manage_rental_prospect_tour($1,$2)", [session, reference]);
    const reschedule = (preferences, version = confirmed.version, key = operation) =>
      rpc("manage_rental_prospect_tour($1,$2,'reschedule',$3,$4,$5::jsonb)",
        [session, tour.public_reference, version, key, JSON.stringify(preferences)]);
    assert(await read("TOUR-ABCDEFABCDEF") === null, "The verified tour cookie opened another tour.");
    assert((await read()).confirmedStartAt === confirmed.confirmedStartAt, "The verified renter did not see their own appointment.");

    await db.exec("savepoint invalid_tour_changes");
    await expectDatabaseError(() => reschedule([`${date}T16:00`, `${date}T16:00`]), "INVALID_TOUR_LOCAL_TIME");
    await db.exec("rollback to savepoint invalid_tour_changes");
    await expectDatabaseError(() => reschedule([`${date}T16:00`], confirmed.version - 1), "TOUR_VERSION_CONFLICT");
    await db.exec("rollback to savepoint invalid_tour_changes");

    const preferences = [`${date}T16:00`, `${date}T18:00`];
    const updated = await reschedule(preferences);
    assert(updated.changePending && updated.preferences.length === 2
      && updated.confirmedStartAt === confirmed.confirmedStartAt
      && (await reschedule(preferences)).version === updated.version,
    "A replacement request moved the existing appointment or failed idempotent replay.");

    await operator();
    const choice = (await db.query("select position from public.rental_tour_preferences where tour_request_id=$1 and starts_at=$2 order by position", [tour.id, updated.preferences[0]])).rows[0].position;
    const accepted = await confirm(updated.version, choice);
    await service();
    const newState = await read();
    assert(!newState.changePending && newState.confirmedStartAt === accepted.confirmedStartAt
      && newState.confirmedStartAt !== confirmed.confirmedStartAt, "The landlord’s choice did not complete the reschedule.");
    const cancellation = randomUUID();
    const cancel = () => rpc("manage_rental_prospect_tour($1,$2,'cancel',$3,$4)",
      [session, tour.public_reference, newState.version, cancellation]);
    assert((await cancel()).status === "cancelled" && (await cancel()).version === newState.version + 1
      && (await read()).canManage === false, "The renter could not cancel the exact tour safely.");

    await db.exec("reset role");
    const { rows: [{ count }] } = await db.query(`select count(*)::int as count from private.notification_jobs
      where organization_id=$1 and recipient_user_id=$2 and template_code='message_rental_tour_reply'
      and idempotency_key like 'renter-tour-update:%' and payload->>'tourReference'=$3`,
    [organizationId, owner, tour.public_reference]);
    assert(count === 2, "The renter’s two updates did not produce one scoped landlord message each.");
    await db.query("update private.rental_prospect_access set session_expires_at=now()-interval '1 second' where case_id=$1 and session_hash is not null", [tour.id]);
    await service();
    assert(await read() === null, "An expired conversation session retained tour authority.");
    await operator();
    await db.exec("savepoint denied_tour_manager");
    await expectDatabaseError(() => read(), "permission denied");
    await db.exec("rollback to savepoint denied_tour_manager");
  } finally {
    await db.exec("rollback");
  }
  return { verifiedSession: true, verifiedRenterCancellation: true, confirmedTimeHeld: true, operatorChoseNewTime: true };
}
