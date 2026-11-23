import { z } from "zod";

export const applicationEvidenceTypes = ["credit_evidence", "identity", "income_evidence"] as const;
export type ApplicationEvidenceType = (typeof applicationEvidenceTypes)[number];
export const applicationEvidenceLabels: Record<ApplicationEvidenceType, string> = {
  credit_evidence: "Applicant-provided credit information",
  identity: "Government-issued ID",
  income_evidence: "Paystubs or other proof of income",
};
export const LISTING_CRITERIA_MAX_LENGTH = 1600;
export const LISTING_ALTERNATIVES_MAX_LENGTH = 800;

const applicationRequirementsFields = z.object({
  criteriaText: z.string().trim().max(LISTING_CRITERIA_MAX_LENGTH),
  requiredDocumentTypes: z.array(z.enum(applicationEvidenceTypes)).max(applicationEvidenceTypes.length)
    .refine((value) => new Set(value).size === value.length, "Select each evidence type only once."),
  acceptedAlternatives: z.string().trim().max(LISTING_ALTERNATIVES_MAX_LENGTH),
}).strict();

function hasApplicationRequirements(value: z.infer<typeof applicationRequirementsFields>) {
  return Boolean(value.criteriaText || value.requiredDocumentTypes.length || value.acceptedAlternatives);
}

export const applicationRequirementsInputSchema = applicationRequirementsFields
  .refine(hasApplicationRequirements, "Enter criteria, select evidence or describe alternatives.");
export const applicationRequirementsSnapshotSchema = applicationRequirementsFields
  .extend({ requirementsVersion: z.uuid() })
  .refine(hasApplicationRequirements, "Application requirements are empty.");
export type ApplicationRequirementsInput = z.infer<typeof applicationRequirementsInputSchema>;
export type ApplicationRequirementsSnapshot = z.infer<typeof applicationRequirementsSnapshotSchema>;

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
  applicationRequirements: applicationRequirementsInputSchema.nullable().optional(),
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
