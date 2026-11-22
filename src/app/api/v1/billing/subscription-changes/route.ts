import { createAdminClient } from "@/lib/supabase/admin";
import { billingWorkspaceSchema, checkoutInputSchema, checkoutReservationSchema, freePlanResultSchema } from "@/lib/billing/platform-contract";
import { authorizeBillingMutation, billingCommandError, billingJson, billingUnavailable } from "@/lib/billing/platform-http";
import { obtainCheckoutSession, platformStripe, stripeHostedBillingUrl, verifyCheckoutPrice, verifyPlatformStripeAccount } from "@/lib/billing/platform-stripe";

export async function POST(request: Request) {
  try {
    const access = await authorizeBillingMutation(request);
    if (access.response) return access.response;
    const parsed = checkoutInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return billingJson({ error: "Select a plan and billing period.", code: "INVALID_REQUEST" }, 400);

    const { targetPlanCode, billingInterval } = parsed.data;
    const { config, supabase, actorId, organizationId } = access;
    if (parsed.data.organizationId !== organizationId) return billingCommandError("BILLING_WORKSPACE_CHANGED");
    if (targetPlanCode === "free") {
      const result = await createAdminClient().rpc("choose_platform_free_plan", {
        p_actor_user_id: actorId, p_actor_aal: "aal2", p_organization_id: organizationId,
      });
      if (result.error) return billingCommandError(result.error.message);
      const outcome = freePlanResultSchema.parse(result.data);
      return billingJson(outcome, outcome.replayed ? 200 : 201);
    }
    const workspace = await supabase.rpc("get_platform_billing_workspace", { p_organization_id: organizationId });
    if (workspace.error) return billingCommandError(workspace.error.message);
    const data = billingWorkspaceSchema.parse(workspace.data);
    const priceId = config.priceIds[`${data.country}.${targetPlanCode}.${billingInterval}`];
    if (!priceId) return billingJson({ error: "This option is unavailable in the sandbox.", code: "PRICE_NOT_CONFIGURED" }, 409);
    const stripe = platformStripe(config);
    await verifyPlatformStripeAccount(stripe, config);
    if (!data.checkoutPending && !data.hasSubscription) {
      await verifyCheckoutPrice(stripe, data.country, targetPlanCode, billingInterval, priceId);
    }
    const admin = createAdminClient();
    const prepared = await admin.rpc("prepare_platform_billing_checkout", {
      p_actor_user_id: actorId,
      p_actor_aal: "aal2",
      p_organization_id: organizationId,
      p_stripe_account_id: config.account,
      p_country: data.country,
      p_plan_code: targetPlanCode,
      p_billing_interval: billingInterval,
      p_stripe_price_id: priceId,
    });
    if (prepared.error) return billingCommandError(prepared.error.message);
    const reservation = checkoutReservationSchema.parse(prepared.data);
    if (data.checkoutPending && !reservation.sessionId) {
      await verifyCheckoutPrice(stripe, data.country, targetPlanCode, billingInterval, priceId);
    }
    const session = await obtainCheckoutSession(stripe, config, reservation, priceId);
    const recorded = await admin.rpc("record_platform_billing_checkout", {
      p_attempt_id: reservation.attemptId,
      p_stripe_account_id: config.account,
      p_stripe_session_id: session.id,
      p_expired: session.status === "expired",
    });
    if (recorded.error || recorded.data !== true) return billingUnavailable();
    if (session.status === "expired") {
      return billingJson({ error: "Checkout expired. Refresh this page to choose a new plan and period.", code: "CHECKOUT_EXPIRED" }, 409);
    }
    if (session.status === "complete") return billingJson({ status: "awaiting_confirmation" });
    if (session.status !== "open") return billingUnavailable();
    return billingJson({ status: "checkout", url: stripeHostedBillingUrl(session.url, "checkout") }, 201);
  } catch {
    return billingUnavailable();
  }
}
