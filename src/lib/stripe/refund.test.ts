import { describe, expect, it } from "vitest";
import { buildDirectChargeRefundRequest, normalizeStripeRefundStatus } from "@/lib/stripe/refund";

describe("Stripe direct-charge refunds", () => {
  it("scopes the refund to the connected account and stable Crecy identifiers", () => {
    const { params, options } = buildDirectChargeRefundRequest({
      providerAccountId: "acct_testOperator",
      providerChargeId: "ch_testPayment",
      organizationId: "10000000-0000-4000-8000-000000000001",
      paymentId: "20000000-0000-4000-8000-000000000002",
      refundId: "30000000-0000-4000-8000-000000000003",
      amountMinor: 20_000,
      idempotencyKey: "crecy-provider-refund:30000000-0000-4000-8000-000000000003",
    });

    expect(options).toEqual({
      stripeAccount: "acct_testOperator",
      idempotencyKey: "crecy-provider-refund:30000000-0000-4000-8000-000000000003",
    });
    expect(params).toMatchObject({
      charge: "ch_testPayment",
      amount: 20_000,
      metadata: {
        crecy_organization_id: "10000000-0000-4000-8000-000000000001",
        crecy_payment_id: "20000000-0000-4000-8000-000000000002",
        crecy_refund_id: "30000000-0000-4000-8000-000000000003",
      },
    });
    expect(params).not.toHaveProperty("refund_application_fee");
  });

  it("maps provider terminal and delayed states without premature success", () => {
    expect(normalizeStripeRefundStatus("succeeded")).toBe("succeeded");
    expect(normalizeStripeRefundStatus("failed")).toBe("failed");
    expect(normalizeStripeRefundStatus("canceled")).toBe("failed");
    expect(normalizeStripeRefundStatus("pending")).toBe("pending");
    expect(normalizeStripeRefundStatus("requires_action")).toBe("pending");
  });
});
