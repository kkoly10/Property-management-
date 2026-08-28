import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SCAN_RELAY_TIMEOUT_MS,
  SCAN_WORKER_BATCH_SIZE,
  SCAN_WORKER_CONCURRENCY,
  SCAN_WORKER_MAX_DURATION_SECONDS,
  scanBudgetMargin,
  worstCaseScanRunSeconds,
} from "./budget";

describe("the scan worker's execution budget", () => {
  it("finishes its worst case inside the pinned duration, with real margin", () => {
    // The failure this prevents: a run that exceeds the function's duration is KILLED, and every job
    // it claimed sits in 'scanning' until the stall sweep — so a single timeout strands the whole
    // batch for the length of the stall window. The worst case is every job stalling to its timeout.
    const worst = worstCaseScanRunSeconds();
    expect(worst).toBeLessThan(SCAN_WORKER_MAX_DURATION_SECONDS);
    // Not "technically under" — under with room, because the relay timeout is a ceiling on the
    // network, not on the whole request.
    expect(scanBudgetMargin()).toBeGreaterThan(0.25);
  });

  it("recomputes the worst case from the parts, so changing one cannot silently break it", () => {
    // Sequential scanning at the old settings — 10 jobs, 60s each — is what made the budget implicit.
    expect(worstCaseScanRunSeconds(10, 1, 60_000, 10)).toBeGreaterThan(SCAN_WORKER_MAX_DURATION_SECONDS);
    // And the guarantee tracks the parts rather than being asserted once against fixed numbers.
    expect(worstCaseScanRunSeconds(6, 3, 12_000, 10)).toBe(34);
    expect(worstCaseScanRunSeconds(3, 3, 12_000, 10)).toBe(22);
  });

  it("keeps the batch small enough to be drained by its own cadence", () => {
    // The scan cron runs every 10 minutes. A batch that cannot clear faster than the interval builds a
    // queue that never empties.
    expect(SCAN_WORKER_BATCH_SIZE).toBeLessThanOrEqual(SCAN_WORKER_CONCURRENCY * 2);
    expect(worstCaseScanRunSeconds()).toBeLessThan(10 * 60);
  });

  it("bounds parallelism instead of fanning out over someone else's service", () => {
    expect(SCAN_WORKER_CONCURRENCY).toBeGreaterThan(1);
    expect(SCAN_WORKER_CONCURRENCY).toBeLessThanOrEqual(5);
  });

  it("is pinned on the route rather than inherited from a platform default", () => {
    // "Do not leave the deployment duration implicit": the route must declare maxDuration, and it must
    // declare the same number this module reasons about.
    const route = readFileSync(resolve(__dirname, "../../app/api/internal/cron/document-scans/route.ts"), "utf8");
    // Next requires a literal in a route segment config, so the two must be pinned to each other here
    // rather than by an import — otherwise changing one silently un-sizes the batch against the other.
    const declared = /export const maxDuration = (\d+)/.exec(route);
    expect(declared, "the route does not declare maxDuration").not.toBeNull();
    expect(Number(declared![1])).toBe(SCAN_WORKER_MAX_DURATION_SECONDS);
    expect(route).toContain("SCAN_WORKER_BATCH_SIZE");
    expect(route).not.toMatch(/limit:\s*10\b/);
  });

  it("holds the relay to the declared timeout rather than its own constant", () => {
    const scanner = readFileSync(resolve(__dirname, "../documents/scanner.ts"), "utf8");
    expect(scanner).toContain("SCAN_RELAY_TIMEOUT_MS");
    // The old 60-second wait was the entire function budget spent on one job.
    expect(scanner).not.toMatch(/abort\(\),\s*60_000/);
    expect(SCAN_RELAY_TIMEOUT_MS).toBeLessThan(SCAN_WORKER_MAX_DURATION_SECONDS * 1000);
  });
});
