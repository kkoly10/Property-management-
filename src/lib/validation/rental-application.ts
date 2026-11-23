import { z } from "zod";
import { rentalInquiryLocales } from "@/lib/validation/rental-inquiry";

// Dates are checked again against the property's local day and listing availability in the RPC.
export const rentalApplicationDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });

export const submitRentalApplicationSchema = z.object({
  publicId: z.uuid(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().pipe(z.email().max(320)),
  desiredMoveInOn: rentalApplicationDateSchema,
  leaseTermText: z.string().trim().max(300).default(""),
  applicantNote: z.string().trim().max(2000).default(""),
  locale: z.enum(rentalInquiryLocales).default("en-US"),
  requirementsVersion: z.uuid().optional(),
}).strict();

export const verifyRentalApplicationSchema = z.object({
  token: z.string().trim().toLowerCase().regex(/^[0-9a-f]{64}$/),
}).strict();

export const recoverRentalApplicationSchema = z.object({
  reference: z.string().trim().toUpperCase().regex(/^APP-[0-9A-F]{12}$/),
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
}).strict();

export const closeRentalApplicationSchema = z.object({
  organizationId: z.uuid(),
  applicationId: z.uuid(),
  expectedVersion: z.number().int().min(1),
}).strict();

export const prepareRentalApplicationLeaseSchema = closeRentalApplicationSchema;

const rentalApplicationProgressReceipt = z.object({
  applicationReference: z.string().regex(/^APP-[0-9A-F]{12}$/),
  listingTitle: z.string(),
});

export const rentalApplicationProgressSchema = z.discriminatedUnion("status", [
  rentalApplicationProgressReceipt.extend({
    status: z.enum(["evidence_pending", "submitted", "changes_requested", "selected", "lease_preparation"]),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    desiredMoveInOn: rentalApplicationDateSchema,
    leaseTermText: z.string().nullable(),
    applicantNote: z.string().nullable(),
    rentAmountMinor: z.number().int().nonnegative(),
    currencyCode: z.enum(["USD", "CAD", "MXN"]),
    version: z.number().int().positive(),
    evidenceAvailable: z.boolean(),
  }),
  rentalApplicationProgressReceipt.extend({ status: z.enum(["closed", "declined"]) }),
]);
export type RentalApplicationProgress = z.infer<typeof rentalApplicationProgressSchema>;
