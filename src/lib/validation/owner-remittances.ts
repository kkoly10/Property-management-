import { z } from "zod";

const isoDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a paid date in YYYY-MM-DD format.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a valid paid date.");

export const recordOwnerRemittanceSchema = z.object({
  organizationId: z.uuid(),
  ownerEntityId: z.uuid(),
  propertyId: z.uuid(),
  statementSnapshotId: z.uuid().nullable().optional(),
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currencyCode: z.string().regex(/^[A-Z]{3}$/, "Choose a valid currency."),
  paidOn: isoDate,
  externalReference: z.string().trim().max(200).optional(),
  evidenceDocumentId: z.uuid("Choose scanned-clean remittance evidence."),
});

export type RecordOwnerRemittanceInput = z.infer<typeof recordOwnerRemittanceSchema>;
