import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNotificationTransport } from "@/lib/notifications/transport";
import { hasTemplate, renderNotification } from "@/lib/notifications/templates";
import { claimedNotificationJobSchema, dispatchNotificationsSchema } from "@/lib/validation/notification-worker";

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
 * One cron-able worker run: recover claims abandoned by a crashed worker, claim a batch of due jobs,
 * send each through the configured relay, and record the per-job outcome. Every claimed job is
 * resolved exactly once — a job left neither completed nor failed would sit in 'processing' until the
 * stall sweep, so failures inside the loop are reported to the database, never swallowed.
 */
export async function POST(request: Request) {
  if (!hasValidWorkerCredential(request)) return unauthorized();

  const parsed = dispatchNotificationsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the worker run details." }, { status: 400 });
  }
  const { channel, limit, workerRunId, stallMinutes } = parsed.data;

  const transport = getNotificationTransport();
  if (!transport) {
    return NextResponse.json(
      { error: "No notification relay is configured. Set CRECY_NOTIFICATION_RELAY_URL and CRECY_NOTIFICATION_RELAY_SECRET." },
      { status: 503 },
    );
  }

  const supabase = createAdminClient();

  const { error: sweepError } = await supabase.rpc("requeue_stalled_notification_jobs", { p_stall_minutes: stallMinutes });
  if (sweepError) {
    return NextResponse.json({ error: "Stalled notification jobs could not be swept." }, { status: 422 });
  }

  const { data: claim, error: claimError } = await supabase.rpc("claim_notification_jobs", {
    p_channel: channel,
    p_limit: limit,
    p_worker_run_id: workerRunId,
  });
  if (claimError || !claim) {
    const code = claimError?.message ?? "";
    if (code.includes("INVALID_NOTIFICATION_CHANNEL")) return NextResponse.json({ error: "That notification channel is not supported." }, { status: 422 });
    if (code.includes("INVALID_NOTIFICATION_BATCH_SIZE")) return NextResponse.json({ error: "That batch size is outside the supported range." }, { status: 422 });
    if (code.includes("INVALID_WORKER_RUN_ID")) return NextResponse.json({ error: "A worker run ID of 8-200 characters is required." }, { status: 422 });
    return NextResponse.json({ error: "Notification jobs could not be claimed." }, { status: 422 });
  }

  const jobs = claimedNotificationJobSchema.array().safeParse((claim as { jobs?: unknown }).jobs ?? []);
  if (!jobs.success) {
    return NextResponse.json({ error: "The notification queue returned an unreadable job." }, { status: 422 });
  }

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
      const rendered = renderNotification({ templateCode: job.templateCode, locale: job.locale, payload: job.payload });
      outcome = rendered
        ? await transport.send({
            notificationJobId: job.notificationJobId,
            channel: job.channel,
            to: job.recipientAddress,
            locale: job.locale,
            templateCode: job.templateCode,
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

  return NextResponse.json({
    workerRunId,
    channel,
    claimed: jobs.data.length,
    suppressed: (claim as { suppressed?: number }).suppressed ?? 0,
    sent,
    failed,
  });
}
