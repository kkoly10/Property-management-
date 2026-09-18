import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/auth/redirect";

/**
 * Token-hash confirmation for Crecy-rendered authentication email.
 *
 * ── Why this exists next to /auth/callback rather than replacing it ──────────────────────────────
 *
 * `/auth/callback` handles the PKCE `?code=` exchange and is used by every link Supabase itself
 * redirects through — including the invitation links minted with `generateLink`, which return through
 * GoTrue's own `/auth/v1/verify` endpoint first. That path is untouched.
 *
 * The Send Email Auth Hook is different: it hands US a `token_hash` and expects the link in the email
 * to point at an endpoint of ours that redeems it. That is this route. Both exist because they redeem
 * two different things; collapsing them would break one of the two.
 *
 * ── The rules, each of which is a real failure mode ──────────────────────────────────────────────
 *
 *   * `type` is checked against the closed `EmailOtpType` set. An unvalidated value is passed
 *     straight into the auth client.
 *   * `token_hash` is shape-checked and bounded before it is used, so a hostile querystring is
 *     rejected here rather than forwarded upstream.
 *   * `next` goes through `safeRedirectPath`, which accepts only a single-slash relative path.
 *     `new URL(next, request.url)` does NOT constrain the result to this origin, so without it this
 *     would be an open redirect on the authentication path — landing a user who has just signed in on
 *     a site an attacker controls, at the exact moment they are most likely to trust what they see.
 *   * The final redirect is built from the SAFE PATH ALONE, never from the incoming URL. That is what
 *     keeps `token_hash` out of the address bar, out of the next page's referrer, and out of any
 *     analytics or server log that records a destination.
 *   * Nothing here logs the token, and no error message echoes it.
 */

/** The values `verifyOtp` accepts for an email link. Anything else is not forwarded. */
const EMAIL_OTP_TYPES = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;
type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number];

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return typeof value === "string" && (EMAIL_OTP_TYPES as readonly string[]).includes(value);
}

/**
 * Supabase's token hashes are URL-safe text of modest length. Checking the SHAPE before redeeming
 * keeps an oversized or structured value from ever reaching the auth client.
 */
function isPlausibleTokenHash(value: string | null): value is string {
  return typeof value === "string" && value.length >= 16 && value.length <= 512 && /^[A-Za-z0-9_-]+$/.test(value);
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"), "/");

  // A failure must not say WHICH check failed: "bad type" and "bad token" are different answers to
  // someone probing the endpoint. One destination for every rejection.
  const failure = NextResponse.redirect(new URL("/login?auth_error=1", request.url));

  if (!isEmailOtpType(type) || !isPlausibleTokenHash(tokenHash)) return failure;

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return failure;

  // Built from the validated relative path and this request's ORIGIN only. The incoming query string —
  // which still holds the token hash — is deliberately not carried over.
  return NextResponse.redirect(new URL(next, request.nextUrl.origin));
}
