import "server-only";

/**
 * Secure-link helpers for off-portal document delivery.
 *
 * The database mints the token inside deliver_document and persists only its SHA-256 hash, mirroring
 * the invitation precedent (public.staff_invitations.token_hash): a database read can never mint a
 * working link. The plaintext token travels in the command response (to the operator) and in the
 * in-flight notification job (so the worker can build the URL), and is scrubbed from that job the
 * moment it terminates. Redemption passes the plaintext token to the database, which hashes it
 * internally — so the stored hash is not itself a credential for the anon-callable redeem command.
 */
export function secureLinkPath(rawToken: string): string {
  return `/documents/secure/${encodeURIComponent(rawToken)}`;
}

/**
 * Absolute URL for the link, or null when no canonical origin is configured.
 *
 * Null rather than a relative path on purpose: this URL's only destination is an email body, where a
 * bare "/documents/secure/..." is a dead link. Callers fall back to the portal wording instead of
 * sending something that cannot be clicked.
 */
export function secureLinkUrl(rawToken: string): string | null {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured || configured.includes("replace_me")) return null;
  const origin = configured.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(origin)) return null;
  return `${origin}${secureLinkPath(rawToken)}`;
}
