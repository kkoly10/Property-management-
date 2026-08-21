import { z } from "zod";

export const importTypes = ["portfolio", "leases", "combined"] as const;
export type ImportType = (typeof importTypes)[number];

export const createImportJobSchema = z.object({
  organizationId: z.uuid(),
  importType: z.enum(importTypes),
  sourceDocumentId: z.uuid(),
});

// Both import types require property identity + country; the per-type required set (unit/household/lease
// for the occupied-lease import, property type/time zone for portfolio) is enforced by the command RPC.
export const validateImportSchema = z.object({
  mapping: z.record(z.string(), z.string().trim().min(1)).refine((mapping) => ["propertyName", "addressLine1", "countryCode"].every((key) => mapping[key]), "Map the property name, address, and country columns."),
  options: z.object({ dedupeMode: z.enum(["strict", "review"]), dateLocale: z.string().trim().min(2).max(20) }),
});

export const commitImportSchema = z.object({ expectedValidationHash: z.string().regex(/^[0-9a-f]{64}$/) });
