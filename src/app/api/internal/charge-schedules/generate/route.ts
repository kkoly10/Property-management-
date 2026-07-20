import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateRecurringChargesSchema } from "@/lib/validation/finance";

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

export async function POST(request: Request) {
  if (!hasValidWorkerCredential(request)) return unauthorized();
  const parsed = generateRecurringChargesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the worker run details." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("generate_recurring_charges", {
    p_run_date: parsed.data.runDate,
    p_schedule_ids: parsed.data.scheduleIds ?? null,
    p_worker_run_id: parsed.data.workerRunId,
  });
  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("WORKER_RUN_CONFLICT")) return NextResponse.json({ error: "This worker run ID was already used for another request." }, { status: 409 });
    if (code.includes("COMMAND_IN_PROGRESS")) return NextResponse.json({ error: "This worker run is already in progress." }, { status: 409 });
    if (code.includes("TENANCY_NOT_ACTIVE")) return NextResponse.json({ error: "A due schedule belongs to a tenancy that is not active." }, { status: 422 });
    return NextResponse.json({ error: "Recurring charges could not be generated; the transaction was rolled back." }, { status: 422 });
  }
  return NextResponse.json(data);
}
