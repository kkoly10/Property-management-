import { describe, expect, it } from "vitest";
import { finalizeOwnerStatementSchema, ownerStatementDraftSchema } from "./owner-statements";

const valid = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  accountingBookId: "20000000-0000-4000-8000-000000000002",
  ownerEntityId: "30000000-0000-4000-8000-000000000003",
  propertyId: "40000000-0000-4000-8000-000000000004",
  periodStart: "2026-06-01",
  periodEnd: "2026-06-30",
};

describe("owner statement validation", () => {
  it("accepts a bounded statement period and calculation hash", () => {
    expect(ownerStatementDraftSchema.safeParse(valid).success).toBe(true);
    expect(finalizeOwnerStatementSchema.safeParse({
      ...valid,
      expectedCalculationHash: "a".repeat(64),
    }).success).toBe(true);
  });

  it("rejects inverted or excessively long periods", () => {
    expect(ownerStatementDraftSchema.safeParse({ ...valid, periodStart: "2026-07-01", periodEnd: "2026-06-30" }).success).toBe(false);
    expect(ownerStatementDraftSchema.safeParse({ ...valid, periodStart: "2025-01-01", periodEnd: "2026-06-30" }).success).toBe(false);
    expect(ownerStatementDraftSchema.safeParse({ ...valid, periodEnd: "2026-06-31" }).success).toBe(false);
  });

  it("requires a canonical hash and validates correction reasons", () => {
    expect(finalizeOwnerStatementSchema.safeParse({ ...valid, expectedCalculationHash: "draft" }).success).toBe(false);
    expect(finalizeOwnerStatementSchema.safeParse({ ...valid, expectedCalculationHash: "a".repeat(64), correctionReason: "x" }).success).toBe(false);
  });
});
