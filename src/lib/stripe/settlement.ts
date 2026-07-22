import type Stripe from "stripe";

export type StripeSettlementItemData = {
  providerBalanceTransactionId: string;
  providerSourceId?: string;
  transactionType: string;
  reportingCategory?: string;
  grossMinor: number;
  feeMinor: number;
  netMinor: number;
  currencyCode: string;
  providerStatus: string;
  availableOn: string;
};

export type StripeSettlementEventData = {
  providerSettlementId: string;
  providerStatus: string;
  amountMinor: number;
  currencyCode: string;
  automatic: boolean;
  expectedArrivalDate?: string;
  items: StripeSettlementItemData[];
};

function referencedId(value: Stripe.BalanceTransaction["source"]) {
  return typeof value === "string" ? value : value?.id;
}

function isoDate(epochSeconds: number | null | undefined) {
  return epochSeconds == null ? undefined : new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

export function sanitizeStripePayout(
  payout: Stripe.Payout,
  balanceTransactions: Stripe.BalanceTransaction[],
): StripeSettlementEventData {
  return {
    providerSettlementId: payout.id,
    providerStatus: payout.status,
    amountMinor: payout.amount,
    currencyCode: payout.currency.toUpperCase(),
    automatic: payout.automatic,
    expectedArrivalDate: isoDate(payout.arrival_date),
    items: balanceTransactions.map((item) => ({
      providerBalanceTransactionId: item.id,
      providerSourceId: referencedId(item.source),
      transactionType: item.type,
      reportingCategory: item.reporting_category,
      grossMinor: item.amount,
      feeMinor: item.fee,
      netMinor: item.net,
      currencyCode: item.currency.toUpperCase(),
      providerStatus: item.status,
      availableOn: isoDate(item.available_on)!,
    })),
  };
}

export async function listStripePayoutBalanceTransactions(
  stripe: Pick<Stripe, "balanceTransactions">,
  providerAccountId: string,
  providerPayoutId: string,
) {
  const items: Stripe.BalanceTransaction[] = [];
  let startingAfter: string | undefined;

  do {
    const page = await stripe.balanceTransactions.list(
      { payout: providerPayoutId, limit: 100, starting_after: startingAfter },
      { stripeAccount: providerAccountId },
    );
    items.push(...page.data);
    if (items.length > 5_000) throw new Error("A payout exceeds Crecy's settlement import limit.");
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
    if (page.has_more && !startingAfter) throw new Error("Stripe returned an incomplete payout page.");
  } while (startingAfter);

  return items;
}
