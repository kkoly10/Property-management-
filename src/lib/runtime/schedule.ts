/**
 * The repository-defined schedule. `vercel.json` is generated from this list by
 * `npm run schedule:check`, so the cron entries a deployment gets and the routes this repo actually
 * ships can never drift apart — a schedule pointing at a route that does not exist is a silently dead
 * job, which is exactly how "the worker exists" turns into "nothing ever ran".
 *
 * Times are UTC (Vercel evaluates cron in UTC).
 */
export type ScheduledJob = {
  /** Route path, which must exist under src/app as a GET handler. */
  path: string;
  /** Standard 5-field cron expression, evaluated in UTC. */
  schedule: string;
  /** Why this cadence — read this before changing a schedule. */
  rationale: string;
};

export const scheduledJobs: ScheduledJob[] = [
  {
    path: "/api/internal/cron/recurring-charges",
    schedule: "0 * * * *",
    rationale:
      "Hourly, because 'the 1st' happens at a different UTC instant in every property's time zone. "
      + "Each run charges only the schedules whose OWN local date has arrived, so an hourly cadence "
      + "walks the day zone by zone. A once-daily UTC run would necessarily be wrong for most zones.",
  },
  {
    path: "/api/internal/cron/notifications",
    schedule: "*/10 * * * *",
    rationale:
      "Transactional mail (invitations, receipts, document deliveries) should not sit in a queue for an "
      + "hour. Ten minutes bounds worst-case latency while keeping the run count modest.",
  },
  {
    path: "/api/internal/cron/document-scans",
    schedule: "*/10 * * * *",
    rationale:
      "An uploaded document is unusable until it is scanned, so this is on the critical path of every "
      + "upload flow. It also sweeps scans abandoned by a crashed worker.",
  },
  {
    path: "/api/internal/cron/operational-sweep",
    schedule: "17 4 * * *",
    rationale:
      "Daily housekeeping: expire upload grants nobody finalized and purge idempotency records past "
      + "their TTL. Off-peak, and at :17 rather than :00 so it does not pile onto the hourly jobs.",
  },
];

export function buildVercelCronConfig() {
  return {
    $schema: "https://openapi.vercel.sh/vercel.json",
    crons: scheduledJobs.map((job) => ({ path: job.path, schedule: job.schedule })),
  };
}
