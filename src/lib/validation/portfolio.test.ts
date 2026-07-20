import { describe, expect, it } from "vitest";
import { propertySchema, unitSchema } from "@/lib/validation/portfolio";

const property = {
  accountingBookId: "10000000-0000-4000-8000-000000000001",
  name: "Maple Court",
  propertyType: "multifamily",
  addressLine1: "100 Maple Street",
  locality: "Richmond",
  subdivisionCode: "VA",
  postalCode: "23220",
  countryCode: "US",
  timeZone: "America/New_York",
  idempotencyKey: "20000000-0000-4000-8000-000000000002",
};

describe("propertySchema", () => {
  it("accepts a complete property command", () => expect(propertySchema.safeParse(property).success).toBe(true));
  it("rejects a missing street address", () => expect(propertySchema.safeParse({ ...property, addressLine1: "" }).success).toBe(false));
});

describe("unitSchema", () => {
  it("coerces optional numeric fields", () => {
    const result = unitSchema.safeParse({
      organizationId: "10000000-0000-4000-8000-000000000001",
      propertyId: "20000000-0000-4000-8000-000000000002",
      unitCode: "101",
      unitType: "Apartment",
      bedrooms: "2",
      bathrooms: "1.5",
      squareFeet: "850",
      idempotencyKey: "30000000-0000-4000-8000-000000000003",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.bathrooms).toBe(1.5);
  });

  it("rejects negative dimensions", () => {
    const result = unitSchema.safeParse({
      organizationId: "10000000-0000-4000-8000-000000000001",
      propertyId: "20000000-0000-4000-8000-000000000002",
      unitCode: "101",
      bedrooms: -1,
      idempotencyKey: "30000000-0000-4000-8000-000000000003",
    });
    expect(result.success).toBe(false);
  });
});
