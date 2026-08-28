import { describe, expect, it } from "vitest";
import { scheduledRunStatus } from "./health";

describe("scheduledRunStatus", () => {
  it("reports a healthy run for an empty queue or a clean sweep", () => {
    expect(scheduledRunStatus(0, 0)).toBe(200);
    expect(scheduledRunStatus(25, 0)).toBe(200);
  });

  it("does not let a total failure masquerade as a healthy 200", () => {
    // The failure this exists to prevent: every job failing while the invocation log stays green.
    expect(scheduledRunStatus(1, 1)).toBe(502);
    expect(scheduledRunStatus(25, 25)).toBe(502);
  });

  it("does not let one bad tenant make a working schedule look dead", () => {
    expect(scheduledRunStatus(25, 1)).toBe(207);
    expect(scheduledRunStatus(3, 2)).toBe(207);
  });

  it("never reports failure it cannot substantiate", () => {
    expect(scheduledRunStatus(0, 5)).toBe(200);
    expect(scheduledRunStatus(-1, 3)).toBe(200);
  });
});
