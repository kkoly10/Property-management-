import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  createDirectChargeRefund,
  StripeConnectConfigurationError,
  StripeRefundDefinitiveError,
} from "@/lib/stripe/connect";
import { refundPaymentSchema } from "@/lib/validation/finance";

const errorResponse = (code: string, message: string, status: number) =>
  NextResponse.json({ error: message, code }, { status });

type RefundResult = {
  paymentId: string;
  refundId: string;
  refundStatus: "requested" | "pending" | "succeeded" | "failed";
  paymentStatus: string;
  correctiveJournalTransactionId: string | null;
  failureCode?: string;
};

type RefundContext = {
  refundId: string;
  paymentId: string;
  organizationId: string;
  amountMinor: number;
  providerAccountId: string;
  providerChargeId: string;
  idempotencyKey: string;
};

function requestDatabaseError(message: string) {
  if (message.includes("PROPERTY_SCOPE_DENIED")) return errorResponse("FORBIDDEN", "You do not have finance access for this property.", 403);
  if (message.includes("PAYMENT_NOT_FOUND")) return errorResponse("PAYMENT_NOT_FOUND", "The payment was not found.", 404);
  if (message.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("IDEMPOTENCY_CONFLICT", "This retry no longer matches the original refund.", 409);
  if (message.includes("PAYMENT_STATUS_CONFLICT") || message.includes("PAYMENT_VERSION_CONFLICT")) return errorResponse("PAYMENT_CHANGED", "This payment changed after you opened it. Refresh before refunding it.", 409);
  if (message.includes("PAYMENT_OVERREFUNDED")) return errorResponse("REFUND_EXCEEDS_AVAILABLE", "The refund exceeds the remaining refundable amount.", 422);
  if (message.includes("MANUAL_PAYMENT_REQUIRES_CORRECTION")) return errorResponse("MANUAL_PAYMENT", "Manual payments must use the correction workflow.", 422);
  if (message.includes("PAYMENT_NOT_REFUNDABLE") || message.includes("PROVIDER_PAYMENT_REFERENCE_MISSING")) return errorResponse("PAYMENT_NOT_REFUNDABLE", "This provider payment cannot be refunded from Crecy.", 422);
  return errorResponse("REFUND_UNAVAILABLE", "The refund could not be reserved safely.", 503);
}

export async function POST(request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const parsed = refundPaymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Check the refund details.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("AUTHENTICATION_REQUIRED", "Sign in to refund a payment.", 401);

  const refund = parsed.data;
  const requested = await supabase.rpc("request_provider_refund", {
    p_payment_id: paymentId,
    p_amount_minor: refund.amountMinor,
    p_reason: refund.reason,
    p_expected_status: refund.expectedStatus,
    p_expected_version: refund.expectedVersion,
    p_idempotency_key: refund.idempotencyKey,
  });
  if (requested.error || !requested.data) return requestDatabaseError(requested.error?.message ?? "REFUND_UNAVAILABLE");

  const reserved = requested.data as RefundResult;
  if (reserved.refundStatus === "succeeded") return NextResponse.json(reserved, { status: 200 });
  if (reserved.refundStatus === "failed") return errorResponse(reserved.failureCode ?? "PROVIDER_REFUND_FAILED", "Stripe could not complete this refund.", 422);

  const admin = createAdminClient();
  const contextResult = await admin.rpc("get_provider_refund_context", {
    p_refund_id: reserved.refundId,
    p_actor_user_id: auth.user.id,
  });
  if (contextResult.error || !contextResult.data) {
    return errorResponse("REFUND_UNAVAILABLE", "The reserved refund could not be sent to Stripe.", 503);
  }
  const context = contextResult.data as RefundContext;

  try {
    const provider = await createDirectChargeRefund({
      providerAccountId: context.providerAccountId,
      providerChargeId: context.providerChargeId,
      organizationId: context.organizationId,
      paymentId: context.paymentId,
      refundId: context.refundId,
      amountMinor: context.amountMinor,
      idempotencyKey: context.idempotencyKey,
    });
    const completed = await admin.rpc("complete_provider_refund", {
      p_refund_id: context.refundId,
      p_provider_refund_id: provider.providerRefundId,
      p_provider_status: provider.providerStatus,
      p_failure_code: provider.failureCode,
      p_failure_detail: provider.failureDetail,
      p_provider_created_at: provider.providerCreatedAt,
    });
    if (completed.error || !completed.data) {
      return errorResponse("REFUND_CONFIRMATION_PENDING", "Stripe accepted the request, but Crecy has not confirmed its final state yet.", 503);
    }
    const result = completed.data as RefundResult;
    if (result.refundStatus === "failed") return errorResponse(result.failureCode ?? "PROVIDER_REFUND_FAILED", "Stripe could not complete this refund.", 422);
    return NextResponse.json(result, { status: result.refundStatus === "pending" ? 202 : 200 });
  } catch (error) {
    if (error instanceof StripeRefundDefinitiveError) {
      const failed = await admin.rpc("complete_provider_refund", {
        p_refund_id: context.refundId,
        p_provider_refund_id: null,
        p_provider_status: "failed",
        p_failure_code: error.code,
        p_failure_detail: error.message,
        p_provider_created_at: new Date().toISOString(),
      });
      const result = failed.data as RefundResult | null;
      return errorResponse(result?.failureCode ?? error.code, "Stripe rejected this refund before any financial history was changed.", 422);
    }
    const message = error instanceof StripeConnectConfigurationError
      ? "Stripe is not configured for this environment."
      : "Stripe did not confirm whether the refund was created. Retry with the same request.";
    return errorResponse("PROVIDER_UNAVAILABLE", message, 503);
  }
}
