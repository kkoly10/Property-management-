import { describe, expect, it } from "vitest";
import {
  confirmRentalTourSchema,
  submitRentalTourSchema,
  verifyRentalTourSchema,
} from "./rental-tour";

const base = {
  publicId: "81000000-0000-4000-8000-000000000081",
  firstName: "Jamie",
  lastName: "Visitor",
  email: "jamie@example.com",
  preferences: ["2026-10-20T18:00"],
  locale: "en-US" as const,
};

describe("rental tour validation", () => {
  it("accepts one to three distinct local tour times", () => {
    expect(submitRentalTourSchema.safeParse(base).success).toBe(true);
    expect(submitRentalTourSchema.safeParse({
      ...base, preferences: ["2026-10-20T18:00", "2026-10-21T10:30", "2026-10-22T14:00"],
    }).success).toBe(true);
  });

  it("rejects duplicates, malformed tokens and invalid confirmation positions", () => {
    expect(submitRentalTourSchema.safeParse({
      ...base, preferences: ["2026-10-20T18:00", "2026-10-20T18:00"],
    }).success).toBe(false);
    expect(verifyRentalTourSchema.safeParse({ token: "nope" }).success).toBe(false);
    expect(confirmRentalTourSchema.safeParse({
      organizationId: base.publicId, tourRequestId: base.publicId,
      expectedVersion: 2, preferencePosition: 3, meetingLocation: "123 Main Street",
    }).success).toBe(false);
    expect(confirmRentalTourSchema.safeParse({
      organizationId: base.publicId, tourRequestId: base.publicId,
      expectedVersion: 2, preferencePosition: 0, meetingLocation: "",
    }).success).toBe(false);
  });
});
