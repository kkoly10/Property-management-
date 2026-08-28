/**
 * Execution budgets for the scheduled workers.
 *
 * The scan cron shipped with an implicit duration: it claimed 10 jobs, processed them sequentially,
 * and allowed each relay request up to 60 seconds. Ten stalled requests is ten minutes of wall clock,
 * which no serverless function budget tolerates — and a function killed mid-run leaves every claimed
 * job sitting in `scanning` until the stall sweep runs, so one timeout strands the whole batch for the
 * length of the stall window.
 *
 * The budget is therefore declared here, asserted by a test, and exported to the route as an explicit
 * `maxDuration`. Nothing about it is inferred from a platform default.
 *
 * A note on where the numbers come from: the Vercel project (`property-management`, Pro team, Node
 * 24.x) carries no function configuration of its own, and the documentation tool available in this
 * environment does not expose a per-plan limits table. Rather than assume a default that might not
 * hold, the route pins `maxDuration` explicitly at a value comfortably inside the smallest limit any
 * current Vercel plan offers, and the batch is sized to finish well inside THAT. If the plan later
 * permits more, raising these two numbers together is the only change needed.
 */

/** The function duration we pin, in seconds. Exported to the route as `maxDuration`. */
export const SCAN_WORKER_MAX_DURATION_SECONDS = 60;

/**
 * How long a single relay request may take. Was 60s — the entire function budget for ONE job.
 *
 * Twelve seconds is generous for a scanner that has already received the bytes; a relay slower than
 * that is having an incident, and the right response to an incident is to fail the attempt and let the
 * backoff carry it, not to hold the whole batch hostage.
 */
export const SCAN_RELAY_TIMEOUT_MS = 12_000;

/** Jobs claimed per run. Sized so the worst case fits the budget with room to spare. */
export const SCAN_WORKER_BATCH_SIZE = 3;

/**
 * How many scans may be in flight at once.
 *
 * Bounded rather than unbounded: the relay is someone else's service and a cron that fans out
 * arbitrarily wide is a cron that causes the outage it was meant to survive.
 */
export const SCAN_WORKER_CONCURRENCY = 3;

/** Wall clock reserved for claiming, recording outcomes, and the stall sweep around the scans. */
export const SCAN_WORKER_OVERHEAD_SECONDS = 10;

/**
 * The worst case: every job in the batch stalls until its timeout, in `concurrency`-sized waves.
 *
 * This is the number that must stay under the pinned duration. It is computed rather than asserted so
 * that changing the batch size, the concurrency or the timeout cannot silently break the guarantee —
 * the test recomputes it.
 */
export function worstCaseScanRunSeconds(
  batchSize: number = SCAN_WORKER_BATCH_SIZE,
  concurrency: number = SCAN_WORKER_CONCURRENCY,
  relayTimeoutMs: number = SCAN_RELAY_TIMEOUT_MS,
  overheadSeconds: number = SCAN_WORKER_OVERHEAD_SECONDS,
): number {
  const waves = Math.ceil(batchSize / Math.max(concurrency, 1));
  return waves * (relayTimeoutMs / 1000) + overheadSeconds;
}

/** The margin between the worst case and the pinned budget, as a fraction of the budget. */
export function scanBudgetMargin(): number {
  return (SCAN_WORKER_MAX_DURATION_SECONDS - worstCaseScanRunSeconds()) / SCAN_WORKER_MAX_DURATION_SECONDS;
}
