import { describe, expect, it } from "vitest";
import { rentalListingDetailsSchema, rentalListingStatusSchema, saveRentalListingSchema } from "./rental-listing";

const id = "10000000-0000-4000-8000-000000000001";
const details = {
  title: "Basement apartment",
  summary: "Private basement apartment with its own entrance and driveway parking.",
  rentAmountMinor: 135000,
  availableOn: "2026-10-01",
  leaseTermText: "12-month lease preferred",
  petsText: "Ask about pets",
  utilitiesText: "Water included",
  parkingText: "One driveway space",
  visibility: "unlisted" as const,
  photos: [{ documentVersionId: id, altText: "Private entrance" }],
};

describe("shared rental listing validation", () => {
  it("accepts only the unlisted/shareable visibility in this release", () => {
    expect(rentalListingDetailsSchema.safeParse(details).success).toBe(true);
    expect(rentalListingDetailsSchema.safeParse({ ...details, visibility: "discoverable" }).success).toBe(false);
  });
  it("bounds exact minor-unit rent and photo metadata", () => {
    expect(rentalListingDetailsSchema.safeParse({ ...details, rentAmountMinor: 135000.5 }).success).toBe(false);
    expect(rentalListingDetailsSchema.safeParse({ ...details, rentAmountMinor: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false);
    expect(rentalListingDetailsSchema.safeParse({ ...details, photos: [{ ...details.photos[0], altText: "x".repeat(241) }] }).success).toBe(false);
  });
  it("requires explicit versioning and scoped ids for saves and status changes", () => {
    expect(saveRentalListingSchema.safeParse({ organizationId: id, unitId: id, expectedVersion: 0, details }).success).toBe(true);
    expect(saveRentalListingSchema.safeParse({ organizationId: id, unitId: id, expectedVersion: -1, details }).success).toBe(false);
    expect(rentalListingStatusSchema.safeParse({ organizationId: id, listingId: id, expectedVersion: 1, status: "published" }).success).toBe(true);
    expect(rentalListingStatusSchema.safeParse({ organizationId: id, listingId: id, expectedVersion: 1, status: "discoverable" }).success).toBe(false);
  });
});
