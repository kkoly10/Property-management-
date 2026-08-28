import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasValidWorkerCredential } from "@/lib/runtime/worker-auth";
import { runDocumentScanDispatch } from "@/lib/runtime/jobs";
import { dispatchDocumentScansSchema } from "@/lib/validation/document-scan-worker";

export const runtime = "nodejs";

/**
 * Manual/operator entry point for one document-scan worker run. The scheduled entry point is
 * /api/internal/cron/document-scans; both call the same runner.
 */
export async function POST(request: Request) {
  if (!hasValidWorkerCredential(request)) {
    return NextResponse.json({ error: "A valid internal worker credential is required." }, { status: 401 });
  }

  const parsed = dispatchDocumentScansSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the worker run details." }, { status: 400 });
  }

  const result = await runDocumentScanDispatch(createAdminClient(), parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.summary);
}
