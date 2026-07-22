import { describe, expect, it } from "vitest";
import { buildDirectChargeCheckoutRequest } from "@/lib/stripe/checkout";

describe("buildDirectChargeCheckoutRequest", () => {
  it("builds a direct connected-account Checkout without a resident surcharge", () => {
    const { params, options } = buildDirectChargeCheckoutRequest({
      providerAccountId: "acct_testOperator",
      organizationId: "10000000-0000-4000-8000-000000000001",
      tenancyId: "20000000-0000-4000-8000-000000000002",
      paymentId: "30000000-0000-4000-8000-000000000003",
      paymentAttemptId: "40000000-0000-4000-8000-000000000004",
      propertyName: "Maple Court",
      unitCode: "101",
      amountMinor: 50000,
      currencyCode: "USD",
      providerMethodCode: "us_bank_account",
      returnUrl: "https://app.crecy.example/payments/new?from=home",
      expiresAt: "2026-07-22T15:00:00.000Z",
      idempotencyKey: "resident-session-0001",
    });

    expect(options.stripeAccount).toBe("acct_testOperator");
    expect(options.idempotencyKey).toBe("crecy-resident-checkout:resident-session-0001");
    expect(params.payment_method_types).toEqual(["us_bank_account"]);
    expect(params.line_items?.[0]?.price_data?.unit_amount).toBe(50000);
    expect(params.payment_intent_data).not.toHaveProperty("application_fee_amount");
    expect(params.payment_intent_data?.metadata?.crecy_payment_attempt_id).toBe("40000000-0000-4000-8000-000000000004");
    expect(params.success_url).toContain("payment=returned");
    expect(params.success_url).toContain("checkout_session_id={CHECKOUT_SESSION_ID}");
    expect(params.cancel_url).toContain("payment=canceled");
  });
});
