import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getNotificationTransport } from "@/lib/notifications/transport";
import { hasTemplate, renderNotification } from "@/lib/notifications/templates";
import { secureLinkUrl } from "@/lib/notifications/secure-link";
import { getDocumentScanner, type DocumentObjectSource } from "@/lib/documents/scanner";
import { claimedNotificationJobSchema } from "@/lib/validation/notification-worker";
import { audienceForRelationshipType } from "@/lib/notifications/sender";
import { claimedDocumentScanJobSchema } from "@/lib/validation/document-scan-worker";
import { SCAN_WORKER_CONCURRENCY } from "@/lib/runtime/budget";

/**
 * The bodies of the scheduled workers, extracted so the manual POST routes and the cron GET routes run
 * exactly the same code. A second copy of this logic behind the scheduler would be a second place for
 * a queue to drift.
 */
export type JobOutcome =
  | { ok: true; summary: Record<string, unknown> }
  | { ok: false; status: number; error: string };

type Client = SupabaseClient;

// ── Transactional notifications ───────────────────────────────────────────────────────────────────
export async function runNotificationDispatch(
  supabase: Client,
  input: { channel: string; limit: number; workerRunId: string; stallMinutes: number },
): Promise<JobOutcome> {
  const transport = getNotificationTransport();
  if (!transport) {
    return {
      ok: false,
      status: 503,
      error: "No notification relay is configured. Set CRECY_NOTIFICATION_RELAY_URL and CRECY_NOTIFICATION_RELAY_SECRET.",
    };
  }

  const { error: sweepError } = await supabase.rpc("requeue_stalled_notification_jobs", { p_stall_minutes: input.stallMinutes });
  if (sweepError) return { ok: false, status: 422, error: "Stalled notification jobs could not be swept." };

  const { data: claim, error: claimError } = await supabase.rpc("claim_notification_jobs", {
    p_channel: input.channel,
    p_limit: input.limit,
    p_worker_run_id: input.workerRunId,
  });
  if (claimError || !claim) {
    const code = claimError?.message ?? "";
    if (code.includes("INVALID_NOTIFICATION_CHANNEL")) return { ok: false, status: 422, error: "That notification channel is not supported." };
    if (code.includes("INVALID_NOTIFICATION_BATCH_SIZE")) return { ok: false, status: 422, error: "That batch size is outside the supported range." };
    if (code.includes("INVALID_WORKER_RUN_ID")) return { ok: false, status: 422, error: "A worker run ID of 8-200 characters is required." };
    return { ok: false, status: 422, error: "Notification jobs could not be claimed." };
  }

  const jobs = claimedNotificationJobSchema.array().safeParse((claim as { jobs?: unknown }).jobs ?? []);
  if (!jobs.success) return { ok: false, status: 422, error: "The notification queue returned an unreadable job." };

  let sent = 0;
  let failed = 0;
  for (const job of jobs.data) {
    // Resolve each job to a terminal-for-this-attempt state, whatever happens below.
    let outcome: { ok: true; providerCode: string; providerMessageId: string | null } | { ok: false; errorCode: string; retryable: boolean };

    if (!job.recipientAddress) {
      outcome = { ok: false, errorCode: "MISSING_RECIPIENT_ADDRESS", retryable: false };
    } else if (!hasTemplate(job.templateCode)) {
      outcome = { ok: false, errorCode: "UNKNOWN_TEMPLATE_CODE", retryable: false };
    } else {
      // A secure-link delivery ships the token to the worker so the URL can be built here; the queue
      // row is scrubbed of it as soon as this job reaches a terminal state.
      const token = typeof job.payload.secureLinkToken === "string" ? job.payload.secureLinkToken : null;
      const link = token ? secureLinkUrl(token) : null;
      const payload = link ? { ...job.payload, secureLinkUrl: link } : job.payload;
      const rendered = renderNotification({ templateCode: job.templateCode, locale: job.locale, payload });

      // `document_delivered` is the one template that reaches more than one audience, so its template
      // code cannot say which brand should appear in the From line. The delivery row already records
      // the recipient's relationship, so resolve it from there rather than guessing — and rather than
      // widening the queue payload, which would mean replacing a security-definer function and
      // applying a migration out of band to fix a From address.
      //
      // Failing to resolve is not an error: the sender falls back to the neutral operator identity,
      // which is exactly the behavior before this lookup existed. A brand is worth a query; it is not
      // worth dead-lettering a document delivery.
      let audience = null as ReturnType<typeof audienceForRelationshipType>;
      const deliveryId = job.payload.documentDeliveryId;
      if (job.templateCode === "document_delivered" && typeof deliveryId === "string") {
        const { data: delivery } = await supabase
          .from("document_deliveries")
          .select("recipient_relationship_type")
          .eq("id", deliveryId)
          .maybeSingle();
        audience = audienceForRelationshipType(delivery?.recipient_relationship_type);
      }

      outcome = rendered
        ? await transport.send({
            notificationJobId: job.notificationJobId,
            channel: job.channel,
            to: job.recipientAddress,
            locale: job.locale,
            templateCode: job.templateCode,
            audience,
            rendered,
          })
        : { ok: false, errorCode: "UNKNOWN_TEMPLATE_CODE", retryable: false };
    }

    if (outcome.ok) {
      const { error } = await supabase.rpc("complete_notification_job", {
        p_notification_job_id: job.notificationJobId,
        p_provider_code: outcome.providerCode,
        p_provider_message_id: outcome.providerMessageId,
      });
      if (error) failed += 1;
      else sent += 1;
    } else {
      await supabase.rpc("fail_notification_job", {
        p_notification_job_id: job.notificationJobId,
        p_error_code: outcome.errorCode,
        p_retryable: outcome.retryable,
      });
      failed += 1;
    }
  }

  return {
    ok: true,
    summary: {
      workerRunId: input.workerRunId,
      channel: input.channel,
      claimed: jobs.data.length,
      suppressed: (claim as { suppressed?: number }).suppressed ?? 0,
      sent,
      failed,
    },
  };
}

