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

export function secureLinkUrl(rawToken: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const origin = !configured || configured.includes("replace_me") ? "" : configured.replace(/\/+$/, "");
  return `${origin}${secureLinkPath(rawToken)}`;
}
