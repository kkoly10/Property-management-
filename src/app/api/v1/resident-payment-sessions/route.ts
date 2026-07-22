import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createDirectChargeCheckoutSession, StripeConnectConfigurationError } from "@/lib/stripe/connect";
import { createResidentPaymentSessionSchema } from "@/lib/validation/finance";
import { isAllowedApplicationUrl } from "@/lib/validation/payment-connections";

const errorResponse = (code: string, message: string, status: number) => NextResponse.json({ error: message, code }, { status });

function databaseError(message: string) {
  if (message.includes("TENANCY_SCOPE_DENIED")) return errorResponse("FORBIDDEN", "This tenancy is unavailable for your resident account.", 403);
  if (message.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("IDEMPOTENCY_CONFLICT", "This retry no longer matches the original payment.", 409);
  if (message.includes("SESSION_PREPARATION_EXPIRED")) return errorResponse("SESSION_EXPIRED", "This checkout preparation expired. Start a new payment.", 409);
  if (message.includes("PAYMENT_CONNECTION_UNAVAILABLE")) return errorResponse("PAYMENT_CONNECTION_UNAVAILABLE", "Online payments are not available for this home yet.", 422);
  if (message.includes("PAYMENT_METHOD_UNAVAILABLE")) return errorResponse("PAYMENT_METHOD_UNAVAILABLE", "That payment method is not available for this home.", 422);
  if (message.includes("CURRENCY_MISMATCH")) return errorResponse("CURRENCY_MISMATCH", "The payment currency does not match this home.", 422);
  if (message.includes("ALLOCATION_TOTAL_MISMATCH")) return errorResponse("ALLOCATION_TOTAL_MISMATCH", "Allocate the full payment amount.", 422);
  if (message.includes("CHARGE_NOT_AVAILABLE") || message.includes("ALLOCATION_EXCEEDS_AVAILABLE")) return errorResponse("CHARGE_NOT_AVAILABLE", "A selected charge is already paid or reserved by another checkout.", 422);
  return errorResponse("SERVICE_UNAVAILABLE", "Checkout is temporarily unavailable. No payment was confirmed.", 503);
}

type PreparedPaymentSession = {
  paymentId: string;
  paymentAttemptId: string;
  organizationId: string;
  tenancyId: string;
  propertyName: string;
  unitCode: string;
  amountMinor: number;
  currencyCode: "USD" | "CAD" | "MXN";
  allocationPreference: { chargeId: string; amountMinor: number }[];
  methodPreference: "bank" | "card" | null;
  providerMethodCode: "card" | "us_bank_account" | "acss_debit";
  providerConnectionId: string;
  providerAccountId: string;
  returnUrl: string;
  expiresAt: string;
  replayResponse?: { paymentId: string; paymentAttemptId: string; providerAccountId: string; checkoutUrl: string; status: "pending" } | null;
};

export async function POST(request: Request) {
  const parsed = createResidentPaymentSessionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Check the payment details.", 400);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl || !isAllowedApplicationUrl(parsed.data.returnUrl, siteUrl)) {
    return errorResponse("INVALID_RETURN_URL", "Stripe can only return to the configured Crecy application.", 400);
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("AUTHENTICATION_REQUIRED", "Sign in to make a payment.", 401);

  const suppliedIdempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (suppliedIdempotencyKey && (suppliedIdempotencyKey.length < 8 || suppliedIdempotencyKey.length > 200)) {
    return errorResponse("INVALID_IDEMPOTENCY_KEY", "Use an idempotency key between 8 and 200 characters.", 400);
  }
  const idempotencyKey = suppliedIdempotencyKey || crypto.randomUUID();
  const payment = parsed.data;
  const prepared = await supabase.rpc("prepare_resident_payment_session", {
    p_tenancy_id: payment.tenancyId,
    p_amount_minor: payment.amountMinor,
    p_currency_code: payment.currencyCode,
    p_allocation_preference: payment.allocationPreference,
    p_method_preference: payment.methodPreference ?? null,
    p_return_url: payment.returnUrl,
    p_idempotency_key: idempotencyKey,
  });
  if (prepared.error || !prepared.data) return databaseError(prepared.error?.message ?? "SERVICE_UNAVAILABLE");

  const context = prepared.data as PreparedPaymentSession;
  if (context.replayResponse) return NextResponse.json(context.replayResponse, { status: 201 });
  if (!context.paymentId || !context.paymentAttemptId || !context.providerAccountId || !context.providerConnectionId) {
    return errorResponse("SERVICE_UNAVAILABLE", "The authorized payment could not be prepared.", 503);
  }

  try {
    const checkout = await createDirectChargeCheckoutSession({
      providerAccountId: context.providerAccountId,
      organizationId: context.organizationId,
      tenancyId: context.tenancyId,
      paymentId: context.paymentId,
      paymentAttemptId: context.paymentAttemptId,
      propertyName: context.propertyName,
      unitCode: context.unitCode,
      amountMinor: context.amountMinor,
      currencyCode: context.currencyCode,
      providerMethodCode: context.providerMethodCode,
      returnUrl: context.returnUrl,
      expiresAt: context.expiresAt,
      idempotencyKey,
    });
    const completed = await createAdminClient().rpc("complete_resident_payment_session", {
      p_actor_user_id: auth.user.id,
      p_organization_id: context.organizationId,
      p_payment_id: context.paymentId,
      p_payment_attempt_id: context.paymentAttemptId,
      p_tenancy_id: context.tenancyId,
      p_amount_minor: context.amountMinor,
      p_currency_code: context.currencyCode,
      p_allocation_preference: context.allocationPreference,
      p_method_preference: context.methodPreference,
      p_return_url: context.returnUrl,
      p_provider_connection_id: context.providerConnectionId,
      p_provider_account_id: context.providerAccountId,
      p_provider_checkout_session_id: checkout.providerCheckoutSessionId,
      p_provider_payment_intent_id: checkout.providerPaymentIntentId,
      p_provider_status: checkout.providerStatus,
      p_checkout_url: checkout.checkoutUrl,
      p_provider_expires_at: checkout.expiresAt,
      p_idempotency_key: idempotencyKey,
    });
    if (completed.error || !completed.data) {
      return databaseError(completed.error?.message ?? "SERVICE_UNAVAILABLE");
    }
    return NextResponse.json(completed.data, { status: 201 });
  } catch (error) {
    const message = error instanceof StripeConnectConfigurationError
      ? "Stripe is not configured for this environment."
      : "Checkout is temporarily unavailable. No payment was confirmed.";
    return errorResponse("SERVICE_UNAVAILABLE", message, 503);
  }
}
