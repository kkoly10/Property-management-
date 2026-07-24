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

export const createVendorSchema = z.object({
  organizationId: z.uuid(),
  displayName: z.string().trim().min(1).max(160),
  email: z.email().optional(),
  phoneE164: z.string().regex(/^\+[1-9][0-9]{7,14}$/, "Use E.164 format, e.g. +14045551234.").optional(),
});

export const createAndAssignWorkOrderSchema = z.object({
  organizationId: z.uuid(),
  maintenanceRequestId: z.uuid(),
  vendorId: z.uuid().optional(),
  scope: z.string().trim().min(3).max(2000),
  scheduledStart: z.iso.datetime({ offset: true }).optional(),
  scheduledEnd: z.iso.datetime({ offset: true }).optional(),
  estimatedCostMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  currencyCode: z.enum(["USD", "CAD", "MXN"]).optional(),
  ownerApprovalRequired: z.boolean().default(false),
  officialPriority: z.enum(["low", "medium", "high", "emergency"]).optional(),
}).superRefine((workOrder, context) => {
  if (workOrder.scheduledStart && workOrder.scheduledEnd && new Date(workOrder.scheduledEnd).getTime() <= new Date(workOrder.scheduledStart).getTime()) {
    context.addIssue({ code: "custom", path: ["scheduledEnd"], message: "The visit window must end after it starts." });
  }
  if (workOrder.estimatedCostMinor !== undefined && !workOrder.currencyCode) {
    context.addIssue({ code: "custom", path: ["currencyCode"], message: "Enter the currency for the estimated cost." });
  }
});

export const transitionWorkOrderSchema = z.object({
  expectedVersion: z.number().int().positive(),
  transition: z.enum(["accept", "schedule", "start", "complete", "close", "cancel"]),
  reason: z.string().trim().min(3).max(1000).optional(),
  scheduledStart: z.iso.datetime({ offset: true }).optional(),
  scheduledEnd: z.iso.datetime({ offset: true }).optional(),
  actualCostMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  completionSummary: z.string().trim().min(3).max(4000).optional(),
  evidenceDocumentIds: z.array(z.uuid()).max(10).refine((items) => new Set(items).size === items.length, "Evidence files must be unique.").optional(),
}).superRefine((transition, context) => {
  if (transition.transition === "schedule" && (!transition.scheduledStart || !transition.scheduledEnd)) {
    context.addIssue({ code: "custom", path: ["scheduledStart"], message: "A scheduled visit needs a start and end time." });
  }
  if (transition.scheduledStart && transition.scheduledEnd && new Date(transition.scheduledEnd).getTime() <= new Date(transition.scheduledStart).getTime()) {
    context.addIssue({ code: "custom", path: ["scheduledEnd"], message: "The visit window must end after it starts." });
  }
  if (transition.transition === "complete" && !transition.completionSummary) {
    context.addIssue({ code: "custom", path: ["completionSummary"], message: "Describe the completed work." });
  }
  if (transition.transition === "cancel" && !transition.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Explain why the work order is being canceled." });
  }
});

export const ownerApprovalDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(3).max(1000).optional(),
  expectedVersion: z.number().int().positive(),
}).superRefine((approval, context) => {
  if (approval.decision === "rejected" && !approval.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Explain why this request is being rejected." });
  }
});

export type CreateVendorInput = z.infer<typeof createVendorSchema>;
export type CreateAndAssignWorkOrderInput = z.infer<typeof createAndAssignWorkOrderSchema>;
export type TransitionWorkOrderInput = z.infer<typeof transitionWorkOrderSchema>;
export type OwnerApprovalDecisionInput = z.infer<typeof ownerApprovalDecisionSchema>;
