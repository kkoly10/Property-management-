import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Fail-closed authentication for every scheduled/internal worker entry point.
 *
 * Three rules, all of which must hold before a request is let through:
 *
 *   1. **A secret must actually be configured.** An unset or placeholder value authenticates NOTHING —
 *      it never degrades into "open". A worker route on an unconfigured deployment is closed, not public.
 *   2. **The credential travels in the Authorization header only.** A secret in a query string is
 *      written to every access log, proxy log and referrer along the way, so a request that carries one
 *      is rejected outright rather than quietly ignored: the credential must be treated as burned.
 *   3. **The comparison is constant-time.** Length is checked first because timingSafeEqual throws on a
 *      length mismatch, and length alone is not the secret.
 *
 * No service-role credential is ever read here. The worker's database authority comes from
 * SUPABASE_SECRET_KEY inside createAdminClient, server-side, and never reaches the browser.
 */
const MINIMUM_SECRET_LENGTH = 16;
const CREDENTIAL_QUERY_PARAMETERS = ["secret", "token", "key", "apikey", "api_key", "password", "cron_secret"];

export function isUsableSecret(value: string | undefined | null): value is string {
  return Boolean(value) && !value!.includes("replace_") && value!.length >= MINIMUM_SECRET_LENGTH;
}

/** True when the request tries to pass a credential through the URL, which we refuse to honor. */
export function carriesCredentialInUrl(url: string): boolean {
  let parameters: URLSearchParams;
  try {
    parameters = new URL(url, "https://placeholder.invalid").searchParams;
  } catch {
    return false;
  }
  return CREDENTIAL_QUERY_PARAMETERS.some((name) => parameters.has(name));
}

export function matchesSecret(presented: string | null, expected: string | undefined | null): boolean {
  if (!isUsableSecret(expected) || !presented) return false;
  const expectedBytes = Buffer.from(expected);
  const presentedBytes = Buffer.from(presented);
  if (expectedBytes.length !== presentedBytes.length) return false;
  return timingSafeEqual(expectedBytes, presentedBytes);
}

function presentedBearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/** Operator/manual worker surface: the dedicated internal worker secret. */
export function hasValidWorkerCredential(request: Request): boolean {
  if (carriesCredentialInUrl(request.url)) return false;
  return matchesSecret(presentedBearer(request), process.env.CRECY_INTERNAL_WORKER_SECRET);
}

/**
 * Scheduled surface. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; the internal worker secret
 * is also accepted so an operator can trigger the same job by hand, or run the schedule from their own
 * orchestrator, without provisioning a second credential.
 */
export function hasValidCronCredential(request: Request): boolean {
  if (carriesCredentialInUrl(request.url)) return false;
  const presented = presentedBearer(request);
  return matchesSecret(presented, process.env.CRON_SECRET) || matchesSecret(presented, process.env.CRECY_INTERNAL_WORKER_SECRET);
}
