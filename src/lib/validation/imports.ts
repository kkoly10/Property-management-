import { z } from "zod";

export const createImportJobSchema = z.object({
  organizationId: z.uuid(),
  importType: z.literal("portfolio"),
  sourceDocumentId: z.uuid(),
});

export const validateImportSchema = z.object({
  mapping: z.record(z.string(), z.string().trim().min(1)).refine((mapping) => ["propertyName", "propertyType", "addressLine1", "countryCode", "timeZone"].every((key) => mapping[key]), "Required columns are not mapped."),
  options: z.object({ dedupeMode: z.enum(["strict", "review"]), dateLocale: z.string().trim().min(2).max(20) }),
});

export const commitImportSchema = z.object({ expectedValidationHash: z.string().regex(/^[0-9a-f]{64}$/) });
