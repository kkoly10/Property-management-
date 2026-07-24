import { describe, expect, it } from "vitest";
import {
  cancelPrivacyRequestSchema,
  submitPrivacyRequestSchema,
  verifyPrivacyRequestSchema,
} from "@/lib/validation/privacy";

const organizationId = "10000000-0000-4000-8000-000000000001";

describe("privacy request validation", () => {
  it("accepts an organization-routed deletion request", () => {
    const parsed = submitPrivacyRequestSchema.parse({
      organizationId,
      requestType: "deletion",
      jurisdictionCode: "us-va",
    });
    expect(parsed.jurisdictionCode).toBe("US-VA");
  });

  it("accepts a platform request without a jurisdiction", () => {
    const parsed = submitPrivacyRequestSchema.parse({
      organizationId: null,
      requestType: "export",
      jurisdictionCode: "",
    });
    expect(parsed.jurisdictionCode).toBeNull();
  });

  it("rejects unsupported request types, jurisdictions, and versions", () => {
    expect(submitPrivacyRequestSchema.safeParse({
      organizationId,
      requestType: "unsubscribe",
      jurisdictionCode: "US-virginia!",
    }).success).toBe(false);
    expect(verifyPrivacyRequestSchema.safeParse({ expectedVersion: 0 }).success).toBe(false);
    expect(cancelPrivacyRequestSchema.safeParse({ expectedVersion: 1, reason: "x".repeat(501) }).success).toBe(false);
  });
});
