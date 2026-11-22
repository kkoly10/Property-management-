import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { billingClaimSchema } from "@/lib/billing/platform-contract";
import { billingJson, billingUnavailable } from "@/lib/billing/platform-http";
import { billingAttemptId, fetchSubscriptionSnapshot, getPlatformStripeConfig, platformStripe, stripeObjectId, verifyPlatformStripeAccount } from "@/lib/billing/platform-stripe";

export const runtime = "nodejs";
const maxBodyBytes = 1024 * 1024;

function subscriptionTarget(event: Stripe.Event) {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      return { subscriptionId: event.data.object.id, attemptId: billingAttemptId(event.data.object.metadata) };
    case "invoice.paid":
    case "invoice.payment_failed": {
      const details = event.data.object.parent?.subscription_details;
      return { subscriptionId: stripeObjectId(details?.subscription), attemptId: billingAttemptId(details?.metadata) };
    }
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object;
      const attemptId = billingAttemptId(session.metadata);
      if (session.mode !== "subscription" || attemptId !== session.client_reference_id) return null;
      return { subscriptionId: stripeObjectId(session.subscription), attemptId };
    }
    default:
      return null;
  }
}

export async function POST(request: Request) {
  const config = getPlatformStripeConfig();
  if (!config) return billingUnavailable();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return billingJson({ error: "Invalid Stripe signature." }, 400);
  const stripe = platformStripe(config);
  let event: Stripe.Event;
  try {
    if (Number(request.headers.get("content-length")) > maxBodyBytes) return billingJson({ error: "Request body is too large." }, 413);
    const payload = await request.text();
    if (Buffer.byteLength(payload) > maxBodyBytes) return billingJson({ error: "Request body is too large." }, 413);
    event = stripe.webhooks.constructEvent(payload, signature, config.secret);
  } catch {
    return billingJson({ error: "Invalid Stripe signature." }, 400);
  }

  if (event.livemode !== false || event.account || event.context) {
    return billingJson({ error: "Unexpected Stripe billing event scope." }, 400);
  }
  if (event.api_version !== stripe.getApiField("version")) {
    return billingJson({ error: "Unexpected Stripe billing event version." }, 400);
  }

  try {
    if (event.type === "checkout.session.expired") {
      const session = event.data.object;
      const attemptId = billingAttemptId(session.metadata);
      if (attemptId && session.client_reference_id === attemptId && session.mode === "subscription"
        && session.status === "expired" && session.livemode === false) {
        const result = await createAdminClient().rpc("record_platform_billing_checkout", {
          p_attempt_id: attemptId, p_stripe_account_id: config.account, p_stripe_session_id: session.id, p_expired: true,
        });
        if (result.error) return billingUnavailable();
      }
      return billingJson({ received: true });
    }
    const target = subscriptionTarget(event);
    if (!target?.subscriptionId) return billingJson({ received: true });
    const admin = createAdminClient();
    const claimed = await admin.rpc("claim_platform_billing_event", {
      p_stripe_account_id: config.account,
      p_event_id: event.id,
      p_event_type: event.type,
      p_stripe_subscription_id: target.subscriptionId,
      p_attempt_id: target.attemptId,
    });
    if (claimed.error) return billingUnavailable();
    if (!claimed.data) return billingJson({ received: true });
    const claim = billingClaimSchema.parse(claimed.data);
    await verifyPlatformStripeAccount(stripe, config);
    const snapshot = await fetchSubscriptionSnapshot(stripe, target.subscriptionId, claim);
    const applied = await admin.rpc("apply_platform_billing_event", {
      p_stripe_account_id: config.account,
      p_event_id: event.id,
      p_attempt_id: claim.attemptId,
      p_generation: claim.generation,
      p_stripe_subscription_id: target.subscriptionId,
      p_customer_id: snapshot.customerId,
      p_price_id: claim.priceId,
      p_provider_status: snapshot.status,
      p_paid: snapshot.paid,
      p_period_start: snapshot.periodStart,
      p_period_end: snapshot.periodEnd,
      p_cancel_at_period_end: snapshot.cancelAtPeriodEnd,
    });
    return !applied.error && applied.data === true ? billingJson({ received: true }) : billingUnavailable();
  } catch {
    return billingUnavailable();
  }
}
