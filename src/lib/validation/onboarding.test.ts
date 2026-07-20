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
      idempotencyKey: "10000000-0000-4000-8000-000000000001",
    });
    expect(result.success).toBe(true);
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
