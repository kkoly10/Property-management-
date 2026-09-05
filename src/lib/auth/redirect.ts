/**
 * A post-authentication redirect target that cannot leave this origin.
 *
 * `new URL(next, request.url)` does NOT constrain the result to the base origin: an absolute value
 * ("https://evil.example") is returned as-is, and a protocol-relative one ("//evil.example") resolves
 * to that host too. An unvalidated `next` on the auth callback is therefore an open redirect — it
 * lands a user who has just signed in on a site an attacker controls, which is exactly the moment
 * they are most likely to trust what they see.
 *
 * Only a single-slash relative path is accepted; everything else collapses to the caller's fallback.
 * The login action already applied this rule locally, and the callback route did not — so the rule
 * lives here once and both use it.
 */
export function safeRedirectPath(value: string | null | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  // "/\..." and "/%2F..." are rejected with everything else that is not a plain relative path: the
  // check is a positive one (must start with exactly one "/") rather than a blocklist of tricks.
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) return fallback;
  return trimmed;
}
