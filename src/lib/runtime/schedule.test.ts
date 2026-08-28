import { describe, expect, it } from "vitest";
import { buildVercelCronConfig, scheduledJobs } from "./schedule";

describe("the repository-defined schedule", () => {
  it("schedules every worker that would otherwise never run", () => {
    const paths = scheduledJobs.map((job) => job.path);
    expect(paths).toContain("/api/internal/cron/recurring-charges");
    expect(paths).toContain("/api/internal/cron/notifications");
    expect(paths).toContain("/api/internal/cron/document-scans");
    expect(paths).toContain("/api/internal/cron/operational-sweep");
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("uses well-formed cron expressions on absolute paths", () => {
    for (const job of scheduledJobs) {
      expect(job.path.startsWith("/")).toBe(true);
      expect(job.schedule.trim().split(/\s+/)).toHaveLength(5);
      expect(job.rationale.length).toBeGreaterThan(40);
    }
  });

  it("runs rent generation at least hourly, because a daily UTC run cannot be right for every zone", () => {
    // A property's local date crosses midnight at a different UTC instant in every time zone. A
    // once-a-day run would necessarily charge most zones on the wrong local date.
    const rent = scheduledJobs.find((job) => job.path.endsWith("/recurring-charges"));
    expect(rent).toBeDefined();
    const [minute, hour] = rent!.schedule.split(/\s+/);
    expect(hour).toBe("*");
    expect(minute).not.toBe("*");
  });

  it("emits a vercel.json shape Vercel accepts", () => {
    const config = buildVercelCronConfig();
    expect(config.$schema).toBe("https://openapi.vercel.sh/vercel.json");
    expect(config.crons).toHaveLength(scheduledJobs.length);
    for (const entry of config.crons) {
      expect(Object.keys(entry).sort()).toEqual(["path", "schedule"]);
    }
  });
});
