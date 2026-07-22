import { describe, expect, it } from "vitest";
import { isAllowedApplicationUrl, stripeOnboardingLinkSchema } from "@/lib/validation/payment-connections";

const validRequest = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  operatingEntityId: "20000000-0000-4000-8000-000000000002",
  returnUrl: "https://app.crecy.example/settings/payments?stripe=return",
  refreshUrl: "https://app.crecy.example/settings/payments?stripe=refresh",
};

describe("stripeOnboardingLinkSchema", () => {
  it("accepts the exact command contract", () => {
    expect(stripeOnboardingLinkSchema.parse(validRequest)).toEqual(validRequest);
  });

  it("rejects provider account IDs supplied by a client", () => {
    expect(stripeOnboardingLinkSchema.safeParse({ ...validRequest, providerAccountId: "acct_forged" }).success).toBe(false);
  });
});

describe("isAllowedApplicationUrl", () => {
  it("allows paths on the configured application origin", () => {
    expect(isAllowedApplicationUrl(validRequest.returnUrl, "https://app.crecy.example")).toBe(true);
  });

  it("blocks open redirects and deceptive sibling domains", () => {
    expect(isAllowedApplicationUrl("https://evil.example/return", "https://app.crecy.example")).toBe(false);
    expect(isAllowedApplicationUrl("https://app.crecy.example.evil.test/return", "https://app.crecy.example")).toBe(false);
  });
});
