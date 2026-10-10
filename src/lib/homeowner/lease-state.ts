import { z } from "zod";
import { homeownerLeaseDraftSchema } from "@/lib/validation/homeowner-lease";
export const leaseDocumentSchema = z.object({ documentId: z.uuid(), versionId: z.uuid(), filename: z.string(), title: z.string(), status: z.string(), scanState: z.string().nullable() });
export const leaseActivationResultSchema = z.object({ householdId: z.uuid(), leaseId: z.uuid(), tenancyId: z.uuid(), receivableAccountId: z.uuid(), chargeScheduleId: z.uuid(),
  documentVersionId: z.uuid(), firstChargeDueDate: z.string(), openingBalanceMinor: z.number().int().safe(), currency: z.enum(["USD", "CAD", "MXN"]),
  people: z.array(z.object({ personId: z.uuid(), name: z.string(), email: z.string().nullable() })) });
export const leaseSetupStateSchema = z.object({ setupId: z.uuid().nullable(), revision: z.number().int().min(0), draft: homeownerLeaseDraftSchema.nullable(),
  status: z.enum(["draft", "activated"]), result: leaseActivationResultSchema.nullable(), documents: z.array(leaseDocumentSchema),
  currency: z.enum(["USD", "CAD", "MXN"]), localDate: z.string(), propertyId: z.uuid() });
export type LeaseSetupState = z.infer<typeof leaseSetupStateSchema>;
export type LeaseActivationResult = z.infer<typeof leaseActivationResultSchema>;
export type LeaseDocument = z.infer<typeof leaseDocumentSchema>;
