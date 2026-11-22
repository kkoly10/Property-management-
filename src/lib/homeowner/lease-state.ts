import { z } from "zod";
import { homeownerLeaseDraftSchema } from "@/lib/validation/homeowner-lease";
export const leaseDocumentSchema = z.object({ documentId: z.uuid(), versionId: z.uuid(), filename: z.string(), title: z.string(), status: z.string(), scanState: z.string().nullable() });
const possessionStatusSchema = z.enum(["scheduled", "active", "notice_given", "move_out_in_progress", "closed"]);
export const leaseActivationResultSchema = z.object({ householdId: z.uuid(), leaseId: z.uuid(), tenancyId: z.uuid(), receivableAccountId: z.uuid(), chargeScheduleId: z.uuid(),
  documentVersionId: z.uuid(), firstChargeDueDate: z.string(), openingBalanceMinor: z.number().int().safe(), currency: z.enum(["USD", "CAD", "MXN"]),
  possessionStatus: possessionStatusSchema.optional(),
  people: z.array(z.object({ personId: z.uuid(), name: z.string(), email: z.string().nullable() })) });
export const leaseSetupStateSchema = z.object({ setupId: z.uuid().nullable(), revision: z.number().int().min(0), draft: homeownerLeaseDraftSchema.nullable(),
  status: z.enum(["draft", "activated"]), result: leaseActivationResultSchema.nullable(), documents: z.array(leaseDocumentSchema),
  possessionStatus: possessionStatusSchema.nullable().optional(),
  previousSetups: z.array(z.object({ setupId: z.uuid(), householdName: z.string(), startDate: z.string(), possessionStatus: possessionStatusSchema })).optional(),
  currency: z.enum(["USD", "CAD", "MXN"]), localDate: z.string(), propertyId: z.uuid() });
export type LeaseSetupState = z.infer<typeof leaseSetupStateSchema>;
export type LeaseActivationResult = z.infer<typeof leaseActivationResultSchema>;
export type LeaseDocument = z.infer<typeof leaseDocumentSchema>;
