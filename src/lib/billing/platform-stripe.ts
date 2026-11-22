import "server-only";
import Stripe from "stripe";
import { z } from "zod";
import { PRICE_BOOKS } from "@/lib/marketing/pricing";
import { appOrigin, classifyHost } from "@/lib/runtime/host";
import type { BillingClaim, BillingCountry, BillingInterval, CheckoutReservation, PaidPlan, UpgradeReservation } from "./platform-contract";

export const platformBillingPath = "/settings/billing";
const scope = "crecy_platform_saas";
const priceIdsSchema = z.record(
  z.string().regex(/^(US|CA|MX)\.(starter|growth|pro)\.(month|year)$/),
  z.string().regex(/^price_[a-zA-Z0-9]+$/),
);

export function getPlatformStripeConfig() {
  if (process.env.CRECY_SAAS_BILLING_MODE !== "sandbox" || process.env.VERCEL_ENV === "production") return null;
  const key = process.env.CRECY_SAAS_STRIPE_SECRET_KEY?.trim();
  const account = process.env.CRECY_SAAS_STRIPE_ACCOUNT_ID?.trim();
  const secret = process.env.CRECY_SAAS_STRIPE_WEBHOOK_SECRET?.trim();
  const portalConfiguration = process.env.CRECY_SAAS_STRIPE_PORTAL_CONFIGURATION?.trim();
  const rentKey = process.env.STRIPE_SECRET_KEY?.trim();
  const rentAccount = process.env.CRECY_RENT_STRIPE_ACCOUNT_ID?.trim();
  if (!key || !/^rk_test_[a-zA-Z0-9]+$/.test(key) || key === rentKey
    || !account || !/^acct_[a-zA-Z0-9]+$/.test(account) || account === rentAccount
    || (rentKey && !rentKey.includes("replace_me") && !/^acct_[a-zA-Z0-9]+$/.test(rentAccount ?? ""))
    || !secret || !/^whsec_[a-zA-Z0-9]+$/.test(secret) || secret === process.env.STRIPE_WEBHOOK_SECRET?.trim()
    || !portalConfiguration || !/^bpc_[a-zA-Z0-9]+$/.test(portalConfiguration)) return null;

  try {
    const origin = new URL(appOrigin());
    const host = classifyHost(origin.host);
    const sandboxProject = new URL(process.env.CRECY_SAAS_SANDBOX_SUPABASE_URL ?? "");
    const applicationProject = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    if ((host.kind !== "app" && host.kind !== "development") || origin.username || origin.password
      || origin.hostname === "app.crecyos.com"
      || origin.pathname !== "/" || origin.search || origin.hash
      || (origin.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))) return null;
    // Confirm the app is explicitly bound to the chosen sandbox database before accepting Stripe test events.
    if (sandboxProject.href !== applicationProject.href || sandboxProject.pathname !== "/"
      || sandboxProject.username || sandboxProject.password || sandboxProject.search || sandboxProject.hash
      || (sandboxProject.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(sandboxProject.hostname))) return null;
    const priceIds = priceIdsSchema.parse(JSON.parse(process.env.CRECY_SAAS_STRIPE_PRICE_IDS ?? "{}"));
    if (!Object.keys(priceIds).length || new Set(Object.values(priceIds)).size !== Object.keys(priceIds).length) return null;
    return { key, account, secret, portalConfiguration, origin: origin.origin, priceIds };
  } catch {
    return null;
  }
}

export type PlatformStripeConfig = NonNullable<ReturnType<typeof getPlatformStripeConfig>>;

export function platformStripe(config: PlatformStripeConfig) {
  return new Stripe(config.key, { timeout: 8_000, maxNetworkRetries: 1 });
}

export async function verifyPlatformStripeAccount(stripe: Stripe, config: PlatformStripeConfig) {
  // Passing null asks Stripe which account owns this API key.
  if ((await stripe.accounts.retrieve(null)).id !== config.account) throw new Error("Billing account mismatch");
}

function marker(attemptId: string) {
  return { crecy_billing_scope: scope, crecy_billing_attempt_id: attemptId };
}

export function billingAttemptId(metadata: Stripe.Metadata | null | undefined) {
  if (metadata?.crecy_billing_scope !== scope) return null;
  const parsed = z.uuid().safeParse(metadata.crecy_billing_attempt_id);
  return parsed.success ? parsed.data : null;
}

export function stripeObjectId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

