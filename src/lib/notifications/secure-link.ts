import "server-only";
import { createHash } from "node:crypto";

/**
 * Secure-link helpers for off-portal document delivery.
 *
 * The database mints the token inside deliver_document and persists only its SHA-256 hash, mirroring
 * the invitation precedent (public.staff_invitations.token_hash): a database read can never mint a
 * working link. The plaintext token travels in the command response (to the operator) and in the
 * in-flight notification job (so the worker can build the URL), and is scrubbed from that job the
 * moment it terminates. Redemption hashes the token from the URL and matches on the hash.
 */
export function hashSecureLinkToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function secureLinkPath(rawToken: string): string {
  return `/documents/secure/${encodeURIComponent(rawToken)}`;
}

export function secureLinkUrl(rawToken: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const origin = !configured || configured.includes("replace_me") ? "" : configured.replace(/\/+$/, "");
  return `${origin}${secureLinkPath(rawToken)}`;
}
