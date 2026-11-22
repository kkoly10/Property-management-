import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasValidCronCredential } from "@/lib/runtime/worker-auth";
import { runOperationalSweep } from "@/lib/runtime/jobs";
import { recordScheduledRun } from "@/lib/runtime/heartbeat";
import { getPlatformStripeConfig } from "@/lib/billing/platform-stripe";
import { billingUsageSummarySchema } from "@/lib/billing/platform-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily housekeeping and active-unit usage observation for the billing sandbox. */
export async function GET(request: Request) {
  if (!hasValidCronCredential(request)) {
    return NextResponse.json({ error: "A valid scheduler credential is required." }, { status: 401 });
  }
  return recordScheduledRun(createAdminClient(), "operational-sweep", async (supabase) => {
    const result = await runOperationalSweep(supabase, { limit: 1000 });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const billing = getPlatformStripeConfig();
    if (!billing) return NextResponse.json(result.summary);
    const sampled = await supabase.rpc("sample_platform_billing_usage", { p_stripe_account_id: billing.account, p_limit: 1000 });
    const summary = billingUsageSummarySchema.safeParse(sampled.data);
    if (sampled.error || !summary.success) return NextResponse.json({ error: "Platform billing usage could not be sampled." }, { status: 503 });
    return NextResponse.json({ ...result.summary, platformBillingUsage: summary.data }, { status: summary.data.hasMore ? 503 : 200 });
  });
}
