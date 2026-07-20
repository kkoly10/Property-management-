import { describe, expect, it } from "vitest";
import { generateRecurringChargesSchema } from "@/lib/validation/finance";

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
