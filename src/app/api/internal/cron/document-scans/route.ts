import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasValidCronCredential } from "@/lib/runtime/worker-auth";
import { runDocumentScanDispatch } from "@/lib/runtime/jobs";
import { scheduledRunStatus } from "@/lib/runtime/health";
import { RENTAL_EVIDENCE_SCAN_BUDGET_MS, SCAN_WORKER_BATCH_SIZE } from "@/lib/runtime/budget";
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
  const evidenceDeadline = Date.now() + RENTAL_EVIDENCE_SCAN_BUDGET_MS;
  if (!hasValidCronCredential(request)) {
    return NextResponse.json({ error: "A valid scheduler credential is required." }, { status: 401 });
  }
  return recordScheduledRun(createAdminClient(), "document-scans", async (supabase) => {
    const workerRunId = `cron-document-scans-${Date.now()}`;
    const [result, evidence] = await Promise.all([
      runDocumentScanDispatch(supabase, { limit: SCAN_WORKER_BATCH_SIZE, workerRunId, stallMinutes: 30 }),
      runRentalEvidenceScan(supabase, { deadline: evidenceDeadline }),
    ]);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const summary = result.summary as { claimed: number; failed: number };
    const claimed = summary.claimed + evidence.claimed;
    const failed = summary.failed + (evidence.claimed ? evidence.failed : 0);
    const degraded = evidence.claimed === 0 && evidence.failed > 0 ? 1 : 0;
    return NextResponse.json(evidence.state === "disabled" ? summary : { ...summary, evidence },
      { status: scheduledRunStatus(claimed, failed, degraded) });
  });
}
