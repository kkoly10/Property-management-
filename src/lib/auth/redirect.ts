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
  // Use the URL parser too. It can turn a path such as slash-tab-slash into a network location
  // when the browser resolves it.
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) return fallback;
  const origin = "https://crecy.invalid";
  try {
    return new URL(trimmed, origin).origin === origin ? trimmed : fallback;
  } catch {
    return fallback;
  }
}
