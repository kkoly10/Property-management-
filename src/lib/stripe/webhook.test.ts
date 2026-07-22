import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { sanitizeStripeWebhookEvent, verifyStripeWebhook } from "@/lib/stripe/webhook";

const endpointSecret = "whsec_crecy_unit_test";
const stripe = new Stripe("sk_test_crecy_unit_test");

function signedEvent(overrides: Record<string, unknown> = {}) {
  const payload = JSON.stringify({
    id: "evt_crecy_success_001",
    object: "event",
    account: "acct_crecy_operator_001",
    api_version: "2026-06-30.basil",
    created: 1_785_000_000,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_crecy_payment_001",
        object: "payment_intent",
        amount: 50_000,
        amount_received: 50_000,
        currency: "usd",
        status: "succeeded",
        latest_charge: "ch_crecy_charge_001",
        last_payment_error: null,
        metadata: {
          crecy_organization_id: "10000000-0000-4000-8000-000000000001",
          crecy_payment_id: "20000000-0000-4000-8000-000000000002",
          crecy_payment_attempt_id: "30000000-0000-4000-8000-000000000003",
        },
      },
    },
    ...overrides,
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: endpointSecret });
  return { payload, signature };
}

describe("Stripe Connect webhook verification", () => {
  it("verifies the raw body and retains only canonical payment fields", () => {
    const { payload, signature } = signedEvent();
    const event = verifyStripeWebhook(payload, signature, endpointSecret);

    expect(event.account).toBe("acct_crecy_operator_001");
    expect(sanitizeStripeWebhookEvent(event)).toEqual({
      objectId: "pi_crecy_payment_001",
      organizationId: "10000000-0000-4000-8000-000000000001",
      paymentId: "20000000-0000-4000-8000-000000000002",
      paymentAttemptId: "30000000-0000-4000-8000-000000000003",
      paymentIntentId: "pi_crecy_payment_001",
      chargeId: "ch_crecy_charge_001",
      amountMinor: 50_000,
      currencyCode: "USD",
      providerStatus: "succeeded",
      failureCode: undefined,
    });
  });

  it("rejects a changed payload with the original signature", () => {
    const { payload, signature } = signedEvent();
    expect(() => verifyStripeWebhook(payload.replace("50000", "50001"), signature, endpointSecret)).toThrow();
  });

  it("sanitizes refund events to provider state and Crecy metadata", () => {
    const event = {
      type: "refund.updated",
      data: { object: {
        id: "re_crecy_refund_001",
        object: "refund",
        amount: 20_000,
        currency: "usd",
        status: "pending",
        charge: "ch_crecy_charge_001",
        payment_intent: "pi_crecy_payment_001",
        failure_reason: null,
        metadata: {
          crecy_organization_id: "10000000-0000-4000-8000-000000000001",
          crecy_payment_id: "20000000-0000-4000-8000-000000000002",
          crecy_refund_id: "30000000-0000-4000-8000-000000000003",
        },
      } },
    } as unknown as Stripe.Event;

    expect(sanitizeStripeWebhookEvent(event)).toMatchObject({
      providerRefundId: "re_crecy_refund_001",
      refundId: "30000000-0000-4000-8000-000000000003",
      paymentId: "20000000-0000-4000-8000-000000000002",
      amountMinor: 20_000,
      currencyCode: "USD",
      providerStatus: "pending",
    });
  });
});
