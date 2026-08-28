import { describe, expect, it } from "vitest";
import { commitImportSchema, createImportJobSchema, validateImportSchema } from "./imports";

describe("import command validation", () => {
  it("accepts the portfolio command and required mappings", () => {
    expect(createImportJobSchema.safeParse({ organizationId: "10000000-0000-4000-8000-000000000001", importType: "portfolio", sourceDocumentId: "20000000-0000-4000-8000-000000000002" }).success).toBe(true);
    expect(validateImportSchema.safeParse({ mapping: { propertyName:"Name",propertyType:"Type",addressLine1:"Address",countryCode:"Country",timeZone:"Time Zone" }, options: { dedupeMode:"strict",dateLocale:"en-US" } }).success).toBe(true);
  });

  it("accepts the occupied-lease import type and its shared required mapping", () => {
    expect(createImportJobSchema.safeParse({ organizationId: "10000000-0000-4000-8000-000000000001", importType: "leases", sourceDocumentId: "20000000-0000-4000-8000-000000000002" }).success).toBe(true);
    expect(validateImportSchema.safeParse({ mapping: { propertyName:"Property",addressLine1:"Address",countryCode:"Country",unitCode:"Unit",primaryFirstName:"First",primaryLastName:"Last",leaseStartDate:"Start",rentAmountMinor:"Rent",rentFrequency:"Freq",currencyCode:"Currency" }, options: { dedupeMode:"strict",dateLocale:"en-US" } }).success).toBe(true);
  });

  it("rejects an unknown import type, incomplete mapping, and changed hash shapes", () => {
    // 'documents' is present in the import_jobs check constraint but has no command pair yet, so it
    // must not be accepted here. ('residents' and 'opening_balances' now ARE implemented.)
    expect(createImportJobSchema.safeParse({ organizationId: "10000000-0000-4000-8000-000000000001", importType: "documents", sourceDocumentId: "20000000-0000-4000-8000-000000000002" }).success).toBe(false);
    expect(createImportJobSchema.safeParse({ organizationId: "10000000-0000-4000-8000-000000000001", importType: "residents", sourceDocumentId: "20000000-0000-4000-8000-000000000002" }).success).toBe(true);
    expect(createImportJobSchema.safeParse({ organizationId: "10000000-0000-4000-8000-000000000001", importType: "opening_balances", sourceDocumentId: "20000000-0000-4000-8000-000000000002" }).success).toBe(true);
    expect(validateImportSchema.safeParse({ mapping: { propertyName:"Name" }, options: { dedupeMode:"strict",dateLocale:"en-US" } }).success).toBe(false);
    expect(commitImportSchema.safeParse({ expectedValidationHash: "short" }).success).toBe(false);
  });
});
