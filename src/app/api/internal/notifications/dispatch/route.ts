import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasValidWorkerCredential } from "@/lib/runtime/worker-auth";
import { runNotificationDispatch } from "@/lib/runtime/jobs";
import { dispatchNotificationsSchema } from "@/lib/validation/notification-worker";

export const runtime = "nodejs";

/**
 * Manual/operator entry point for one notification worker run. The scheduled entry point is
 * /api/internal/cron/notifications; both call the same runner so a queue can never drift between them.
 */
export async function POST(request: Request) {
  if (!hasValidWorkerCredential(request)) {
    return NextResponse.json({ error: "A valid internal worker credential is required." }, { status: 401 });
  }

  const parsed = dispatchNotificationsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the worker run details." }, { status: 400 });
  }

  const result = await runNotificationDispatch(createAdminClient(), parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.summary);
}
