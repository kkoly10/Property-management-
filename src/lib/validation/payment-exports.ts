import { z } from "zod";

const calendarDate = z.iso.date();
const optionalDate = z.union([calendarDate, z.literal("")]).optional().transform((value) => value || null);
const optionalId = z.union([z.uuid(), z.literal("")]).optional().transform((value) => value || null);
const minorUnits = z.string().regex(/^-?\d+$/);

export const paymentExportQuerySchema = z.strictObject({
  organizationId: z.uuid(),
  from: optionalDate,
  to: optionalDate,
  propertyId: optionalId,
  accountingBookId: optionalId,
});

export const paymentExportOptionsSchema = z.object({
  organizationId: z.uuid(),
  properties: z.array(z.object({ id: z.uuid(), name: z.string(), bookId: z.uuid(), bookName: z.string() })),
});

export const paymentExportResultSchema = z.object({
  scope: z.object({
    organizationId: z.uuid(),
    fromDate: calendarDate,
    toDate: calendarDate,
  }),
  rowCount: z.number().int().min(0).max(5000),
  items: z.array(z.object({
    paymentId: z.uuid(),
    publicReference: z.string(),
    activityAt: z.string(),
    receivedAt: z.string().nullable(),
    propertyId: z.uuid(),
    propertyName: z.string(),
    accountingBookId: z.uuid(),
    unitCode: z.string(),
    householdName: z.string(),
    paymentSource: z.string(),
    status: z.string(),
    reconciliationStatus: z.string(),
    amountMinor: minorUnits,
    allocatedMinor: minorUnits,
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
  })).max(5000),
});

export type PaymentExportItem = z.infer<typeof paymentExportResultSchema>["items"][number];
export type PaymentExportProperty = z.infer<typeof paymentExportOptionsSchema>["properties"][number];
