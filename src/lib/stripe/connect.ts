import "server-only";

import Stripe from "stripe";
import { buildDirectChargeCheckoutRequest, type DirectChargeCheckoutInput } from "@/lib/stripe/checkout";
import { buildDirectChargeRefundRequest, normalizeStripeRefundStatus, type DirectChargeRefundInput } from "@/lib/stripe/refund";
import { snapshotStripeAccount } from "@/lib/stripe/snapshot";

let client: Stripe | null = null;

export class StripeConnectConfigurationError extends Error {}
export class StripeRefundDefinitiveError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || secretKey.includes("replace_me")) {
    throw new StripeConnectConfigurationError("STRIPE_SECRET_KEY is not configured.");
  }
  client ??= new Stripe(secretKey, { appInfo: { name: "Crecy", version: "0.1.0" } });
  return client;
}

export async function getOrCreateStandardAccount(input: {
  organizationId: string;
  operatingEntityId: string;
  entityDisplayName: string;
  countryCode: string;
  existingProviderAccountId?: string | null;
}) {
  const stripe = getStripeClient();
  const account = input.existingProviderAccountId
    ? await stripe.accounts.retrieve(input.existingProviderAccountId)
    : await stripe.accounts.create({
        type: "standard",
        country: input.countryCode,
        business_profile: { name: input.entityDisplayName },
        metadata: {
          crecy_organization_id: input.organizationId,
          crecy_operating_entity_id: input.operatingEntityId,
        },
      }, { idempotencyKey: `crecy-connect-account:${input.organizationId}:${input.operatingEntityId}` });

  if ("deleted" in account && account.deleted) throw new Error("The connected Stripe account is unavailable.");
  if (account.type !== "standard") throw new Error("The Stripe account does not use the required Standard configuration.");
  return snapshotStripeAccount(account);
}

export async function createStandardAccountOnboardingLink(input: {
  providerAccountId: string;
  returnUrl: string;
  refreshUrl: string;
  idempotencyKey: string;
}) {
  const link = await getStripeClient().accountLinks.create({
    account: input.providerAccountId,
    type: "account_onboarding",
    return_url: input.returnUrl,
    refresh_url: input.refreshUrl,
    collection_options: { fields: "currently_due" },
  }, { idempotencyKey: `crecy-connect-link:${input.idempotencyKey}` });

  return { url: link.url, expiresAt: new Date(link.expires_at * 1000).toISOString() };
}

export async function createDirectChargeCheckoutSession(input: DirectChargeCheckoutInput) {
  const { params, options } = buildDirectChargeCheckoutRequest(input);
  const session = await getStripeClient().checkout.sessions.create(params, options);

  if (!session.url) throw new Error("Stripe did not return a hosted Checkout URL.");
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  return {
    providerCheckoutSessionId: session.id,
    providerPaymentIntentId: paymentIntentId,
    providerStatus: session.status ?? "open",
    checkoutUrl: session.url,
    expiresAt: new Date(session.expires_at * 1000).toISOString(),
  };
}

export async function createDirectChargeRefund(input: DirectChargeRefundInput) {
  const { params, options } = buildDirectChargeRefundRequest(input);
  try {
    const refund = await getStripeClient().refunds.create(params, options);
    return {
      providerRefundId: refund.id,
      providerStatus: normalizeStripeRefundStatus(refund.status),
      failureCode: refund.failure_reason ?? null,
      failureDetail: refund.failure_reason ? `Stripe refund failed: ${refund.failure_reason}` : null,
      providerCreatedAt: new Date(refund.created * 1000).toISOString(),
    };
  } catch (error) {
    const stripeError = error as Stripe.errors.StripeError;
    if (stripeError?.type === "StripeCardError" || stripeError?.type === "StripeInvalidRequestError") {
      throw new StripeRefundDefinitiveError(stripeError.code ?? stripeError.type, stripeError.message);
    }
    throw error;
  }
}
