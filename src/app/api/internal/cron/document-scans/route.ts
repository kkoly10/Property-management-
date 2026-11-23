import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasValidCronCredential } from "@/lib/runtime/worker-auth";
import { runDocumentScanDispatch } from "@/lib/runtime/jobs";
import { scheduledRunStatus } from "@/lib/runtime/health";
import { SCAN_WORKER_BATCH_SIZE } from "@/lib/runtime/budget";
import { recordScheduledRun } from "@/lib/runtime/heartbeat";
import { runRentalEvidenceScan } from "@/lib/rental-evidence/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Pinned, not inherited. The duration this function is allowed must be a decision in the repository,
// because the batch size and relay timeout are sized against it — see src/lib/runtime/budget.ts.
//
// Next requires a literal here (a route segment config cannot be computed), so the number is written
// out and a test asserts it equals SCAN_WORKER_MAX_DURATION_SECONDS. Changing one without the other
// fails the gate rather than silently un-sizing the batch.
export const maxDuration = 60;

/** Scheduled document malware-scan drain, plus recovery of scans abandoned by a crashed worker. */
export async function GET(request: Request) {
  if (!hasValidCronCredential(request)) {
    return NextResponse.json({ error: "A valid scheduler credential is required." }, { status: 401 });
  }
  return recordScheduledRun(createAdminClient(), "document-scans", async (supabase) => {
    const workerRunId = `cron-document-scans-${Date.now()}`;
    const [result, evidence] = await Promise.all([
      runDocumentScanDispatch(supabase, { limit: SCAN_WORKER_BATCH_SIZE, workerRunId, stallMinutes: 30 }),
      runRentalEvidenceScan(supabase),
    ]);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const summary = result.summary as { claimed: number; failed: number };
    return NextResponse.json(evidence.state === "disabled" ? summary : { ...summary, evidence },
      { status: evidence.failed ? 207 : scheduledRunStatus(summary.claimed, summary.failed) });
  });
}
