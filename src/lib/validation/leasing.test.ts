import { describe, expect, it } from "vitest";
import { activateExistingLeaseSchema } from "@/lib/validation/leasing";

const validRequest = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  propertyId: "20000000-0000-4000-8000-000000000002",
  unitId: "30000000-0000-4000-8000-000000000003",
  household: { displayName: "Rivera household", members: [{ firstName: "Jordan", lastName: "Rivera", email: "jordan@example.com", phoneE164: "+12025550110", primaryContact: true, financiallyResponsible: true }] },
  lease: { source: "operator_supplied" as const, startDate: "2026-01-01", endDate: "2026-12-31", rentAmountMinor: 185000, currencyCode: "USD" as const, rentFrequency: "monthly" as const, signedDocumentId: "40000000-0000-4000-8000-000000000004" },
  openingBalanceMinor: 42500,
  firstChargeDueDate: "2026-08-01",
};

describe("activateExistingLeaseSchema", () => {
  it("accepts a complete existing-lease request", () => {
    expect(activateExistingLeaseSchema.safeParse(validRequest).success).toBe(true);
  });

  it("requires exactly one primary contact", () => {
    const request = { ...validRequest, household: { ...validRequest.household, members: [{ ...validRequest.household.members[0], primaryContact: false }] } };
    expect(activateExistingLeaseSchema.safeParse(request).success).toBe(false);
  });

  it("rejects duplicate household emails and dates outside the lease", () => {
    const request = {
      ...validRequest,
      firstChargeDueDate: "2027-01-01",
      household: { ...validRequest.household, members: [validRequest.household.members[0], { ...validRequest.household.members[0], firstName: "Taylor", primaryContact: false }] },
    };
    const result = activateExistingLeaseSchema.safeParse(request);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.length).toBeGreaterThanOrEqual(2);
  });
});
