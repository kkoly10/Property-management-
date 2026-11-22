import type { LeaseSetupState, LeaseActivationResult } from "@/lib/homeowner/lease-state";
import { emptyLeaseDraft } from "./homeowner-lease";
export const leaseOrg = "20000000-0000-4000-8000-000000000002";
export const leaseUnit = "80000000-0000-4000-8000-000000000008";
export const agreementVersion = "50000000-0000-4000-8000-000000000005";
export const agreementDoc = "60000000-0000-4000-8000-000000000006";
export function leaseFixture(): LeaseSetupState {
  const draft = emptyLeaseDraft();
  return { setupId: "90000000-0000-4000-8000-000000000009", revision: 3, status: "draft", result: null,
    currency: "USD", localDate: "2026-09-26", propertyId: "10000000-0000-4000-8000-000000000001",
    documents: [{ documentId: agreementDoc, versionId: agreementVersion, filename: "signed.pdf", title: "Signed lease", status: "clean", scanState: "completed" }],
    draft: { ...draft, householdName: "Example household", members: [{ firstName: "Jamie", lastName: "Example", email: "jamie@example.com", phoneE164: "", primaryContact: true, financiallyResponsible: true }],
      startDate: "2026-01-01", rentAmount: "1350.25", openingBalance: "0", firstChargeDueDate: "2026-10-01", documentVersionId: agreementVersion } };
}
export function activationFixture(): LeaseActivationResult {
  return { householdId: "a0000000-0000-4000-8000-000000000001", leaseId: "a0000000-0000-4000-8000-000000000002",
    tenancyId: "a0000000-0000-4000-8000-000000000003", receivableAccountId: "a0000000-0000-4000-8000-000000000004",
    chargeScheduleId: "a0000000-0000-4000-8000-000000000005", documentVersionId: agreementVersion, firstChargeDueDate: "2026-10-01",
    openingBalanceMinor: 0, currency: "USD", people: [{ personId: "a0000000-0000-4000-8000-000000000006", name: "Jamie Example", email: "jamie@example.com" }] };
}
