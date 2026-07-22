import type Stripe from "stripe";

export type DirectChargeRefundInput = {
  providerAccountId: string;
  providerChargeId: string;
  organizationId: string;
  paymentId: string;
  refundId: string;
  amountMinor: number;
  idempotencyKey: string;
};

export function buildDirectChargeRefundRequest(input: DirectChargeRefundInput): {
  params: Stripe.RefundCreateParams;
  options: Stripe.RequestOptions;
} {
  return {
    params: {
      charge: input.providerChargeId,
      amount: input.amountMinor,
      metadata: {
        crecy_organization_id: input.organizationId,
        crecy_payment_id: input.paymentId,
        crecy_refund_id: input.refundId,
      },
    },
    options: {
      stripeAccount: input.providerAccountId,
      idempotencyKey: input.idempotencyKey,
    },
  };
}

export function normalizeStripeRefundStatus(status: Stripe.Refund["status"]) {
  if (status === "succeeded") return "succeeded" as const;
  if (status === "failed" || status === "canceled") return "failed" as const;
  return "pending" as const;
}
