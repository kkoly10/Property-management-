import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid ISO date.");

export const generateRecurringChargesSchema = z.object({
  runDate: isoDate,
  scheduleIds: z.array(z.uuid()).max(500).optional(),
  workerRunId: z.string().trim().min(8).max(200),
});

export type GenerateRecurringChargesInput = z.infer<typeof generateRecurringChargesSchema>;
