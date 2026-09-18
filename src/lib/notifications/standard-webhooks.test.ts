import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { WEBHOOK_TOLERANCE_SECONDS, decodeWebhookSecret, verifyStandardWebhook } from "./standard-webhooks";

const SECRET_BYTES = Buffer.from("a".repeat(32), "utf8");
const SECRET = `v1,whsec_${SECRET_BYTES.toString("base64")}`;
const NOW = 1_789_000_000;

function sign(payload: string, id = "msg_1", timestamp = String(NOW), key = SECRET_BYTES) {
  return createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`, "utf8").digest("base64");
}

const body = JSON.stringify({ user: { email: "a@b.example" }, email_data: { email_action_type: "magiclink" } });

const valid = () => ({
  payload: body,
  headers: { id: "msg_1", timestamp: String(NOW), signature: `v1,${sign(body)}` },
  secret: SECRET,
  nowSeconds: NOW,
});

describe("Standard Webhooks verification", () => {
  it("accepts a correctly signed request", () => {
    expect(verifyStandardWebhook(valid())).toEqual({ ok: true });
  });

  it("accepts the secret in every form the dashboard might show", () => {
    const raw = SECRET_BYTES.toString("base64");
    for (const secret of [SECRET, `whsec_${raw}`, raw]) {
      expect(verifyStandardWebhook({ ...valid(), secret }), secret.slice(0, 12)).toEqual({ ok: true });
    }
  });

  it("rejects a forged signature", () => {
    const forged = { ...valid(), headers: { ...valid().headers, signature: `v1,${sign(body, "msg_1", String(NOW), Buffer.from("wrong-key-wrong-key-wrong-key!!!"))}` } };
    expect(verifyStandardWebhook(forged)).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("rejects a signature computed over a DIFFERENT body", () => {
    // The decisive property: an attacker who captures one signed request must not be able to swap the
    // payload for another and keep the signature.
    const swapped = { ...valid(), payload: JSON.stringify({ user: { email: "attacker@evil.example" } }) };
    expect(verifyStandardWebhook(swapped)).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("binds the signature to the id and the timestamp, not just the body", () => {
    for (const headers of [
      { ...valid().headers, id: "msg_2" },
      { ...valid().headers, timestamp: String(NOW - 1) },
    ]) {
      expect(verifyStandardWebhook({ ...valid(), headers })).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
    }
  });

  it("rejects a replayed request once it is outside the tolerance", () => {
    const stale = NOW - WEBHOOK_TOLERANCE_SECONDS - 1;
    const replayed = {
      ...valid(),
      headers: { id: "msg_1", timestamp: String(stale), signature: `v1,${sign(body, "msg_1", String(stale))}` },
    };
    // Correctly signed, and still refused — which is the entire point of the timestamp.
    expect(verifyStandardWebhook(replayed)).toEqual({ ok: false, reason: "STALE_TIMESTAMP" });
  });

  it("rejects a post-dated request as well as a stale one", () => {
    // Only checking the past lets an attacker hold a captured request indefinitely by post-dating it.
    const future = NOW + WEBHOOK_TOLERANCE_SECONDS + 1;
    const postDated = {
      ...valid(),
      headers: { id: "msg_1", timestamp: String(future), signature: `v1,${sign(body, "msg_1", String(future))}` },
    };
    expect(verifyStandardWebhook(postDated)).toEqual({ ok: false, reason: "STALE_TIMESTAMP" });
  });

  it("accepts any entry in a multi-signature header, so secret rotation does not drop mail", () => {
    const old = createHmac("sha256", Buffer.from("old-key-old-key-old-key-old-key!")).update(`msg_1.${NOW}.${body}`).digest("base64");
    const rotated = { ...valid(), headers: { ...valid().headers, signature: `v1,${old} v1,${sign(body)}` } };
    expect(verifyStandardWebhook(rotated)).toEqual({ ok: true });
  });

  it("ignores signature entries of an unknown version", () => {
    const unknown = { ...valid(), headers: { ...valid().headers, signature: `v2,${sign(body)}` } };
    expect(verifyStandardWebhook(unknown)).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("refuses to verify anything when no usable secret is configured", () => {
    // Fail closed: an unset or placeholder secret must never mean "accept everything".
    for (const secret of [undefined, "", "   ", "whsec_replace_me", "whsec_" + Buffer.from("short").toString("base64")]) {
      expect(verifyStandardWebhook({ ...valid(), secret }), String(secret)).toEqual({ ok: false, reason: "NO_SECRET" });
    }
  });

  it("names the missing pieces rather than throwing on a malformed request", () => {
    expect(verifyStandardWebhook({ ...valid(), headers: { id: null, timestamp: String(NOW), signature: "v1,x" } }))
      .toEqual({ ok: false, reason: "MISSING_HEADERS" });
    expect(verifyStandardWebhook({ ...valid(), headers: { ...valid().headers, timestamp: "not-a-number" } }))
      .toEqual({ ok: false, reason: "MALFORMED_TIMESTAMP" });
  });

  it("decodes the secret without the prefix becoming key material", () => {
    expect(decodeWebhookSecret(SECRET)?.equals(SECRET_BYTES)).toBe(true);
    expect(decodeWebhookSecret("whsec_replace_me")).toBeNull();
  });
});
