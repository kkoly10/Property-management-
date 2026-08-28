import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasValidCronCredential } from "@/lib/runtime/worker-auth";
import { runRecurringChargeGeneration } from "@/lib/runtime/jobs";
import { scheduledRunStatus } from "@/lib/runtime/health";

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
  const result = await runRecurringChargeGeneration(createAdminClient(), { limit: 500 });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const summary = result.summary as { zonesDue: number; failedBatches: unknown[] };
  return NextResponse.json(summary, { status: scheduledRunStatus(summary.zonesDue, summary.failedBatches.length) });
}
