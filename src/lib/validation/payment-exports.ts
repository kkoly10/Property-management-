import { z } from "zod";

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "Use a valid calendar date.");

export const paymentExportQuerySchema = z.object({
  from: calendarDate.optional(),
  to: calendarDate.optional(),
  propertyId: z.uuid().optional(),
  accountingBookId: z.uuid().optional(),
}).strict();
