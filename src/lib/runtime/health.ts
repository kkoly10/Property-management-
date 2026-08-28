/**
 * The HTTP status a scheduled run should report.
 *
 * A cron endpoint that always answers 200 is indistinguishable from one that is quietly failing every
 * single item, and an operator watching only the invocation log would see a healthy schedule while no
 * rent was charged and no mail was sent. So the status carries the outcome:
 *
 *   * nothing to do, or everything succeeded  → 200
 *   * some items failed                       → 207 (the run did real work; investigate the rest)
 *   * every item failed                       → 502 (the run accomplished nothing)
 *
 * Partial failure must NOT read as total failure: one misconfigured organization cannot be allowed to
 * make a schedule look dead while every other tenant is being served correctly.
 */
export function scheduledRunStatus(attempted: number, failed: number, degraded = 0): 200 | 207 | 502 {
  if (attempted > 0 && failed >= attempted) return 502;
  // Failures are only meaningful against something attempted; more failures than attempts is incoherent
  // input and is not reported as a failure.
  if (attempted > 0 && failed > 0) return 207;
  // `degraded` stands on its own, because it counts work the run did not even ATTEMPT: a property whose
  // time zone is unrecognized, a schedule the command would refuse. Skipping it is the right call — it
  // must not take down the rest of the run — but it is not a healthy outcome, and a 200 here is exactly
  // how "rent silently never generated for 40 units" hides in an invocation log that looks perfect.
  if (degraded > 0) return 207;
  return 200;
}
