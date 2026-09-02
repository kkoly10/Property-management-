import { beforeEach, describe, expect, it, vi } from "vitest";
import { isAllowedApplicationUrl, isAllowedResidentReturnUrl, stripeOnboardingLinkSchema } from "@/lib/validation/payment-connections";

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

describe("resident Stripe return URLs", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_MARKETING_ORIGIN", "https://crecyos.com");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.crecyos.com");
    vi.stubEnv("NEXT_PUBLIC_LIVING_ROOT_DOMAIN", "crecyliving.com");
  });

  it("accepts a return to the exact Living origin the payment began on", () => {
    expect(isAllowedResidentReturnUrl("https://lakewood.crecyliving.com/payments?stripe=return", "lakewood.crecyliving.com")).toBe(true);
    expect(isAllowedResidentReturnUrl("https://crecyliving.com/payments?stripe=return", "crecyliving.com")).toBe(true);
  });

  it("rejects a return into the operator or owner application", () => {
    // The defect this replaced: NEXT_PUBLIC_SITE_URL means app.crecyos.com, so validating against it
    // sent residents into Crecy OS.
    expect(isAllowedResidentReturnUrl("https://app.crecyos.com/payments", "lakewood.crecyliving.com")).toBe(false);
    expect(isAllowedResidentReturnUrl("https://owner.crecyos.com/owner", "lakewood.crecyliving.com")).toBe(false);
    expect(isAllowedResidentReturnUrl("https://crecyos.com/pricing", "crecyliving.com")).toBe(false);
  });

  it("rejects a return to a DIFFERENT Living community", () => {
    // *.crecyliving.com is not an acceptable wildcard: the return target is browser-supplied.
    expect(isAllowedResidentReturnUrl("https://park-view.crecyliving.com/payments", "lakewood.crecyliving.com")).toBe(false);
    expect(isAllowedResidentReturnUrl("https://lakewood.crecyliving.com/payments", "crecyliving.com")).toBe(false);
  });

  it("rejects malformed, external and non-https production origins", () => {
    expect(isAllowedResidentReturnUrl("not-a-url", "lakewood.crecyliving.com")).toBe(false);
    expect(isAllowedResidentReturnUrl("https://evil.example.com/payments", "lakewood.crecyliving.com")).toBe(false);
    expect(isAllowedResidentReturnUrl("http://lakewood.crecyliving.com/payments", "lakewood.crecyliving.com")).toBe(false);
  });

  it("refuses to consider a return URL when the request host is not a Living surface", () => {
    // Checked before the candidate is parsed: an operator host cannot start a resident Checkout.
    expect(isAllowedResidentReturnUrl("https://app.crecyos.com/payments", "app.crecyos.com")).toBe(false);
    expect(isAllowedResidentReturnUrl("https://evil.example.com/x", "evil.example.com")).toBe(false);
  });

  it("supports localhost and preview hosts for development and Playwright", () => {
    expect(isAllowedResidentReturnUrl("http://localhost:3000/payments", "localhost:3000")).toBe(true);
    expect(isAllowedResidentReturnUrl("https://app.crecyos.com/payments", "localhost:3000")).toBe(false);
  });
});
