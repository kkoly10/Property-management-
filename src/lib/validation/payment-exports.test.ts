import { describe, expect, it } from "vitest";
import { paymentExportQuerySchema } from "@/lib/validation/payment-exports";

describe("payment export query validation", () => {
  it("accepts bounded filter fields", () => {
    expect(paymentExportQuerySchema.safeParse({
      from: "2026-07-01",
      to: "2026-07-24",
      propertyId: "f3000000-0000-4000-8000-000000000003",
    }).success).toBe(true);
  });

  it.each([
    { from: "2026-02-30" },
    { to: "07/24/2026" },
    { propertyId: "not-a-uuid" },
    { unknown: "filter" },
  ])("rejects malformed or unexpected input", (input) => {
    expect(paymentExportQuerySchema.safeParse(input).success).toBe(false);
  });
});
