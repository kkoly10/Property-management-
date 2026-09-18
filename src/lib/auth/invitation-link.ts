import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The authentication credential that goes INSIDE the one Crecy invitation email.
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
 * ── Why the TOKEN HASH and not `properties.action_link` ──────────────────────────────────────────
 *
 * This is the correction that matters, and the first version of this file got it wrong.
 *
 * `action_link` is `…/auth/v1/verify?token=<hashed>&type=…&redirect_to=…`. Opening it makes GoTrue
 * verify the token and redirect to `redirect_to` — and because an admin-generated link carries no PKCE
 * code_verifier, that redirect is an **implicit-flow** one: the session arrives as a URL *fragment*
 * (`#access_token=…&refresh_token=…`), never as `?code=`. Supabase documents that `generateLink` does
 * not use PKCE even when the client is configured for it (supabase/auth-js#767,
 * supabase/supabase discussion #20937).
 *
 * A browser never sends the fragment to the server. Crecy's `/auth/callback` reads `?code=` and calls
 * `exchangeCodeForSession`, so it would have found no code and redirected every invited person to
 * `/signup?auth_error=1`. The "one click signs you in and accepts" path would have failed for
 * everybody, and it would have failed silently in exactly the place nobody tests by hand.
 *
 * So the action link is discarded. `properties.hashed_token` is the same credential without the
 * Supabase-hosted redirect wrapped around it, and `/auth/confirm` — which this slice already builds —
 * redeems it **server-side** with `verifyOtp({ type, token_hash })`, writes the session to cookies, and
 * then redirects. Supabase's own server-side guidance names this as the way to handle a generated link
 * on the server.
 *
 * A consequence worth stating: because GoTrue's `redirect_to` is no longer used, its allow-list no
 * longer decides where an invited person lands. Crecy's own `safeRedirectPath` does. That removes the
 * silent-substitution hazard the previous version had to document as a launch prerequisite.
 *
 * ── Why `magiclink` and not `invite` ─────────────────────────────────────────────────────────────
 *
 * Both invitation routes create the auth user themselves (`auth.admin.createUser`) before the command
 * runs, so the address always exists by the time we get here.
 *
 *   * `invite` is the "this person has no account yet" link, and its behaviour for an account that
 *     already exists has changed across GoTrue versions — supabase/supabase#22562 reports it returning
 *     `user_not_found` (404) after v2.145.0, the reverse of its earlier behaviour, with the reporter
 *     confirming `magiclink` worked instead.
 *   * `magiclink` is the "sign this existing person in" link. That is precisely our case, and it is
 *     the `EmailOtpType` `/auth/confirm` verifies against.
 *
 * supabase/supabase#22521 — `generateLink('magiclink')` occasionally failing to CREATE a missing user
 * — cannot reach us, because we never ask it to create anybody.
 *
 * ── The result is a credential ───────────────────────────────────────────────────────────────────
 *
 * Anyone holding the hash can complete the sign-in as the invited person. It is handled exactly like
 * the invitation token: attached to the queued job through a `service_role`-only command, stored only
 * on the private notification job, never audited, never put in an outbox payload, never logged, never
 * returned to a browser client, and scrubbed from the job the moment it is terminal.
 *
 * It is deliberately NOT a URL. A URL attached by a caller is a URL the Crecy worker will then send
 * under Crecy's From domain and branding — a phishing primitive wearing our own envelope. A hash is
 * opaque and inert: the worker builds the link itself, from an origin only the worker's environment
 * supplies, so every invitation link points at Crecy whatever reaches the queue.
 */
export type InvitationAuthToken =
  | { ok: true; tokenHash: string }
  | { ok: false; code: "AUTH_LINK_UNAVAILABLE" };

export type GenerateInvitationAuthTokenInput = {
  email: string;
};

/**
 * Supabase's token hashes are URL-safe text of modest length. The same shape `/auth/confirm` enforces
 * before redeeming one, applied here so a malformed value is refused at the point it is minted.
 */
export function isPlausibleTokenHash(value: unknown): value is string {
  return typeof value === "string" && value.length >= 16 && value.length <= 512 && /^[A-Za-z0-9_-]+$/.test(value);
}

export async function generateInvitationAuthToken(
  admin: SupabaseClient,
  { email }: GenerateInvitationAuthTokenInput,
): Promise<InvitationAuthToken> {
  // No `redirectTo`: the action link it would be baked into is the thing we are deliberately not
  // using. Where the recipient lands is decided by `next` on Crecy's own confirm endpoint.
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });

  const tokenHash = data?.properties?.hashed_token;
  // No branch reads `error.message` into a response or a log line on purpose: a GoTrue failure body can
  // echo the address and, on some paths, link material. The caller gets a fixed code.
  if (error || !isPlausibleTokenHash(tokenHash)) return { ok: false, code: "AUTH_LINK_UNAVAILABLE" };
  return { ok: true, tokenHash };
}