export async function verifyCheckoutPrice(stripe: Stripe, country: BillingCountry, plan: PaidPlan, interval: BillingInterval, priceId: string) {
  const book = PRICE_BOOKS[country];
  const expectedAmount = interval === "month" ? book.plans[plan].monthlyMinor : book.plans[plan].annualMinor;
  const price = await stripe.prices.retrieve(priceId, { expand: ["currency_options"] });
  if (price.id !== priceId || price.active !== true || price.livemode !== false
    || price.type !== "recurring" || price.billing_scheme !== "per_unit"
    || price.recurring?.usage_type !== "licensed" || price.recurring.interval !== interval
    || price.recurring.interval_count !== 1 || price.recurring.trial_period_days || price.unit_amount !== expectedAmount
    || price.currency !== book.currency.toLowerCase() || price.custom_unit_amount || price.transform_quantity
    || Object.keys(price.currency_options ?? {}).some((currency) => currency !== price.currency)) throw new Error("Billing price mismatch");
}

export async function obtainCheckoutSession(
  stripe: Stripe,
  config: PlatformStripeConfig,
  reservation: CheckoutReservation,
  priceId: string,
) {
  const { attemptId, customerId, sessionId } = reservation;
  const url = new URL(platformBillingPath, config.origin);
  const session = sessionId
    ? await stripe.checkout.sessions.retrieve(sessionId)
    : await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          client_reference_id: attemptId,
          ...(customerId ? { customer: customerId } : {}),
          line_items: [{ price: priceId, quantity: 1 }],
          metadata: marker(attemptId),
          subscription_data: { metadata: marker(attemptId) },
          integration_identifier: scope,
          adaptive_pricing: { enabled: false },
          success_url: url.href,
          cancel_url: url.href,
        },
        { idempotencyKey: `crecy-platform-subscription:${attemptId}` },
      );
  if (!/^cs_test_[a-zA-Z0-9]+$/.test(session.id) || session.livemode !== false || session.mode !== "subscription"
    || billingAttemptId(session.metadata) !== attemptId || session.client_reference_id !== attemptId
    || (sessionId && session.id !== sessionId) || (customerId && stripeObjectId(session.customer) !== customerId)) {
    throw new Error("Billing Checkout binding mismatch");
  }
  return session;
}

export function stripeHostedBillingUrl(raw: string | null, kind: "checkout" | "portal") {
  const url = new URL(raw ?? "");
  const host = kind === "checkout" ? "https://checkout.stripe.com" : "https://billing.stripe.com";
  const prefix = kind === "checkout" ? "/c/pay/" : "/p/session/";
  if (url.origin !== host || url.username || url.password || !url.pathname.startsWith(prefix)) {
    throw new Error("Unexpected hosted Stripe URL");
  }
  return url.href;
}

export async function createBillingPortalSession(stripe: Stripe, config: PlatformStripeConfig, customer: string) {
  const configuration = await stripe.billingPortal.configurations.retrieve(config.portalConfiguration);
  if (configuration.id !== config.portalConfiguration || configuration.active !== true || configuration.livemode !== false
    || configuration.features.subscription_update.enabled
    || !configuration.features.invoice_history.enabled || !configuration.features.payment_method_update.enabled
    || !configuration.features.subscription_cancel.enabled || configuration.features.subscription_cancel.mode !== "at_period_end") {
    throw new Error("Unsafe billing portal configuration");
  }
  const session = await stripe.billingPortal.sessions.create({
    customer,
    configuration: config.portalConfiguration,
    return_url: new URL(platformBillingPath, config.origin).href,
  });
  if (session.livemode !== false || session.customer !== customer) throw new Error("Billing portal binding mismatch");
  return stripeHostedBillingUrl(session.url, "portal");
}

function boundUpgradeInvoice(invoice: Stripe.Subscription["latest_invoice"], subscriptionId: string, customerId: string) {
  if (!invoice || typeof invoice === "string" || invoice.livemode !== false || invoice.billing_reason !== "subscription_update"
    || !/^in_[a-zA-Z0-9]+$/.test(invoice.id)
    || stripeObjectId(invoice.customer) !== customerId
    || stripeObjectId(invoice.parent?.subscription_details?.subscription) !== subscriptionId) return null;
  return invoice;
}

