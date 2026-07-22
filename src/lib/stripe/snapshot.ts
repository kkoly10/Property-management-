import type Stripe from "stripe";

export type StripeAccountSnapshot = {
  providerAccountId: string;
  capabilities: Record<string, string>;
  requirements: {
    currentlyDue: string[];
    eventuallyDue: string[];
    pastDue: string[];
    pendingVerification: string[];
    disabledReason: string | null;
  };
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
};

export function snapshotStripeAccount(account: Stripe.Account): StripeAccountSnapshot {
  return {
    providerAccountId: account.id,
    capabilities: Object.fromEntries(Object.entries(account.capabilities ?? {}).map(([key, value]) => [key, String(value)])),
    requirements: {
      currentlyDue: account.requirements?.currently_due ?? [],
      eventuallyDue: account.requirements?.eventually_due ?? [],
      pastDue: account.requirements?.past_due ?? [],
      pendingVerification: account.requirements?.pending_verification ?? [],
      disabledReason: account.requirements?.disabled_reason ?? null,
    },
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
  };
}
