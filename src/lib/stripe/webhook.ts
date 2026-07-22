import Stripe from "stripe";

export type StripeWebhookEventData = {
  objectId?: string;
  organizationId?: string;
  paymentId?: string;
  paymentAttemptId?: string;
  refundId?: string;
  paymentIntentId?: string;
  checkoutSessionId?: string;
  chargeId?: string;
  providerRefundId?: string;
  amountMinor?: number;
  currencyCode?: string;
  providerStatus?: string;
  failureCode?: string;
  failureDetail?: string;
};

const webhookVerifier = new Stripe("sk_test_crecy_webhook_verifier", {
  appInfo: { name: "Crecy", version: "0.1.0" },
});

export function verifyStripeWebhook(rawBody: string, signature: string, endpointSecret: string) {
  return webhookVerifier.webhooks.constructEvent(rawBody, signature, endpointSecret);
}

function metadataFields(metadata: Stripe.Metadata | null | undefined) {
  return {
    organizationId: metadata?.crecy_organization_id,
    paymentId: metadata?.crecy_payment_id,
    paymentAttemptId: metadata?.crecy_payment_attempt_id,
  };
}

function referencedId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}

export function sanitizeStripeWebhookEvent(event: Stripe.Event): StripeWebhookEventData {
  if (event.type.startsWith("payment_intent.")) {
    const intent = event.data.object as Stripe.PaymentIntent;
    return {
      objectId: intent.id,
      ...metadataFields(intent.metadata),
      paymentIntentId: intent.id,
      chargeId: referencedId(intent.latest_charge),
      amountMinor: intent.amount_received || intent.amount,
      currencyCode: intent.currency?.toUpperCase(),
      providerStatus: intent.status,
      failureCode: intent.last_payment_error?.code,
    };
  }

  if (event.type.startsWith("checkout.session.")) {
    const session = event.data.object as Stripe.Checkout.Session;
    return {
      objectId: session.id,
      ...metadataFields(session.metadata),
      paymentIntentId: referencedId(session.payment_intent),
      checkoutSessionId: session.id,
      amountMinor: session.amount_total ?? undefined,
      currencyCode: session.currency?.toUpperCase(),
      providerStatus: session.status ?? undefined,
    };
  }

  if (event.type.startsWith("refund.")) {
    const refund = event.data.object as Stripe.Refund;
    return {
      objectId: refund.id,
      organizationId: refund.metadata?.crecy_organization_id,
      paymentId: refund.metadata?.crecy_payment_id,
      refundId: refund.metadata?.crecy_refund_id,
      providerRefundId: refund.id,
      paymentIntentId: referencedId(refund.payment_intent),
      chargeId: referencedId(refund.charge),
      amountMinor: refund.amount,
      currencyCode: refund.currency?.toUpperCase(),
      providerStatus: refund.status ?? undefined,
      failureCode: refund.failure_reason ?? undefined,
      failureDetail: refund.failure_reason ? `Stripe refund failed: ${refund.failure_reason}` : undefined,
    };
  }

  const object = event.data.object as { id?: string };
  return { objectId: object.id };
}
