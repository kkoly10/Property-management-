import { z } from "zod";

export const privacyRequestTypes = [
  "access",
  "correction",
  "deletion",
  "export",
  "restriction",
  "objection",
  "withdraw_consent",
  "appeal",
] as const;

const jurisdictionCode = z.string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}(?:-[A-Z0-9]{1,8})?$/, "Use a country or subdivision code such as US, US-VA, or CA-ON.");

export const submitPrivacyRequestSchema = z.object({
  organizationId: z.uuid().nullable(),
  requestType: z.enum(privacyRequestTypes),
  jurisdictionCode: z.union([jurisdictionCode, z.literal("")]).nullable().optional()
    .transform((value) => value || null),
});

export const verifyPrivacyRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export const cancelPrivacyRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().max(500).nullable().optional().transform((value) => value || null),
});

export const recordPrivacyOutcomeSchema = z.object({
  expectedVersion: z.number().int().positive(),
  outcome: z.enum(["fulfilled", "partially_fulfilled", "denied"]),
  requesterMessage: z.string().trim().min(1, "Enter an explanation for the requester.").max(500),
  reviewReference: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/, "Enter an internal reference using 3 to 80 letters, numbers, or simple separators."),
});
