import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPlausibleTokenHash } from "@/lib/auth/invitation-link";
import { isPasswordRecoveryProof, passwordRecoveryCookieOptions, PASSWORD_RECOVERY_COOKIES, PASSWORD_RECOVERY_TTL_SECONDS } from "@/lib/auth/password-recovery";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { classifyHost } from "@/lib/runtime/host";

/**
 * Token-hash confirmation for Crecy-rendered authentication email.
 *
 * ── Why this exists next to /auth/callback rather than replacing it ──────────────────────────────
 *
 * `/auth/callback` handles the PKCE `?code=` exchange for flows Supabase itself redirects through.
 * Those exchanges require the originating browser's verifier cookie.
 *
 * Crecy-rendered access mail — invitations, login magic links, signup confirmation and the future Send
 * Email Auth Hook — carries a `token_hash` instead. It points at this route, which redeems the hash
 * directly with `verifyOtp`, so the email can be opened safely in a different browser context. Both
 * routes remain because they redeem different credential types.
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
function privateRedirect(destination: URL) {
  return NextResponse.redirect(destination, {
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"), "/");

  // A failure must not say WHICH check failed: "bad type" and "bad token" are different answers to
  // someone probing the endpoint. One destination for every rejection.
  const failure = privateRedirect(new URL("/login?auth_error=1", request.url));

  if (!isEmailOtpType(type) || !isPlausibleTokenHash(tokenHash)) return failure;
  if (type === "recovery") {
    const host = classifyHost(request.nextUrl.host);
    const proof = request.nextUrl.searchParams.get("recovery_proof");
    if (host.kind === "unknown" || host.kind === "vendor" || host.kind === "marketing"
      || !proof || !isPasswordRecoveryProof(tokenHash, proof)) return failure;

    // Mail previews may follow GET links. Stage the capability on this origin and let the user
    // redeem it only when submitting a new password. The flow ID stops a second link silently
    // changing which account an already-open reset form will update.
    const secure = host.kind !== "development" || request.nextUrl.protocol === "https:";
    const response = privateRedirect(new URL("/reset-password", request.nextUrl.origin));
    const cookieName = PASSWORD_RECOVERY_COOKIES[secure ? 0 : 1];
    response.cookies.set(cookieName, `${crypto.randomUUID()}.${tokenHash}.${proof}`, {
      ...passwordRecoveryCookieOptions(cookieName), maxAge: PASSWORD_RECOVERY_TTL_SECONDS,
    });
    return response;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return failure;

  // Built from the validated relative path and this request's ORIGIN only. The incoming query string —
  // which still holds the token hash — is deliberately not carried over.
  return privateRedirect(new URL(next, request.nextUrl.origin));
}
