import { describe, expect, it } from "vitest";
import { createResidentPaymentSessionSchema, generateRecurringChargesSchema, recordManualPaymentSchema, refundPaymentSchema, resolveReconciliationExceptionSchema } from "@/lib/validation/finance";

describe("generateRecurringChargesSchema", () => {
  it("accepts a bounded worker run", () => {
    expect(generateRecurringChargesSchema.safeParse({
      runDate: "2026-08-01",
      scheduleIds: ["10000000-0000-4000-8000-000000000001"],
      workerRunId: "charges-2026-08-01",
    }).success).toBe(true);
  });

  it("rejects malformed dates, worker IDs, and schedule IDs", () => {
    expect(generateRecurringChargesSchema.safeParse({ runDate: "08/01/2026", workerRunId: "short" }).success).toBe(false);
    expect(generateRecurringChargesSchema.safeParse({ runDate: "2026-08-01", scheduleIds: ["not-a-uuid"], workerRunId: "valid-worker" }).success).toBe(false);
  });
});

describe("recordManualPaymentSchema", () => {
  const payment = {
    organizationId: "10000000-0000-4000-8000-000000000001",
    tenancyId: "20000000-0000-4000-8000-000000000002",
    source: "check",
    amountMinor: 85000,
    currencyCode: "USD",
    receivedAt: "2026-07-20T12:00:00-04:00",
    reason: "Check received at the office",
    evidenceDocumentId: "30000000-0000-4000-8000-000000000003",
    allocations: [{ chargeId: "40000000-0000-4000-8000-000000000004", amountMinor: 85000 }],
  } as const;

  it("accepts an exactly allocated manual payment", () => {
    expect(recordManualPaymentSchema.safeParse(payment).success).toBe(true);
  });

  it("rejects mismatched and duplicate allocations", () => {
    expect(recordManualPaymentSchema.safeParse({ ...payment, amountMinor: 86000 }).success).toBe(false);
    expect(recordManualPaymentSchema.safeParse({ ...payment, amountMinor: 170000, allocations: [payment.allocations[0], payment.allocations[0]] }).success).toBe(false);
  });

  it("rejects unsupported sources and timestamps without an offset", () => {
    expect(recordManualPaymentSchema.safeParse({ ...payment, source: "card" }).success).toBe(false);
    expect(recordManualPaymentSchema.safeParse({ ...payment, receivedAt: "2026-07-20T12:00:00" }).success).toBe(false);
  });
});

describe("createResidentPaymentSessionSchema", () => {
  const session = {
    tenancyId: "20000000-0000-4000-8000-000000000002",
    amountMinor: 50000,
    currencyCode: "USD",
    allocationPreference: [{ chargeId: "40000000-0000-4000-8000-000000000004", amountMinor: 50000 }],
    methodPreference: "bank",
    returnUrl: "https://app.crecy.example/payments/new",
  } as const;

  it("accepts an exactly allocated resident checkout", () => {
    expect(createResidentPaymentSessionSchema.safeParse(session).success).toBe(true);
  });

  it("rejects mismatched, duplicate, unsafe, and provider-supplied details", () => {
    expect(createResidentPaymentSessionSchema.safeParse({ ...session, amountMinor: 49999 }).success).toBe(false);
    expect(createResidentPaymentSessionSchema.safeParse({ ...session, amountMinor: 100000, allocationPreference: [session.allocationPreference[0], session.allocationPreference[0]] }).success).toBe(false);
    expect(createResidentPaymentSessionSchema.safeParse({ ...session, amountMinor: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false);
    expect(createResidentPaymentSessionSchema.safeParse({ ...session, providerAccountId: "acct_forged" }).success).toBe(false);
  });
});

describe("refundPaymentSchema", () => {
  const refund = {
    amountMinor: 20_000,
    reason: "Return the resident overpayment",
    expectedStatus: "succeeded",
    expectedVersion: 2,
    idempotencyKey: "provider-refund-request-0001",
  };

  it("accepts a bounded optimistic refund request", () => {
    expect(refundPaymentSchema.safeParse(refund).success).toBe(true);
  });

  it("rejects unsafe amounts, stale version shapes, and extra provider fields", () => {
    expect(refundPaymentSchema.safeParse({ ...refund, amountMinor: 0 }).success).toBe(false);
    expect(refundPaymentSchema.safeParse({ ...refund, expectedVersion: 0 }).success).toBe(false);
    expect(refundPaymentSchema.safeParse({ ...refund, providerChargeId: "ch_forged" }).success).toBe(false);
  });
});

describe("resolveReconciliationExceptionSchema", () => {
  const organizationId = "10000000-0000-4000-8000-000000000001";

  it("requires an evidence note to resolve or waive, but not to escalate", () => {
    expect(resolveReconciliationExceptionSchema.safeParse({ organizationId, resolution: "resolved", evidence: "Confirmed against the bank record." }).success).toBe(true);
    expect(resolveReconciliationExceptionSchema.safeParse({ organizationId, resolution: "waived", evidence: "Immaterial rounding difference." }).success).toBe(true);
    expect(resolveReconciliationExceptionSchema.safeParse({ organizationId, resolution: "escalated" }).success).toBe(true);
    expect(resolveReconciliationExceptionSchema.safeParse({ organizationId, resolution: "resolved" }).success).toBe(false);
    expect(resolveReconciliationExceptionSchema.safeParse({ organizationId, resolution: "waived" }).success).toBe(false);
  });

  it("rejects unsupported resolutions, short or long evidence, and extra fields", () => {
    expect(resolveReconciliationExceptionSchema.safeParse({ organizationId, resolution: "dismissed", evidence: "A valid length note." }).success).toBe(false);
    expect(resolveReconciliationExceptionSchema.safeParse({ organizationId, resolution: "resolved", evidence: "short" }).success).toBe(false);
    expect(resolveReconciliationExceptionSchema.safeParse({ organizationId, resolution: "resolved", evidence: "x".repeat(1001) }).success).toBe(false);
    expect(resolveReconciliationExceptionSchema.safeParse({ organizationId, resolution: "escalated", note: "extra" }).success).toBe(false);
  });
});