function upgradeSubscriptionItem(subscription: Stripe.Subscription, reservation: UpgradeReservation, targetPriceId: string) {
  const [item] = subscription.items.data;
  const pending = subscription.pending_update?.subscription_items;
  if (subscription.id !== reservation.subscriptionId || subscription.livemode !== false
    || billingAttemptId(subscription.metadata) !== reservation.attemptId || stripeObjectId(subscription.customer) !== reservation.customerId
    || subscription.status !== "active" || subscription.cancel_at_period_end || subscription.cancel_at || subscription.schedule
    || subscription.items.has_more || subscription.items.data.length !== 1 || !item || item.quantity !== 1
    || ![reservation.sourcePriceId, targetPriceId].includes(item.price.id)
    || (subscription.pending_update && (pending?.length !== 1 || pending[0].price.id !== targetPriceId || pending[0].quantity !== 1))) {
    throw new Error("Billing upgrade subscription binding mismatch");
  }
  return item;
}

export async function requestPlatformUpgrade(stripe: Stripe, reservation: UpgradeReservation, targetPriceId: string) {
  const current = await stripe.subscriptions.retrieve(reservation.subscriptionId, { expand: ["latest_invoice"] });
  const item = upgradeSubscriptionItem(current, reservation, targetPriceId);
  let updated = current;
  if (item.price.id === reservation.sourcePriceId && !current.pending_update) {
    const invoice = current.latest_invoice;
    if (reservation.invoiceId || !invoice || typeof invoice === "string" || invoice.status !== "paid" || invoice.livemode !== false) {
      throw new Error("Billing upgrade requires a paid current subscription");
    }
    updated = await stripe.subscriptions.update(reservation.subscriptionId, {
      items: [{ id: item.id, price: targetPriceId, quantity: 1 }],
      payment_behavior: "pending_if_incomplete",
      proration_behavior: "always_invoice",
      expand: ["latest_invoice"],
    }, { idempotencyKey: `crecy-platform-upgrade:${reservation.upgradeId}` });
  }
  const updatedItem = upgradeSubscriptionItem(updated, reservation, targetPriceId);
  const invoice = boundUpgradeInvoice(updated.latest_invoice, updated.id, reservation.customerId);
  if (!invoice || (reservation.invoiceId && reservation.invoiceId !== invoice.id)
    || (updatedItem.price.id !== targetPriceId && !updated.pending_update)) {
    throw new Error("Billing upgrade invoice binding mismatch");
  }
  return invoice.id;
}

export async function fetchSubscriptionSnapshot(stripe: Stripe, subscriptionId: string, claim: BillingClaim, upgradeExpired = false) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] });
  const [item] = subscription.items.data;
  const customerId = stripeObjectId(subscription.customer);
  if (subscription.id !== subscriptionId || subscription.livemode !== false
    || billingAttemptId(subscription.metadata) !== claim.attemptId || !customerId
    || (claim.customerId && customerId !== claim.customerId)
    || subscription.items.has_more || subscription.items.data.length !== 1
    || !item || (item.price.id !== claim.priceId && item.price.id !== claim.upgradePriceId)
    || item.quantity !== 1) throw new Error("Billing subscription binding mismatch");
  const latestInvoice = subscription.latest_invoice;
  if (typeof latestInvoice === "string") throw new Error("Latest billing invoice was not expanded");
  const latestUpgradeInvoice = boundUpgradeInvoice(latestInvoice, subscription.id, customerId);
  const changingPrice = item.price.id !== claim.priceId;
  const upgradeInvoice = (changingPrice || upgradeExpired) && claim.upgradeInvoiceId && latestUpgradeInvoice?.id !== claim.upgradeInvoiceId
    ? boundUpgradeInvoice(await stripe.invoices.retrieve(claim.upgradeInvoiceId), subscription.id, customerId)
    : latestUpgradeInvoice;
  const paidInvoice = latestInvoice?.livemode === false && latestInvoice.status === "paid";
  // The previous paid plan stays in force while a separate, unpaid proration invoice is pending or voided.
  const previousPlanStillPaid = claim.paidOnce === true && subscription.status === "active" && latestUpgradeInvoice !== null;
  return {
    customerId,
    priceId: item.price.id,
    status: subscription.status,
    paid: changingPrice ? upgradeInvoice?.status === "paid" : paidInvoice || previousPlanStillPaid,
    invoiceId: upgradeInvoice?.id ?? null,
    invoiceVoid: upgradeInvoice?.status === "void",
    pendingUpdate: subscription.pending_update != null,
    periodStart: new Date(item.current_period_start * 1000).toISOString(),
    periodEnd: new Date(item.current_period_end * 1000).toISOString(),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  };
}
