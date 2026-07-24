import { z } from "zod";

export const staffRoleCodes = [
  "org_owner",
  "org_admin",
  "property_manager",
  "leasing_agent",
  "accountant",
  "maintenance_coordinator",
  "read_only_auditor",
] as const;

const optionalTimestamp = z.union([
  z.iso.datetime({ offset: true }),
  z.literal(""),
  z.null(),
]).optional().transform((value) => value || null);

const auditReason = z.string().trim().max(500).nullable().optional()
  .transform((value) => value || null);

const membershipDates = {
  startsAt: optionalTimestamp,
  endsAt: optionalTimestamp,
};

const validateDates = (
  value: { startsAt?: string | null; endsAt?: string | null },
  context: z.RefinementCtx,
) => {
  if (value.startsAt && value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
    context.addIssue({
      code: "custom",
      path: ["endsAt"],
      message: "The end date must be after the start date.",
    });
  }
};

export const inviteStaffSchema = z.object({
  organizationId: z.uuid(),
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  roleCode: z.enum(staffRoleCodes),
  propertyIds: z.array(z.uuid()).max(500),
  ...membershipDates,
  mfaRequired: z.boolean(),
  locale: z.enum(["en-US", "es-MX", "en-CA", "fr-CA"]),
  auditReason,
}).superRefine(validateDates);

export const updateStaffMembershipSchema = z.object({
  roleCode: z.enum(staffRoleCodes),
  status: z.enum(["active", "suspended"]),
  ...membershipDates,
  mfaRequired: z.boolean(),
  expectedVersion: z.number().int().positive(),
  auditReason,
}).superRefine(validateDates);

export const replaceStaffPropertyScopesSchema = z.object({
  propertyIds: z.array(z.uuid()).max(500),
  expectedVersion: z.number().int().positive(),
  auditReason: z.string().trim().min(3, "Add a reason for the access change.").max(500),
});

export const revokeStaffMembershipSchema = z.object({
  expectedVersion: z.number().int().positive(),
  auditReason: z.string().trim().min(3, "Add a reason for revoking access.").max(500),
});

export const acceptStaffInvitationSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{40,100}$/, "The invitation token is invalid."),
});
