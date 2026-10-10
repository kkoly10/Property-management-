import { describe, expect, it } from "vitest";
import { exactMoneyMinor, leaseDraftProblem, homeownerLeaseDraftSchema, emptyLeaseDraft } from "./homeowner-lease";
import { leaseFixture } from "./homeowner-lease.fixture";
describe("signed-rental starting position", () => {
  it("parses exact minor units without rounding, exponent or unsafe values", () => {
    expect(exactMoneyMinor("1350.25")).toBe(135025); expect(exactMoneyMinor("-125.50")).toBe(-12550);
    for (const value of ["", "1.001", "1e3", "Infinity", "90071992547409.92"]) expect(exactMoneyMinor(value)).toBeNull();
  });
  it("allows an incomplete saved draft but not activation", () => {
    expect(homeownerLeaseDraftSchema.safeParse(emptyLeaseDraft()).success).toBe(true);
    expect(leaseDraftProblem(emptyLeaseDraft(), "2026-09-26")).not.toBeNull();
  });
  it("requires explicit opening balance and valid local cutover", () => {
    const state = leaseFixture(), draft = state.draft!;
    expect(leaseDraftProblem(draft, state.localDate)).toBeNull();
    expect(leaseDraftProblem({ ...draft, openingBalance: "" }, state.localDate)).toMatch(/opening balance/);
    expect(leaseDraftProblem({ ...draft, firstChargeDueDate: "2026-01-01" }, state.localDate)).toMatch(/today or later/);
    expect(leaseDraftProblem({ ...draft, startDate: "2026-02-30" }, state.localDate)).toMatch(/valid/);
    expect(leaseDraftProblem({ ...draft, endDate: "2026-09-30" }, state.localDate)).toMatch(/within the lease/);
  });
  it("does not activate an unfinished replacement upload or duplicate household email", () => {
    const state = leaseFixture(), draft = state.draft!;
    expect(leaseDraftProblem({ ...draft, upload: { grantId: state.setupId!, checksum: "a".repeat(64), filename: "new.pdf", finalizeKey: state.setupId! } }, state.localDate)).toMatch(/pending/);
    expect(leaseDraftProblem({ ...draft, members: [...draft.members, { ...draft.members[0], primaryContact: false }] }, state.localDate)).toMatch(/different email/);
  });
});
