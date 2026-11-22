import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasValidCronCredential } from "@/lib/runtime/worker-auth";
import { runNotificationDispatch } from "@/lib/runtime/jobs";
import { scheduledRunStatus } from "@/lib/runtime/health";
import { recordScheduledRun } from "@/lib/runtime/heartbeat";
import { NOTIFICATION_WORKER_BATCH_SIZE } from "@/lib/runtime/budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Scheduled transactional-notification drain. Vercel Cron issues GET with a Bearer CRON_SECRET. */
export async function GET(request: Request) {
  if (!hasValidCronCredential(request)) {
    return NextResponse.json({ error: "A valid scheduler credential is required." }, { status: 401 });
  }
  return recordScheduledRun(createAdminClient(), "notifications", async (supabase) => {
    const result = await runNotificationDispatch(supabase, {
      channel: "email",
      limit: NOTIFICATION_WORKER_BATCH_SIZE,
      workerRunId: `cron-notifications-${Date.now()}`,
      stallMinutes: 30,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const summary = result.summary as { claimed: number; failed: number };
    return NextResponse.json(summary, { status: scheduledRunStatus(summary.claimed, summary.failed) });
  });
}
