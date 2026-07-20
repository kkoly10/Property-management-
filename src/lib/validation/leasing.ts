import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const householdMemberSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.email().max(254).optional(),
  phoneE164: z.string().regex(/^\+[1-9]\d{7,14}$/).optional(),
  primaryContact: z.boolean(),
  financiallyResponsible: z.boolean(),
});
export const activateExistingLeaseSchema = z.object({
  organizationId: z.uuid(),
  propertyId: z.uuid(),
  unitId: z.uuid(),
  household: z.object({
    displayName: z.string().trim().min(1).max(160),
    members: z.array(householdMemberSchema).min(1).max(12),
  }).superRefine((household, context) => {
    if (household.members.filter((member) => member.primaryContact).length !== 1) {
      context.addIssue({ code: "custom", message: "Choose exactly one primary contact.", path: ["members"] });
    }
    const emails = household.members.flatMap((member) => member.email ? [member.email.toLowerCase()] : []);
    if (new Set(emails).size !== emails.length) {
      context.addIssue({ code: "custom", message: "Household emails must be unique.", path: ["members"] });
    }
  }),
  lease: z.object({
    source: z.enum(["operator_supplied", "imported"]),
    externalReference: z.string().trim().max(120).optional(),
    startDate: isoDate,
    endDate: isoDate.optional(),
    rentAmountMinor: z.number().int().nonnegative().safe(),
    currencyCode: z.enum(["USD", "CAD", "MXN"]),
    rentFrequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "semiannual", "annual", "custom"]),
    signedDocumentId: z.uuid(),
  }).refine((lease) => !lease.endDate || lease.endDate >= lease.startDate, { message: "The end date must be on or after the start date.", path: ["endDate"] }),
  openingBalanceMinor: z.number().int().safe().optional(),
  firstChargeDueDate: isoDate.optional(),
}).refine((request) => !request.firstChargeDueDate || request.firstChargeDueDate >= request.lease.startDate, {
  message: "The first charge cannot precede the lease.", path: ["firstChargeDueDate"],
}).refine((request) => !request.firstChargeDueDate || !request.lease.endDate || request.firstChargeDueDate <= request.lease.endDate, {
  message: "The first charge must fall within the lease.", path: ["firstChargeDueDate"],
});
