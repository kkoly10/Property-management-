import { z } from "zod";

const preferredTimeSchema = z.object({
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
}).refine((slot) => new Date(slot.end).getTime() > new Date(slot.start).getTime(), {
  message: "Each preferred window must end after it starts.", path: ["end"],
});

export const submitMaintenanceRequestSchema = z.object({
  tenancyId: z.uuid(),
  category: z.string().trim().min(2).max(80),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(4000),
  priorityRequested: z.enum(["low", "medium", "high"]).optional(),
  accessPermission: z.string().trim().min(2).max(500).optional(),
  preferredTimes: z.array(preferredTimeSchema).max(5).default([]),
  evidenceDocumentIds: z.array(z.uuid()).max(5).refine((items) => new Set(items).size === items.length, "Evidence images must be unique.").default([]),
});
