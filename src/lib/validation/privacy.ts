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
