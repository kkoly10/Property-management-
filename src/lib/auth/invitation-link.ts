import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The authentication action link that goes INSIDE the one Crecy invitation email.
 *
 * ── What this replaces ───────────────────────────────────────────────────────────────────────────
 *
 * Invitations used to queue a branded Crecy notification job and then separately call
 * `auth.signInWithOtp()`, which made Supabase Auth send its OWN plain magic-link email. The route then
 * marked the queued Crecy job `sent`. So the recipient received Supabase's email, the Crecy email was
 * never sent by anyone, and the queue claimed a delivery no transport had accepted.
 *
 * `auth.admin.generateLink` exists for exactly this: it is documented as generating "email links and
 * OTPs to be sent via a custom email provider". It mints the credential and sends nothing.
 *
 * ── Why `magiclink` and not `invite` ─────────────────────────────────────────────────────────────
 *
 * This is the load-bearing decision, and it is made FOR us by the fact that both invitation routes
 * already create the auth user themselves (`auth.admin.createUser({ email_confirm: false })`) before
 * the command runs. The user therefore always exists by the time we get here.
 *
 *   * `invite` is the "this person has no account yet" link, and its behaviour for an account that
 *     already exists has changed across GoTrue versions — supabase/supabase#22562 reports it returning
 *     `user_not_found` (404) after v2.145.0, the reverse of its earlier behaviour, with the reporter
 *     confirming `magiclink` worked instead. Depending on it would be depending on a semantic that has
 *     already flipped once.
 *   * `magiclink` is the "sign this existing person in" link. That is precisely our case.
 *
 * The other known hazard, supabase/supabase#22521 — `generateLink('magiclink')` occasionally failing to
 * CREATE a user that does not exist — cannot reach us, because we never ask it to create anybody. The
 * account is provisioned first, deliberately, and that is what makes the stable path available.
 *
 * ── The redirect is a hard configuration dependency, not a nicety ────────────────────────────────
 *
 * The returned `action_link` has the documented shape
 * `auth/v1/verify?type=…&token=…&redirect_to=…`, so `redirectTo` IS preserved inside the credential.
 * But GoTrue validates `redirect_to` against the project's allow-list of Redirect URLs and silently
 * falls back to the project SITE_URL when it does not match. A recipient would then land signed in on
 * the site root with no invitation token, and the accept page would tell them their link is
 * incomplete — the exact dead end this whole slice exists to remove, reintroduced by a setting.
 *
 * The Crecy callback origin therefore MUST be on that allow-list before any real invitation is sent.
 * It is recorded as a launch step in `docs/implementation/LAUNCH_RUNBOOK.md`; it cannot be enforced
 * from here, because the failure is a silent substitution rather than an error.
 *
 * ── The result is a credential ───────────────────────────────────────────────────────────────────
 *
 * `action_link` embeds a hashed auth token. Anyone holding it can complete the sign-in as the invited
 * person. It is handled exactly like the invitation token: passed straight into the command, stored
 * only on the private notification job, never audited, never put in an outbox payload, never logged,
 * never returned to a browser client, and scrubbed from the job the moment it is terminal.
 */
export type InvitationAuthLink =
  | { ok: true; actionUrl: string }
  | { ok: false; code: "AUTH_LINK_UNAVAILABLE" };

export type GenerateInvitationAuthLinkInput = {
  email: string;
  /** Absolute Crecy URL the recipient returns to after authenticating; must be allow-listed in Supabase. */
  redirectTo: string;
};

export async function generateInvitationAuthLink(
  admin: SupabaseClient,
  { email, redirectTo }: GenerateInvitationAuthLinkInput,
): Promise<InvitationAuthLink> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });

  const actionUrl = data?.properties?.action_link;
  // No error branch reads `error.message` into a response or a log line on purpose: a GoTrue failure
  // body can echo the address and, on some paths, link material. The caller gets a fixed code.
  if (error || typeof actionUrl !== "string" || !/^https:\/\//i.test(actionUrl)) {
    return { ok: false, code: "AUTH_LINK_UNAVAILABLE" };
  }
  return { ok: true, actionUrl };
}
