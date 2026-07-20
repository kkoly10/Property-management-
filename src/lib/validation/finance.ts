import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid ISO date.");

export const generateRecurringChargesSchema = z.object({
  runDate: isoDate,
  scheduleIds: z.array(z.uuid()).max(500).optional(),
  workerRunId: z.string().trim().min(8).max(200),
});

const manualPaymentAllocationSchema = z.object({
  chargeId: z.uuid(),
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export const recordManualPaymentSchema = z.object({
  organizationId: z.uuid(),
  tenancyId: z.uuid(),
  source: z.enum(["cash", "external_bank_transfer", "check", "other_manual"]),
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currencyCode: z.enum(["USD", "CAD", "MXN"]),
  receivedAt: z.iso.datetime({ offset: true }),
  reason: z.string().trim().min(3).max(1000),
  evidenceDocumentId: z.uuid().optional(),
  externalReference: z.string().trim().max(160).optional(),
  allocations: z.array(manualPaymentAllocationSchema).min(1).max(100),
}).superRefine((payment, context) => {
  if (new Set(payment.allocations.map(({ chargeId }) => chargeId)).size !== payment.allocations.length) {
    context.addIssue({ code: "custom", path: ["allocations"], message: "Allocate to each charge only once." });
  }
  if (payment.allocations.reduce((total, allocation) => total + allocation.amountMinor, 0) !== payment.amountMinor) {
    context.addIssue({ code: "custom", path: ["allocations"], message: "Allocations must equal the payment amount." });
  }
});

export type GenerateRecurringChargesInput = z.infer<typeof generateRecurringChargesSchema>;
export type RecordManualPaymentInput = z.infer<typeof recordManualPaymentSchema>;
