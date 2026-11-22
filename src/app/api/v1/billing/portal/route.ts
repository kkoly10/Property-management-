import { createAdminClient } from "@/lib/supabase/admin";
import { billingWorkspaceInputSchema } from "@/lib/billing/platform-contract";
import { authorizeBillingMutation, billingCommandError, billingJson, billingUnavailable } from "@/lib/billing/platform-http";
import { createBillingPortalSession, platformStripe, verifyPlatformStripeAccount } from "@/lib/billing/platform-stripe";

export async function POST(request: Request) {
  try {
    const access = await authorizeBillingMutation(request);
    if (access.response) return access.response;
    const parsed = billingWorkspaceInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return billingJson({ error: "Select a workspace.", code: "INVALID_REQUEST" }, 400);
    const { config, actorId, organizationId } = access;
    if (parsed.data.organizationId !== organizationId) return billingCommandError("BILLING_WORKSPACE_CHANGED");
    const result = await createAdminClient().rpc("prepare_platform_billing_portal", {
      p_actor_user_id: actorId,
      p_actor_aal: "aal2",
      p_organization_id: organizationId,
      p_stripe_account_id: config.account,
    });
    if (result.error) return billingCommandError(result.error.message);
    const customer = result.data;
    if (typeof customer !== "string" || !/^cus_[a-zA-Z0-9]+$/.test(customer)) return billingUnavailable();
    const stripe = platformStripe(config);
    await verifyPlatformStripeAccount(stripe, config);
    return billingJson({ url: await createBillingPortalSession(stripe, config, customer) }, 201);
  } catch {
    return billingUnavailable();
  }
}
