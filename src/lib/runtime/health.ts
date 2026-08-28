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
export function scheduledRunStatus(attempted: number, failed: number): 200 | 207 | 502 {
  if (attempted <= 0 || failed <= 0) return 200;
  return failed >= attempted ? 502 : 207;
}
