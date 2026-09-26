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

export type RentalListingDetails = z.infer<typeof rentalListingDetailsSchema>;