// ── Document malware scanning ─────────────────────────────────────────────────────────────────────
export async function runDocumentScanDispatch(
  supabase: Client,
  input: { limit: number; workerRunId: string; stallMinutes: number },
): Promise<JobOutcome> {
  const scanner = getDocumentScanner();
  if (!scanner) {
    return {
      ok: false,
      status: 503,
      error: "No document scanner is configured. Set CRECY_DOCUMENT_SCAN_RELAY_URL and CRECY_DOCUMENT_SCAN_RELAY_SECRET.",
    };
  }

  const { error: sweepError } = await supabase.rpc("requeue_stalled_document_scans", { p_stall_minutes: input.stallMinutes });
  if (sweepError) return { ok: false, status: 422, error: "Stalled document scans could not be swept." };

  const { data: claim, error: claimError } = await supabase.rpc("claim_document_scan_jobs", {
    p_limit: input.limit,
    p_worker_run_id: input.workerRunId,
  });
  if (claimError || !claim) {
    const code = claimError?.message ?? "";
    if (code.includes("INVALID_SCAN_BATCH_SIZE")) return { ok: false, status: 422, error: "That batch size is outside the supported range." };
    if (code.includes("INVALID_WORKER_RUN_ID")) return { ok: false, status: 422, error: "A worker run ID of 8-200 characters is required." };
    return { ok: false, status: 422, error: "Document scan jobs could not be claimed." };
  }

  const jobs = claimedDocumentScanJobSchema.array().safeParse((claim as { jobs?: unknown }).jobs ?? []);
  if (!jobs.success) return { ok: false, status: 422, error: "The scan queue returned an unreadable job." };

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

  // Scanned with BOUNDED parallelism, then recorded sequentially. Sequential scanning made the run's
  // worst case (batch size x relay timeout) exceed any serverless duration budget, and a function
  // killed mid-run leaves every claimed job in 'scanning' until the stall sweep — so one timeout
  // stranded the whole batch. Bounded rather than unbounded because the relay is someone else's
  // service, and a cron that fans out arbitrarily wide causes the outage it was meant to survive.
  const scanned: { job: (typeof jobs.data)[number]; result: Awaited<ReturnType<typeof scanner.scan>> }[] = [];
  for (let offset = 0; offset < jobs.data.length; offset += SCAN_WORKER_CONCURRENCY) {
    const wave = jobs.data.slice(offset, offset + SCAN_WORKER_CONCURRENCY);
    const results = await Promise.all(wave.map((job) => scanner.scan(
      { documentScanJobId: job.documentScanJobId, storageBucket: job.storageBucket, storagePath: job.storagePath },
      source,
    )));
    wave.forEach((job, index) => scanned.push({ job, result: results[index] }));
  }

  for (const { job, result } of scanned) {
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

  return { ok: true, summary: { workerRunId: input.workerRunId, claimed: jobs.data.length, cleaned, rejected, failed } };
}

// ── Recurring rent generation, per property time zone ─────────────────────────────────────────────
/**
 * The scheduler never invents a run date. list_due_charge_schedule_batches partitions due schedules by
 * their property's own time zone, derives the operational date in each, and returns a worker-run id
 * derived from (zone, local date, exact schedule set) — so a repeated or overlapping invocation replays
 * rather than double-charging. Each batch is then handed to the existing, proven command unchanged.
 */
export async function runRecurringChargeGeneration(
  supabase: Client,
  input: { limit: number },
): Promise<JobOutcome> {
  const { data: due, error: dueError } = await supabase.rpc("list_due_charge_schedule_batches", {
    p_at: new Date().toISOString(),
    p_limit: input.limit,
  });
  if (dueError || !due) {
    if ((dueError?.message ?? "").includes("INVALID_SCHEDULE_BATCH_SIZE")) {
      return { ok: false, status: 422, error: "That batch size is outside the supported range." };
    }
    return { ok: false, status: 422, error: "Due charge schedules could not be evaluated." };
  }

  const evaluated = due as {
    evaluatedAt: string;
    batches?: { timeZone: string; localDate: string; workerRunId: string; scheduleIds: string[] }[];
    invalidTimeZones?: string[];
    blockedSchedules?: { scheduleId: string; timeZone: string; reason: string }[];
  };
  const batches = evaluated.batches ?? [];

  let generated = 0;
  let replayed = 0;
  const failures: { timeZone: string; error: string }[] = [];
  for (const batch of batches) {
    const { data, error } = await supabase.rpc("generate_recurring_charges", {
      p_run_date: batch.localDate,
      p_schedule_ids: batch.scheduleIds,
      p_worker_run_id: batch.workerRunId,
    });
    if (error || !data) {
      // One zone failing must not stop the others: a misconfigured book in Denver cannot be allowed to
      // hold up rent in every other market. The failure is reported, not swallowed.
      failures.push({ timeZone: batch.timeZone, error: error?.message ?? "GENERATION_FAILED" });
      continue;
    }
    const result = data as { generatedCount?: number; replayed?: boolean };
    if (result.replayed) replayed += 1;
    else generated += result.generatedCount ?? 0;
  }

  return {
    ok: true,
    summary: {
      evaluatedAt: evaluated.evaluatedAt,
      zonesDue: batches.length,
      generatedCharges: generated,
      replayedBatches: replayed,
      failedBatches: failures,
      invalidTimeZones: evaluated.invalidTimeZones ?? [],
      // Schedules the command would refuse (closed book, inactive receivable, currency mismatch).
      // They are excluded from their batch on purpose: carrying one in would roll back every healthy
      // schedule beside it, because generate_recurring_charges raises from inside its loop.
      blockedSchedules: evaluated.blockedSchedules ?? [],
    },
  };
}

// ── Stale operational state ───────────────────────────────────────────────────────────────────────
export async function runOperationalSweep(supabase: Client, input: { limit: number }): Promise<JobOutcome> {
  const { data, error } = await supabase.rpc("sweep_expired_operational_records", { p_limit: input.limit });
  if (error || !data) {
    if ((error?.message ?? "").includes("INVALID_SWEEP_LIMIT")) {
      return { ok: false, status: 422, error: "That sweep limit is outside the supported range." };
    }
    return { ok: false, status: 422, error: "Expired operational records could not be swept." };
  }
  return { ok: true, summary: data as Record<string, unknown> };
}
