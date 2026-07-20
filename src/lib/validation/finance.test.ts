import { describe, expect, it } from "vitest";
import { generateRecurringChargesSchema, recordManualPaymentSchema } from "@/lib/validation/finance";

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
