import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasValidCronCredential } from "@/lib/runtime/worker-auth";
import { runRecurringChargeGeneration } from "@/lib/runtime/jobs";
import { scheduledRunStatus } from "@/lib/runtime/health";
import { recordScheduledRun } from "@/lib/runtime/heartbeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scheduled rent generation. Runs hourly and charges only the schedules whose OWN property-local date
 * has arrived, so no property is ever charged on a date that has not happened where it stands.
 */
export async function GET(request: Request) {
  if (!hasValidCronCredential(request)) {
    return NextResponse.json({ error: "A valid scheduler credential is required." }, { status: 401 });
  }
  return recordScheduledRun(createAdminClient(), "recurring-charges", async (supabase) => {
    const result = await runRecurringChargeGeneration(supabase, { limit: 500 });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const summary = result.summary as {
      zonesDue: number;
      failedBatches: unknown[];
      invalidTimeZones: unknown[];
      blockedSchedules: unknown[];
    };
    // Count blocked schedules and invalid zones so skipped work is visible in the response status.
    const degraded = summary.invalidTimeZones.length + summary.blockedSchedules.length;
    return NextResponse.json(summary, { status: scheduledRunStatus(summary.zonesDue, summary.failedBatches.length, degraded) });
  });
}
