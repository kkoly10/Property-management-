import { describe, expect, it } from "vitest";
import { entityBookSchema, organizationSchema } from "@/lib/validation/onboarding";

describe("organizationSchema", () => {
  it("accepts the complete US workspace contract", () => {
    const result = organizationSchema.safeParse({
      displayName: "Northstar Property Group",
      slug: "northstar-property-group",
      customerPath: "property_manager",
      headquartersCountryCode: "US",
      defaultLocale: "en-US",
      defaultTimeZone: "America/New_York",
      acceptedTerms: "on",
      consentVersion: "operator_terms@0.1.0-draft+privacy_notice@0.1.0-draft#0123456789abcdef",
      idempotencyKey: "10000000-0000-4000-8000-000000000001",
    });
    expect(result.success).toBe(true);
  });

  it("refuses a submission that cannot name the documents it accepted", () => {
    // "If present, compare" is not a gate: a client that simply omits the field would slip past it.
    // Consent evidence that cannot name its artifacts is not evidence, so the field is REQUIRED.
    const base = {
      displayName: "Northstar Property Group",
      slug: "northstar-property-group",
      customerPath: "property_manager",
      headquartersCountryCode: "US",
      defaultLocale: "en-US",
      defaultTimeZone: "America/New_York",
      acceptedTerms: "on",
      idempotencyKey: "10000000-0000-4000-8000-000000000001",
    };
    expect(organizationSchema.safeParse(base).success, "a missing consent version was accepted").toBe(false);
    for (const bad of [
      "",
      "   ",
      "2026-07-20",
      "operator_terms@0.1.0-draft",
      "operator_terms@0.1.0-draft+privacy_notice@0.1.0-draft",
      "operator_terms@0.1.0-draft+privacy_notice@0.1.0-draft#short",
      "operator_terms@0.1.0-draft+privacy_notice@0.1.0-draft#NOTHEXADECIMAL0",
    ]) {
      expect(organizationSchema.safeParse({ ...base, consentVersion: bad }).success, `"${bad}" was accepted`).toBe(false);
    }
    expect(organizationSchema.safeParse({ ...base, consentVersion: "operator_terms@0.1.0-draft+privacy_notice@0.1.0-draft#0123456789abcdef" }).success).toBe(true);
  });

  it("rejects an unsafe workspace slug", () => {
    const result = organizationSchema.safeParse({
      displayName: "Northstar",
      slug: "Northstar / Admin",
      customerPath: "property_manager",
      headquartersCountryCode: "US",
      defaultLocale: "en-US",
      defaultTimeZone: "America/New_York",
      acceptedTerms: "on",
      consentVersion: "operator_terms@0.1.0-draft+privacy_notice@0.1.0-draft#0123456789abcdef",
      idempotencyKey: "10000000-0000-4000-8000-000000000001",
    });
    expect(result.success).toBe(false);
  });
});

describe("entityBookSchema", () => {
  it.each([
    ["US", "USD"],
    ["CA", "CAD"],
    ["MX", "MXN"],
  ])("accepts %s with %s", (countryCode, currencyCode) => {
    const result = entityBookSchema.safeParse({
      legalName: "Northstar LLC",
      displayName: "Northstar",
      countryCode,
      entityType: "company",
      currencyCode,
      bookName: "Operating book",
      idempotencyKey: "20000000-0000-4000-8000-000000000002",
    });
    expect(result.success).toBe(true);
  });

  it("blocks a country and currency mismatch", () => {
    const result = entityBookSchema.safeParse({
      legalName: "Northstar LLC",
      displayName: "Northstar",
      countryCode: "US",
      entityType: "company",
      currencyCode: "CAD",
      bookName: "Operating book",
      idempotencyKey: "20000000-0000-4000-8000-000000000002",
    });
    expect(result.success).toBe(false);
  });
});
