import "server-only";
import { NextResponse } from "next/server";
import { getOrganizationContext } from "@/lib/organization/context";
import { createClient } from "@/lib/supabase/server";
import { getPlatformStripeConfig } from "./platform-stripe";

export function billingJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function billingUnavailable() {
  return billingJson({ error: "Billing is temporarily unavailable.", code: "BILLING_UNAVAILABLE" }, 503);
}

const actionableErrors: Record<string, { error: string; status: number }> = {
  MFA_REQUIRED: { error: "Verify your authenticator to manage billing.", status: 403 },
  BILLING_SCOPE_DENIED: { error: "Organization owner or administrator access is required.", status: 403 },
  BILLING_WORKSPACE_CHANGED: { error: "Your active workspace changed. Refresh billing before continuing.", status: 409 },
  BILLING_CHECKOUT_PENDING: { error: "Continue the checkout already open for this organization.", status: 409 },
  BILLING_CHECKOUT_RECONCILIATION_REQUIRED: { error: "The previous checkout needs to be reconciled before you can start a new one.", status: 409 },
  BILLING_SUBSCRIPTION_EXISTS: { error: "This organization already has a subscription. Open the billing portal.", status: 409 },
  BILLING_PLAN_LIMIT_EXCEEDED: { error: "Your workspace exceeds the selected plan’s unit or staff limits.", status: 409 },
  BILLING_DOWNGRADE_UNAVAILABLE: { error: "Plan downgrades are unavailable through sandbox checkout.", status: 409 },
  BILLING_FREE_REVIEW_REQUIRED: { error: "Free conversion is available after your current billing activity is resolved. Contact support for help.", status: 409 },
  BILLING_CUSTOMER_NOT_FOUND: { error: "The billing portal is available once Stripe confirms a customer.", status: 404 },
};

export function billingCommandError(message: string | undefined) {
  const match = message && Object.hasOwn(actionableErrors, message) ? actionableErrors[message] : null;
  return match ? billingJson({ error: match.error, code: message }, match.status) : billingUnavailable();
}

export async function authorizeBillingMutation(request: Request) {
  const config = getPlatformStripeConfig();
  if (!config) return { response: billingUnavailable() } as const;
  if (request.headers.get("origin") !== config.origin) {
    return { response: billingJson({ error: "Open billing on the Crecy application.", code: "INVALID_ORIGIN" }, 403) } as const;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { response: billingJson({ error: "Sign in to manage billing.", code: "AUTHENTICATION_REQUIRED" }, 401) } as const;
  }
  const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error || assurance.data.currentLevel !== "aal2") {
    return { response: billingCommandError("MFA_REQUIRED") } as const;
  }
  const context = await getOrganizationContext();
  if (context.state !== "active") return { response: billingCommandError("BILLING_SCOPE_DENIED") } as const;
  return { config, supabase, actorId: data.user.id, organizationId: context.active.organizationId } as const;
}
