import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Standard Webhooks signature verification, per https://standardwebhooks.com.
 *
 * Supabase signs its Send Email Auth Hook this way. The scheme is small enough that implementing it
 * here is safer than adding a dependency to the one code path that decides whether an unauthenticated
 * POST is allowed to send mail on our behalf — but small does not mean forgiving, so each rule below
 * is the spec's, not an approximation:
 *
 *   * Headers are `webhook-id`, `webhook-timestamp` (unix seconds) and `webhook-signature`.
 *   * The signed string is `id.timestamp.body`, delimited by full stops, over the RAW body — parse the
 *     JSON only after the signature verifies, because re-serializing changes the bytes and a verifier
 *     that checks a re-serialized body is not checking what was sent.
 *   * `webhook-signature` is a SPACE-DELIMITED list of `v1,<base64>` entries. A sender rotating a
 *     secret sends several; accepting the message if ANY entry matches is what makes rotation possible,
 *     and checking only the first would break mail delivery mid-rotation.
 *   * The secret is base64, carried with a `whsec_` prefix that is not part of the key material.
 *   * The timestamp is checked against a tolerance, or a captured request can be replayed forever.
 *   * Comparison is constant-time. A byte-by-byte early return leaks the expected signature.
 */
export type WebhookVerification =
  | { ok: true }
  | { ok: false; reason: "MISSING_HEADERS" | "MALFORMED_TIMESTAMP" | "STALE_TIMESTAMP" | "BAD_SIGNATURE" | "NO_SECRET" };

/** The spec's recommended replay window. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

/** Strips the `whsec_` prefix and decodes. The prefix identifies the secret; it is not key material. */
export function decodeWebhookSecret(secret: string): Buffer | null {
  const trimmed = secret.trim();
  if (!trimmed || trimmed.includes("replace_")) return null;
  // Supabase presents the value as `v1,whsec_<base64>` in its dashboard; accept either form so an
  // operator pasting exactly what they were shown is not debugging a signature failure.
  const withoutVersion = trimmed.replace(/^v\d+,/, "");
  const base64 = withoutVersion.startsWith("whsec_") ? withoutVersion.slice("whsec_".length) : withoutVersion;
  if (!base64) return null;
  const decoded = Buffer.from(base64, "base64");
  return decoded.length >= 16 ? decoded : null;
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // timingSafeEqual throws on a length mismatch, which would itself be a length oracle — compare a
  // fixed-size digest of each side instead so every path does the same work.
  const hash = (value: Buffer) => createHmac("sha256", "length-guard").update(value).digest();
  return timingSafeEqual(hash(left), hash(right));
}

export function verifyStandardWebhook(input: {
  /** The raw request body, exactly as received. */
  payload: string;
  headers: { id: string | null; timestamp: string | null; signature: string | null };
  secret: string | undefined | null;
  /** Injectable for tests; defaults to now. */
  nowSeconds?: number;
}): WebhookVerification {
  const key = input.secret ? decodeWebhookSecret(input.secret) : null;
  if (!key) return { ok: false, reason: "NO_SECRET" };

  const { id, timestamp, signature } = input.headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: "MISSING_HEADERS" };

  const sent = Number(timestamp);
  if (!Number.isFinite(sent) || !Number.isInteger(sent)) return { ok: false, reason: "MALFORMED_TIMESTAMP" };
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  // Both directions: a timestamp far in the FUTURE is as suspicious as a stale one, and only checking
  // the past lets an attacker hold a captured request indefinitely by post-dating it.
  if (Math.abs(now - sent) > WEBHOOK_TOLERANCE_SECONDS) return { ok: false, reason: "STALE_TIMESTAMP" };

  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${input.payload}`, "utf8").digest("base64");

  const presented = signature.split(" ").flatMap((entry) => {
    const [version, value] = entry.split(",");
    return version === "v1" && value ? [value] : [];
  });
  if (presented.length === 0) return { ok: false, reason: "BAD_SIGNATURE" };

  // Every candidate is compared, with no early exit, so the time taken does not depend on which one
  // matched or on how many were supplied.
  const matched = presented.reduce((found, candidate) => constantTimeEquals(candidate, expected) || found, false);
  return matched ? { ok: true } : { ok: false, reason: "BAD_SIGNATURE" };
}
