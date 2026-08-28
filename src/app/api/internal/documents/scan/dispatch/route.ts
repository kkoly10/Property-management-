import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDocumentScanner, type DocumentObjectSource } from "@/lib/documents/scanner";
import { claimedDocumentScanJobSchema, dispatchDocumentScansSchema } from "@/lib/validation/document-scan-worker";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "A valid internal worker credential is required." }, { status: 401 });
}

function hasValidWorkerCredential(request: Request) {
  const expected = process.env.CRECY_INTERNAL_WORKER_SECRET;
  const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || expected.includes("replace_with") || !presented) return false;
  const expectedBytes = Buffer.from(expected);
  const presentedBytes = Buffer.from(presented);
  return expectedBytes.length === presentedBytes.length && timingSafeEqual(expectedBytes, presentedBytes);
}

/**
 * One cron-able scan run: recover claims abandoned by a crashed worker, claim a batch of due scan
 * jobs, ask the configured scanner for a verdict on each, and record the outcome. Every claimed job is
 * resolved exactly once — an unresolved job would sit in 'scanning' (and its document unusable) until
 * the next stall sweep, so failures inside the loop are reported to the database, never swallowed.
 */
export async function POST(request: Request) {
  if (!hasValidWorkerCredential(request)) return unauthorized();

  const parsed = dispatchDocumentScansSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the worker run details." }, { status: 400 });
  }
  const { limit, workerRunId, stallMinutes } = parsed.data;

  const scanner = getDocumentScanner();
  if (!scanner) {
    return NextResponse.json(
      { error: "No document scanner is configured. Set CRECY_DOCUMENT_SCAN_RELAY_URL and CRECY_DOCUMENT_SCAN_RELAY_SECRET." },
      { status: 503 },
    );
  }

  const supabase = createAdminClient();

  const { error: sweepError } = await supabase.rpc("requeue_stalled_document_scans", { p_stall_minutes: stallMinutes });
  if (sweepError) {
    return NextResponse.json({ error: "Stalled document scans could not be swept." }, { status: 422 });
  }

  const { data: claim, error: claimError } = await supabase.rpc("claim_document_scan_jobs", {
    p_limit: limit,
    p_worker_run_id: workerRunId,
  });
  if (claimError || !claim) {
    const code = claimError?.message ?? "";
    if (code.includes("INVALID_SCAN_BATCH_SIZE")) return NextResponse.json({ error: "That batch size is outside the supported range." }, { status: 422 });
    if (code.includes("INVALID_WORKER_RUN_ID")) return NextResponse.json({ error: "A worker run ID of 8-200 characters is required." }, { status: 422 });
    return NextResponse.json({ error: "Document scan jobs could not be claimed." }, { status: 422 });
  }

  const jobs = claimedDocumentScanJobSchema.array().safeParse((claim as { jobs?: unknown }).jobs ?? []);
  if (!jobs.success) {
    return NextResponse.json({ error: "The scan queue returned an unreadable job." }, { status: 422 });
  }

  const source: DocumentObjectSource = {
    async download(bucket, path) {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error || !data) return { bytes: null, error: error?.message ?? "OBJECT_MISSING" };
      return { bytes: Buffer.from(await data.arrayBuffer()), error: null };
    },
  };

  let cleaned = 0;
  let rejected = 0;
  let failed = 0;
  for (const job of jobs.data) {
    const result = await scanner.scan(
      { documentScanJobId: job.documentScanJobId, storageBucket: job.storageBucket, storagePath: job.storagePath },
      source,
    );

    if (result.ok) {
      // The digest travels with the verdict. complete_document_scan re-proves it against the job AND
      // the live version, so a scanner that read a different object cannot clean this one.
      const { error } = await supabase.rpc("complete_document_scan", {
        p_document_scan_job_id: job.documentScanJobId,
        p_verdict: result.verdict,
        p_observed_sha256_hex: result.observedSha256Hex,
        p_provider_code: result.providerCode,
        p_provider_reference: result.providerReference,
      });
      if (error) {
        // The database refused the verdict (mismatched digest, unscannable version). That is a failed
        // ATTEMPT, not a verdict: report it so the job leaves 'scanning' and the document stays
        // quarantined. A mismatch will not fix itself, so it is not retryable.
        const mismatch = error.message.includes("SCAN_TARGET_MISMATCH") || error.message.includes("DOCUMENT_VERSION_NOT_SCANNABLE");
        await supabase.rpc("fail_document_scan", {
          p_document_scan_job_id: job.documentScanJobId,
          p_error_code: mismatch ? "SCAN_TARGET_MISMATCH" : "VERDICT_NOT_APPLIED",
          p_retryable: !mismatch,
        });
        failed += 1;
      } else if (result.verdict === "clean") {
        cleaned += 1;
      } else {
        rejected += 1;
      }
    } else {
      await supabase.rpc("fail_document_scan", {
        p_document_scan_job_id: job.documentScanJobId,
        p_error_code: result.errorCode,
        p_retryable: result.retryable,
      });
      failed += 1;
    }
  }

  return NextResponse.json({ workerRunId, claimed: jobs.data.length, cleaned, rejected, failed });
}
