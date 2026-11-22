import { z } from "zod";

const kind = z.enum(["obligation", "receipt", "refund", "deduction", "other", "correction"]);
const reference = z.string().trim().min(1).max(120);
const detail = z.string().trim().min(1).max(500);
const minor = z.string().regex(/^\d+$/);
const effectiveOn = z.iso.date();
const external = { effectiveOn, amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), reference, confirmed: z.literal(true) };
const disposition = { ...external, targetId: z.uuid() };

export const depositEntry = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("obligation"), effectiveOn, amountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), detail: detail.optional() }),
  z.strictObject({ kind: z.literal("receipt"), ...external, custodian: reference }),
  z.strictObject({ kind: z.literal("refund"), ...disposition }),
  z.strictObject({ kind: z.literal("deduction"), ...disposition, detail, evidenceVersionId: z.uuid(), noticeReference: reference, approvalReference: reference }),
  z.strictObject({ kind: z.literal("other"), ...disposition, detail }),
  z.strictObject({ kind: z.literal("correction"), targetId: z.uuid(), detail }),
]);
export const depositCommand = z.strictObject({
  organizationId: z.uuid(),
  operationKey: z.uuid(),
  expectedVersion: z.number().int().nonnegative().max(2_147_483_646),
  entry: depositEntry,
});
export type DepositCommand = z.infer<typeof depositCommand>;
export type DepositEntryKind = z.infer<typeof kind>;

export const depositReceipt = z.object({
  tenancyId: z.uuid(),
  entryId: z.uuid(),
  version: z.number().int().positive(),
});
export const tenancyDeposit = z.object({
  tenancyId: z.uuid(),
  version: z.number().int().nonnegative(),
  currency: z.enum(["USD", "CAD", "MXN"]),
  canManage: z.boolean(),
  canUploadEvidence: z.boolean(),
  localToday: effectiveOn,
  obligationMinor: minor.nullable(),
  receivedMinor: minor,
  disposedMinor: minor,
  heldMinor: minor,
  entries: z.array(z.object({
    id: z.uuid(),
    kind,
    version: z.number().int().positive(),
    amountMinor: minor,
    effectiveOn,
    reference: z.string().nullable(),
    detail: z.string().nullable(),
    custodian: z.string().nullable(),
    targetId: z.uuid().nullable(),
    evidenceVersionId: z.uuid().nullable(),
    noticeReference: z.string().nullable(),
    approvalReference: z.string().nullable(),
    remainingMinor: minor.nullable(),
    corrected: z.boolean(),
  })),
  evidenceOptions: z.array(z.object({ id: z.uuid(), label: z.string() })),
});
export type TenancyDeposit = z.infer<typeof tenancyDeposit>;
