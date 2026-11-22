import { z } from "zod";

const date = z.iso.date();
const commandScope = {
  organizationId: z.uuid(),
  idempotencyKey: z.uuid(),
  expectedVersion: z.number().int().nonnegative().max(2_147_483_646),
};

export const closeoutCommand = z.discriminatedUnion("action", [
  z.strictObject({ ...commandScope, action: z.literal("plan"), effectiveOn: date }),
  z.strictObject({ ...commandScope, action: z.literal("cancel") }),
  z.strictObject({ ...commandScope, action: z.literal("record_return"), effectiveOn: date, returnConfirmed: z.literal(true) }),
]);
export type CloseoutCommand = z.infer<typeof closeoutCommand>;

export const closeoutReceipt = z.object({
  tenancyId: z.uuid(),
  state: z.enum(["open", "planned", "canceled", "returned"]),
  version: z.number().int().nonnegative(),
  plannedReturnOn: date.nullable(),
  returnedOn: date.nullable(),
});

export const tenancyCloseout = closeoutReceipt.extend({
  propertyId: z.uuid(),
  propertyName: z.string(),
  householdName: z.string(),
  unitCode: z.string(),
  tenancyStatus: z.enum(["scheduled", "active", "notice_given", "move_out_in_progress", "closed"]),
  leaseStart: date,
  leaseEnd: date.nullable(),
  possessionStart: date,
  localToday: date,
  canManage: z.boolean(),
  accounting: z.object({
    currency: z.enum(["USD", "CAD", "MXN"]),
    balanceMinor: z.string().regex(/^-?\d+$/),
    openCharges: z.number().int().nonnegative(),
    unsettledPayments: z.number().int().nonnegative(),
  }).nullable(),
});

export type TenancyCloseout = z.infer<typeof tenancyCloseout>;
