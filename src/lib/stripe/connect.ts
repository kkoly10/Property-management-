import "server-only";

import Stripe from "stripe";
import { snapshotStripeAccount } from "@/lib/stripe/snapshot";

let client: Stripe | null = null;

export class StripeConnectConfigurationError extends Error {}

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
