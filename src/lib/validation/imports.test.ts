import { describe, expect, it } from "vitest";
import { commitImportSchema, createImportJobSchema, validateImportSchema } from "./imports";

describe("import command validation", () => {
  it("accepts the portfolio command and required mappings", () => {
    expect(createImportJobSchema.safeParse({ organizationId: "10000000-0000-4000-8000-000000000001", importType: "portfolio", sourceDocumentId: "20000000-0000-4000-8000-000000000002" }).success).toBe(true);
    expect(validateImportSchema.safeParse({ mapping: { propertyName:"Name",propertyType:"Type",addressLine1:"Address",countryCode:"Country",timeZone:"Time Zone" }, options: { dedupeMode:"strict",dateLocale:"en-US" } }).success).toBe(true);
  });

  it("rejects incomplete mapping and changed hash shapes", () => {
    expect(validateImportSchema.safeParse({ mapping: { propertyName:"Name" }, options: { dedupeMode:"strict",dateLocale:"en-US" } }).success).toBe(false);
    expect(commitImportSchema.safeParse({ expectedValidationHash: "short" }).success).toBe(false);
  });
});
