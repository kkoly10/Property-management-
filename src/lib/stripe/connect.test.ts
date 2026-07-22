import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { snapshotStripeAccount } from "@/lib/stripe/snapshot";

describe("snapshotStripeAccount", () => {
  it("retains only the provider state needed by the canonical connection record", () => {
    const account = {
      id: "acct_test123",
      capabilities: { card_payments: "active", transfers: "pending" },
      requirements: {
        currently_due: ["business_profile.url"], eventually_due: [], past_due: [],
        pending_verification: ["representative.verification.document"], disabled_reason: null,
      },
      charges_enabled: true,
      payouts_enabled: false,
    } as unknown as Stripe.Account;

    expect(snapshotStripeAccount(account)).toEqual({
      providerAccountId: "acct_test123",
      capabilities: { card_payments: "active", transfers: "pending" },
      requirements: {
        currentlyDue: ["business_profile.url"], eventuallyDue: [], pastDue: [],
        pendingVerification: ["representative.verification.document"], disabledReason: null,
      },
      chargesEnabled: true,
      payoutsEnabled: false,
    });
  });
});
