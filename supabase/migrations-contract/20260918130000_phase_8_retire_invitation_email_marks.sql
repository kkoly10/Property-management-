-- CONTRACT RELEASE — see supabase/migrations-contract/README.md before applying.
--
-- Retire the two RPCs whose only purpose was to record a delivery that had not happened.
--
-- APPLY THIS ONLY AFTER the build that removes the callers is deployed AND verified in the target
-- environment. The previously deployed invitation routes call
-- `mark_staff_invitation_email_sent` / `mark_relationship_invitation_email_sent` on every invitation;
-- revoking first makes every invitation return 500 until the new build is live.
--
-- ── Why these two go ─────────────────────────────────────────────────────────────────────────────
--
-- Both did one thing: flip a QUEUED notification job to `sent`. The route called them after
-- `auth.signInWithOtp()` returned success — a completely different provider doing a completely
-- different thing — so the queue recorded a Crecy email as delivered when no transport had ever seen
-- it, and the branded Crecy invitation was still sitting unsent behind a `sent` status.
--
-- After 20260918120000 the auth credential rides inside the Crecy job and the worker sends the one
-- email. `complete_notification_job` already owns the `sent` transition and only runs after a
-- transport accepts the message. A second, unauthenticated-by-delivery way to write `sent` is not a
-- spare capability; it is the ability to forge a delivery record, and the fact that nothing calls it
-- any more is exactly when it should stop being callable.
--
-- ── Why the two READ functions stay ──────────────────────────────────────────────────────────────
--
-- `get_staff_invitation_delivery_status` and `get_relationship_invitation_delivery_status` keep their
-- `service_role` grant and are deliberately NOT revoked. They report the job's real status, which is now truthful, and that is
-- precisely what an operator needs to see after sending an invitation — queued, sent, failed. A read
-- that answers "did it actually arrive?" is the opposite of the problem; retiring it alongside the
-- writers would remove the honest answer together with the dishonest one.
--
-- Authority: no table, no policy, no function definition. Counts unchanged.
begin;

-- `service_role`, not `authenticated`: these were never browser-callable. They were reached by the
-- invitation routes through the admin client, which is exactly the grant that has to go — revoking a
-- grant they never held would have looked like a contraction while changing nothing.
revoke execute on function public.mark_staff_invitation_email_sent(uuid) from service_role;
revoke execute on function public.mark_relationship_invitation_email_sent(uuid) from service_role;

commit;
