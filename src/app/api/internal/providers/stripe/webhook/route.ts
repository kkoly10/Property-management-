import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeStripeWebhookEvent, verifyStripeWebhook } from "@/lib/stripe/webhook";

const errorResponse = (code: string, message: string, status: number) =>
  NextResponse.json({ error: message, code }, { status });

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!endpointSecret || endpointSecret.includes("replace_me")) {
    return errorResponse("WEBHOOK_NOT_CONFIGURED", "Stripe webhook processing is unavailable.", 503);
  }
  if (!signature) return errorResponse("SIGNATURE_REQUIRED", "The Stripe signature is missing.", 400);

  const rawBody = await request.text();
  if (!rawBody || rawBody.length > 1_000_000) {
    return errorResponse("INVALID_PAYLOAD", "The Stripe event body is invalid.", 400);
  }

  let event;
  try {
    event = verifyStripeWebhook(rawBody, signature, endpointSecret);
  } catch {
    return errorResponse("INVALID_SIGNATURE", "The Stripe event signature is invalid.", 400);
  }
  if (!event.account || !/^acct_[A-Za-z0-9]+$/.test(event.account)) {
    return errorResponse("CONNECTED_ACCOUNT_REQUIRED", "A connected Stripe account is required.", 400);
  }

  const refundEvent = event.type === "refund.created" || event.type === "refund.updated" || event.type === "refund.failed";
  const result = await createAdminClient().rpc(refundEvent ? "process_stripe_refund_webhook" : "process_stripe_webhook", {
    p_provider_event_id: event.id,
    p_provider_account_id: event.account,
    p_payload_sha256: createHash("sha256").update(rawBody).digest("hex"),
    p_event_type: event.type,
    p_provider_created_at: new Date(event.created * 1000).toISOString(),
    p_livemode: event.livemode,
    p_event_data: sanitizeStripeWebhookEvent(event),
  });
  if (result.error || !result.data) {
    return errorResponse("WEBHOOK_PROCESSING_FAILED", "The signed Stripe event could not be processed.", 500);
  }

  const response = result.data as { outcome?: string; errorCode?: string };
  if (response.outcome === "failed") {
    const permanent = [
      "EVENT_REPLAY_MISMATCH",
      "PROVIDER_ACCOUNT_MISMATCH",
      "INVALID_PROVIDER_OBJECT",
      "PROVIDER_METADATA_MISMATCH",
      "INVALID_SUCCESS_EVENT",
      "PAYMENT_VALUE_MISMATCH",
      "PAYMENT_TERMINAL_STATE",
      "ALLOCATION_TOTAL_MISMATCH",
      "INVALID_PROVIDER_REFUND_OBJECT",
      "PROVIDER_REFUND_METADATA_MISMATCH",
    ].includes(response.errorCode ?? "");
    return errorResponse(
      response.errorCode ?? "WEBHOOK_PROCESSING_FAILED",
      "The signed Stripe event could not be applied.",
      permanent ? 400 : 500,
    );
  }
  return NextResponse.json(response, { status: 200 });
}
