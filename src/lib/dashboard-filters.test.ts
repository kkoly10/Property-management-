import { describe, expect, it } from "vitest";
import { defaultDashboardFilters, parseDashboardFilters } from "@/lib/dashboard-filters";

const now = new Date("2026-07-24T16:00:00.000Z");

describe("dashboard filters", () => {
  it("defaults to a 30-day inclusive reporting period", () => {
    expect(defaultDashboardFilters(now)).toEqual({ fromDate: "2026-06-25", toDate: "2026-07-24" });
  });

  it("accepts scoped UUID and date filters", () => {
    expect(parseDashboardFilters({
      propertyId: "11111111-1111-4111-8111-111111111111",
      bookId: "22222222-2222-4222-8222-222222222222",
      from: "2026-07-01",
      to: "2026-07-24",
    }, now)).toEqual({
      invalid: false,
      filters: {
        propertyId: "11111111-1111-4111-8111-111111111111",
        accountingBookId: "22222222-2222-4222-8222-222222222222",
        fromDate: "2026-07-01",
        toDate: "2026-07-24",
      },
    });
  });

  it.each([
    { propertyId: "not-a-uuid" },
    { from: "2026-07-25", to: "2026-07-24" },
    { from: "2025-01-01", to: "2026-07-24" },
    { to: "2026-07-25" },
  ])("falls back safely for invalid input", (values) => {
    expect(parseDashboardFilters(values, now)).toEqual({
      invalid: true,
      filters: { fromDate: "2026-06-25", toDate: "2026-07-24" },
    });
  });
});
