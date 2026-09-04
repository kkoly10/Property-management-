import { z } from "zod";

export const ownerEntityTypes = ["person", "company", "trust", "partnership", "other"] as const;

export const createOwnerEntitySchema = z.object({
  organizationId: z.uuid(),
  displayName: z.string().trim().min(1).max(160),
  entityType: z.enum(ownerEntityTypes),
  email: z.email().max(320).optional(),
  phoneE164: z.string().regex(/^\+[1-9][0-9]{7,14}$/, "Use E.164 format, e.g. +14045551234.").optional(),
});

export const createOwnershipInterestSchema = z.object({
  organizationId: z.uuid(),
  propertyId: z.uuid(),
  ownerEntityId: z.uuid(),
  // A fraction in (0, 1]. The UI collects a percentage and converts; the command stores the fraction.
  ownershipFraction: z.number().gt(0).max(1),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date, e.g. 2026-01-01."),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).superRefine((value, context) => {
  if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
    context.addIssue({ code: "custom", path: ["effectiveTo"], message: "The end date cannot be before the start date." });
  }
});

export type CreateOwnerEntityInput = z.infer<typeof createOwnerEntitySchema>;
export type CreateOwnershipInterestInput = z.infer<typeof createOwnershipInterestSchema>;
