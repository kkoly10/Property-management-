import { z } from "zod";

const date = z.iso.date();
const scope = { organizationId: z.uuid(), operationKey: z.uuid() };
const renewalPeriod = { startOn: date, endOn: date };
const renewalState = z.enum(["scheduled", "effective", "canceled"]);
export const renewalCommand = z.discriminatedUnion("action", [
  z.strictObject({ ...scope, action: z.literal("schedule"), priorLeaseId: z.uuid(), endOn: date, firstChargeOn: date.nullable(),
    documentVersionId: z.uuid(), confirmed: z.literal(true) }),
  z.strictObject({ ...scope, action: z.literal("apply"), renewalId: z.uuid() }),
  z.strictObject({ ...scope, action: z.literal("cancel"), renewalId: z.uuid() }),
]);
export type RenewalCommand = z.infer<typeof renewalCommand>;
export const renewalReceipt = z.object({
  ...renewalPeriod, tenancyId: z.uuid(), renewalId: z.uuid(), state: renewalState, leaseId: z.uuid().nullable(),
});
export const tenancyRenewal = z.object({
  tenancyId: z.uuid(),
  tenancyStatus: z.enum(["scheduled", "active", "notice_given", "move_out_in_progress", "closed"]),
  householdName: z.string(),
  propertyName: z.string(),
  currentLeaseId: z.uuid(),
  currentStart: date,
  currentEnd: date.nullable(),
  renewalStart: date.nullable(),
  localToday: date,
  rentMinor: z.string().regex(/^\d+$/),
  currency: z.enum(["USD", "CAD", "MXN"]),
  cadence: z.string(),
  firstContinuingChargeOn: date.nullable(),
  canManage: z.boolean(),
  canSchedule: z.boolean(),
  documents: z.array(z.object({ id: z.uuid(), label: z.string() })),
  renewals: z.array(z.object({ ...renewalPeriod, id: z.uuid(), state: renewalState, firstChargeOn: date.nullable(),
    priorStart: date, priorEnd: date })),
});
export type TenancyRenewal = z.infer<typeof tenancyRenewal>;
