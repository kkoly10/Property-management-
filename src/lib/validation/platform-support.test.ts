import { describe, expect, it } from "vitest";
import { endSupportSessionSchema, startSupportSessionSchema } from "./platform-support";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("startSupportSessionSchema", () => {
  it("accepts a valid, reasoned, time-boxed request", () => {
    const result = startSupportSessionSchema.safeParse({ organizationId: uuid, reason: "Investigating a reported billing discrepancy.", ttlMinutes: 60, idempotencyKey: uuid });
    expect(result.success).toBe(true);
  });
  it("rejects a reason shorter than 8 characters", () => {
    expect(startSupportSessionSchema.safeParse({ organizationId: uuid, reason: "short", ttlMinutes: 60, idempotencyKey: uuid }).success).toBe(false);
  });
  it("rejects a TTL outside 5–240 minutes", () => {
    expect(startSupportSessionSchema.safeParse({ organizationId: uuid, reason: "A valid support reason.", ttlMinutes: 1, idempotencyKey: uuid }).success).toBe(false);
    expect(startSupportSessionSchema.safeParse({ organizationId: uuid, reason: "A valid support reason.", ttlMinutes: 999, idempotencyKey: uuid }).success).toBe(false);
  });
  it("rejects a non-uuid organization id", () => {
    expect(startSupportSessionSchema.safeParse({ organizationId: "not-a-uuid", reason: "A valid support reason.", ttlMinutes: 60, idempotencyKey: uuid }).success).toBe(false);
  });
});

describe("endSupportSessionSchema", () => {
  it("accepts ended and revoked dispositions", () => {
    expect(endSupportSessionSchema.safeParse({ organizationId: uuid, disposition: "ended", idempotencyKey: uuid }).success).toBe(true);
    expect(endSupportSessionSchema.safeParse({ organizationId: uuid, disposition: "revoked", idempotencyKey: uuid }).success).toBe(true);
  });
  it("rejects an unknown disposition", () => {
    expect(endSupportSessionSchema.safeParse({ organizationId: uuid, disposition: "deleted", idempotencyKey: uuid }).success).toBe(false);
  });
});
