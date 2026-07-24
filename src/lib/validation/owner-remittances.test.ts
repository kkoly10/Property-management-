import { describe, expect, it } from "vitest";
import { recordOwnerRemittanceSchema } from "./owner-remittances";

const valid = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  ownerEntityId: "20000000-0000-4000-8000-000000000002",
  propertyId: "30000000-0000-4000-8000-000000000003",
  statementSnapshotId: "40000000-0000-4000-8000-000000000004",
  amountMinor: 72500,
  currencyCode: "USD",
  paidOn: "2026-06-30",
  externalReference: "ACH-0626-0148",
  evidenceDocumentId: "50000000-0000-4000-8000-000000000005",
};

describe("owner remittance validation", () => {
  it("accepts an external remittance with statement and evidence", () => {
    expect(recordOwnerRemittanceSchema.safeParse(valid).success).toBe(true);
    expect(recordOwnerRemittanceSchema.safeParse({
      ...valid,
      statementSnapshotId: null,
      externalReference: "",
    }).success).toBe(true);
  });

  it("rejects invalid money, currency, dates, and evidence", () => {
    expect(recordOwnerRemittanceSchema.safeParse({ ...valid, amountMinor: 0 }).success).toBe(false);
    expect(recordOwnerRemittanceSchema.safeParse({ ...valid, amountMinor: 12.5 }).success).toBe(false);
    expect(recordOwnerRemittanceSchema.safeParse({ ...valid, currencyCode: "usd" }).success).toBe(false);
    expect(recordOwnerRemittanceSchema.safeParse({ ...valid, paidOn: "2026-06-31" }).success).toBe(false);
    expect(recordOwnerRemittanceSchema.safeParse({ ...valid, evidenceDocumentId: "missing" }).success).toBe(false);
  });
});
