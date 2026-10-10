import { z } from "zod";

export const leaseDraftMemberSchema = z.object({
  firstName: z.string().max(100), lastName: z.string().max(100), email: z.string().max(254),
  phoneE164: z.string().max(20), primaryContact: z.boolean(), financiallyResponsible: z.boolean(),
}).strict();
export const leaseUploadReceiptSchema = z.object({
  grantId: z.uuid(), checksum: z.string().regex(/^[a-f0-9]{64}$/), filename: z.string().max(255),
  finalizeKey: z.uuid(),
}).strict();
export const homeownerLeaseDraftSchema = z.object({
  householdName: z.string().max(160), members: z.array(leaseDraftMemberSchema).min(1).max(12),
  startDate: z.string().max(10), endDate: z.string().max(10), rentAmount: z.string().max(18),
  rentFrequency: z.enum(["monthly", "weekly", "biweekly", "quarterly", "semiannual", "annual"]),
  openingBalance: z.string().max(19), firstChargeDueDate: z.string().max(10),
  occupancy: z.enum(["existing", "future"]), documentVersionId: z.union([z.uuid(), z.literal("")]),
  upload: leaseUploadReceiptSchema.nullable(),
}).strict();
export type HomeownerLeaseDraft = z.infer<typeof homeownerLeaseDraftSchema>;
export type LeaseUploadReceipt = z.infer<typeof leaseUploadReceiptSchema>;
export function emptyLeaseDraft(): HomeownerLeaseDraft {
  return { householdName: "", members: [{ firstName: "", lastName: "", email: "", phoneE164: "", primaryContact: true, financiallyResponsible: true }],
    startDate: "", endDate: "", rentAmount: "", rentFrequency: "monthly", openingBalance: "", firstChargeDueDate: "",
    occupancy: "existing", documentVersionId: "", upload: null };
}
export function exactMoneyMinor(value: string): number | null {
  if (!/^-?\d{1,14}(?:\.\d{1,2})?$/.test(value)) return null;
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const minor = (BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"))) * (negative ? BigInt(-1) : BigInt(1));
  return minor > BigInt(Number.MAX_SAFE_INTEGER) || minor < -BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(minor);
}
export function leaseDraftProblem(draft: HomeownerLeaseDraft, localDate: string): string | null {
  if (draft.upload) return "Finish or replace the pending agreement upload before activation.";
  if (!draft.householdName.trim()) return "Enter a name for this rental household.";
  if (!z.iso.date().safeParse(draft.startDate).success || !z.iso.date().safeParse(draft.firstChargeDueDate).success ||
    (draft.endDate && !z.iso.date().safeParse(draft.endDate).success)) return "Enter valid lease and first-charge dates.";
  if (draft.firstChargeDueDate < localDate || draft.firstChargeDueDate < draft.startDate ||
    (draft.endDate && (draft.endDate < draft.firstChargeDueDate || draft.endDate < draft.startDate)))
    return "The first charge must be today or later and within the lease. Put earlier unpaid amounts in the opening balance.";
  if ((draft.occupancy === "existing" && draft.startDate > localDate) || (draft.occupancy === "future" && draft.startDate <= localDate))
    return "Check whether the signed rental has already started or starts later.";
  const rent = exactMoneyMinor(draft.rentAmount), opening = exactMoneyMinor(draft.openingBalance);
  if (rent === null || rent < 0 || draft.rentAmount.startsWith("-") || opening === null) return "Enter rent and opening balance with no more than two decimal places. Enter 0 when nothing is owed.";
  if (!z.uuid().safeParse(draft.documentVersionId).success) return "Upload or choose the signed agreement.";
  if (draft.members.filter((m) => m.primaryContact).length !== 1) return "Choose exactly one primary contact.";
  const emails: string[] = [];
  for (const m of draft.members) {
    if (!m.firstName.trim() || !m.lastName.trim()) return "Enter each renter’s first and last name.";
    if ((m.primaryContact || m.email) && !z.email().safeParse(m.email.trim()).success) return "Enter a valid email for the primary contact and every supplied email.";
    if (m.phoneE164 && !/^\+[1-9]\d{7,14}$/.test(m.phoneE164)) return "Use an international phone number, such as +12025550110, or leave it blank.";
    if (m.email) emails.push(m.email.trim().toLowerCase());
  }
  return new Set(emails).size !== emails.length ? "Each renter needs a different email address." : null;
}
export const leaseSetupTargetSchema = z.object({ organizationId: z.uuid(), unitId: z.uuid() });
export const saveLeaseSetupSchema = leaseSetupTargetSchema.extend({ expectedRevision: z.number().int().min(0), draft: homeownerLeaseDraftSchema }).strict();
export const activateLeaseSetupSchema = leaseSetupTargetSchema.extend({ expectedRevision: z.number().int().min(1), openingConfirmed: z.literal(true), agreementConfirmed: z.literal(true) }).strict();
