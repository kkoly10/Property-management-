import { z } from "zod";

export const rentalListingPhotoSchema = z.object({
  documentVersionId: z.uuid(),
  altText: z.string().trim().max(240),
}).strict();

export const rentalListingDetailsSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().max(3000),
  rentAmountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  availableOn: z.iso.date(),
  leaseTermText: z.string().max(500),
  petsText: z.string().max(500),
  utilitiesText: z.string().max(1000),
  parkingText: z.string().max(1000),
  visibility: z.literal("unlisted"),
  photos: z.array(rentalListingPhotoSchema).max(20),
}).strict();

export const saveRentalListingSchema = z.object({
  organizationId: z.uuid(),
  unitId: z.uuid(),
  expectedVersion: z.number().int().min(0),
  details: rentalListingDetailsSchema,
}).strict();

export const rentalListingStatusSchema = z.object({
  organizationId: z.uuid(),
  listingId: z.uuid(),
  expectedVersion: z.number().int().min(1),
  status: z.enum(["published", "paused", "closed"]),
}).strict();

export const rotateRentalListingSchema = z.object({
  organizationId: z.uuid(),
  listingId: z.uuid(),
  expectedVersion: z.number().int().min(1),
}).strict();

export const rentalListingVisibilitySchema = z.object({
  organizationId: z.uuid(),
  listingId: z.uuid(),
  expectedVersion: z.number().int().min(1),
  visibility: z.enum(["unlisted", "discoverable"]),
}).strict();

export const rentalDiscoverySearchSchema = z.object({
  country: z.enum(["US", "CA", "MX"]).optional(),
  subdivision: z.string().trim().min(1).max(100).optional(),
  locality: z.string().trim().min(1).max(200).optional(),
  minRentMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  maxRentMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  minBedrooms: z.number().min(0).max(100).optional(),
  unitType: z.string().trim().min(1).max(100).optional(),
  availableBy: z.iso.date().optional(),
  afterDiscoveredAt: z.iso.datetime({ offset: true }).optional(),
  afterId: z.uuid().optional(),
  limit: z.number().int().min(1).max(24).default(12),
}).strict().superRefine((value, context) => {
  if (value.minRentMinor !== undefined && value.maxRentMinor !== undefined
    && value.minRentMinor > value.maxRentMinor) {
    context.addIssue({ code: "custom", path: ["maxRentMinor"], message: "Maximum rent must be at least minimum rent." });
  }
  if ((value.afterDiscoveredAt === undefined) !== (value.afterId === undefined)) {
    context.addIssue({ code: "custom", path: ["afterId"], message: "Discovery cursor is incomplete." });
  }
});

export type RentalListingDetails = z.infer<typeof rentalListingDetailsSchema>;
export type RentalDiscoverySearch = z.infer<typeof rentalDiscoverySearchSchema>;
