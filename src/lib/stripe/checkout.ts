import type Stripe from "stripe";

export type DirectChargeCheckoutInput = {
  providerAccountId: string;
  organizationId: string;
  tenancyId: string;
  paymentId: string;
  paymentAttemptId: string;
  propertyName: string;
  unitCode: string;
  amountMinor: number;
  currencyCode: "USD" | "CAD" | "MXN";
  providerMethodCode: "card" | "us_bank_account" | "acss_debit";
  returnUrl: string;
  expiresAt: string;
  idempotencyKey: string;
};

function checkoutReturnUrl(returnUrl: string, state: "returned" | "canceled") {
  const url = new URL(returnUrl);
  url.searchParams.set("payment", state);
  if (state === "returned") url.searchParams.set("checkout_session_id", "{CHECKOUT_SESSION_ID}");
  return url.toString().replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}");
}

export function buildDirectChargeCheckoutRequest(input: DirectChargeCheckoutInput): {
  params: Stripe.Checkout.SessionCreateParams;
  options: Stripe.RequestOptions;
} {
  const metadata = {
    crecy_organization_id: input.organizationId,
    crecy_tenancy_id: input.tenancyId,
    crecy_payment_id: input.paymentId,
    crecy_payment_attempt_id: input.paymentAttemptId,
  };
  return {
    params: {
      mode: "payment",
      client_reference_id: input.paymentId,
      customer_creation: "always",
      payment_method_types: [input.providerMethodCode],
      line_items: [{ quantity: 1, price_data: {
        currency: input.currencyCode.toLowerCase(),
        unit_amount: input.amountMinor,
        product_data: { name: `Rent payment · ${input.propertyName}, Unit ${input.unitCode}` },
      } }],
      metadata,
      payment_intent_data: { metadata, description: `Crecy rent payment ${input.paymentId}` },
      success_url: checkoutReturnUrl(input.returnUrl, "returned"),
      cancel_url: checkoutReturnUrl(input.returnUrl, "canceled"),
      expires_at: Math.floor(new Date(input.expiresAt).getTime() / 1000),
    },
    options: {
      stripeAccount: input.providerAccountId,
      idempotencyKey: `crecy-resident-checkout:${input.idempotencyKey}`,
    },
  };
}
