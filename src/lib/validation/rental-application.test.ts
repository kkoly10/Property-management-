import { describe, expect, it } from "vitest";
import {
  closeRentalApplicationSchema,
  prepareRentalApplicationLeaseSchema,
  rentalApplicationDateSchema,
  submitRentalApplicationSchema,
  verifyRentalApplicationSchema,
} from "./rental-application";
const id = "81000000-0000-4000-8000-000000000081";
const sample = {
  publicId: id, firstName: "Jamie", lastName: "Renter",
  desiredMoveInOn: "2026-12-10",
  leaseTermText: "", applicantNote: "", locale: "en-US",
};
describe("rental application validation", () => {
  it("normalizes harmless email whitespace before storing an application", () => {
    const parsed = submitRentalApplicationSchema.safeParse({
      ...sample, email: "  applicant@example.test  ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("applicant@example.test");
    expect(submitRentalApplicationSchema.safeParse({
      ...sample, email: "applicant@ example.test",
    }).success).toBe(false);
    expect(submitRentalApplicationSchema.safeParse({
      ...sample, email: "applicant@example.test", income: 90000,
    }).success).toBe(false);
  });

  it("rejects invalid rollover dates", () => {
    for (const value of ["2026-02-30", "2026-13-01", "2026-00-15", "invalid", "2026-10-8"]) {
      expect(rentalApplicationDateSchema.safeParse(value).success).toBe(false);
    }
    expect(rentalApplicationDateSchema.safeParse("2028-02-29").success).toBe(true);
  });
  it("rejects missing contact information, unsafe fields, and malformed credentials", () => {
    expect(submitRentalApplicationSchema.safeParse(sample).success).toBe(false);
    expect(verifyRentalApplicationSchema.safeParse({ token: "not-an-access-token" }).success).toBe(false);
    expect(verifyRentalApplicationSchema.safeParse({ token: "a".repeat(64), extra: "leak" }).success).toBe(false);
    expect(closeRentalApplicationSchema.safeParse({
      organizationId: id, applicationId: id, expectedVersion: 0,
    }).success).toBe(false);
    expect(prepareRentalApplicationLeaseSchema.safeParse({
      organizationId: id, applicationId: id, expectedVersion: 2, unauthorizedField: true,
    }).success).toBe(false);
  });
});
