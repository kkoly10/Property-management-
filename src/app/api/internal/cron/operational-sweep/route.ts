import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasValidCronCredential } from "@/lib/runtime/worker-auth";
import { runOperationalSweep } from "@/lib/runtime/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily housekeeping: expire abandoned upload grants and purge idempotency records past their TTL. */
export async function GET(request: Request) {
  if (!hasValidCronCredential(request)) {
    return NextResponse.json({ error: "A valid scheduler credential is required." }, { status: 401 });
  }
  const result = await runOperationalSweep(createAdminClient(), { limit: 1000 });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.summary);
}
