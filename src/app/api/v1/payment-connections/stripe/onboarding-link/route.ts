import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createStandardAccountOnboardingLink, getOrCreateStandardAccount, StripeConnectConfigurationError } from "@/lib/stripe/connect";
import { isAllowedApplicationUrl, stripeOnboardingLinkSchema } from "@/lib/validation/payment-connections";

const errorResponse = (code: string, message: string, status: number) => NextResponse.json({ error: message, code }, { status });

function databaseError(message: string) {
  if (message.includes("MFA_REQUIRED")) return errorResponse("MFA_REQUIRED", "Verify your authenticator code before connecting Stripe.", 403);
  if (message.includes("ORGANIZATION_SCOPE_DENIED")) return errorResponse("FORBIDDEN", "Organization administrator access is required.", 403);
  if (message.includes("OPERATING_ENTITY_NOT_FOUND")) return errorResponse("NOT_FOUND", "The operating entity is unavailable.", 404);
  if (message.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("IDEMPOTENCY_CONFLICT", "This request key was already used for different onboarding details.", 409);
  if (message.includes("COMMAND_IN_PROGRESS")) return errorResponse("COMMAND_IN_PROGRESS", "This Stripe connection request is already in progress.", 409);
  if (message.includes("PROVIDER_CONNECTION_CONFLICT")) return errorResponse("PROVIDER_CONNECTION_CONFLICT", "This entity is already linked to another Stripe account.", 409);
  return errorResponse("SERVICE_UNAVAILABLE", "Stripe onboarding is temporarily unavailable.", 503);
}

export async function POST(request: Request) {
  const parsed = stripeOnboardingLinkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("INVALID_REQUEST", "Check the organization, entity, and return URLs.", 400);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl || !isAllowedApplicationUrl(parsed.data.returnUrl, siteUrl) || !isAllowedApplicationUrl(parsed.data.refreshUrl, siteUrl)) {
    return errorResponse("INVALID_RETURN_URL", "Stripe can only return to the configured Crecy application.", 400);
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("AUTHENTICATION_REQUIRED", "Sign in to connect Stripe.", 401);
  const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error || assurance.data.currentLevel !== "aal2") {
    return errorResponse("MFA_REQUIRED", "Verify your authenticator code before connecting Stripe.", 403);
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || crypto.randomUUID();
  const prepared = await supabase.rpc("prepare_stripe_onboarding_link", {
    p_organization_id: parsed.data.organizationId,
    p_operating_entity_id: parsed.data.operatingEntityId,
    p_return_url: parsed.data.returnUrl,
    p_refresh_url: parsed.data.refreshUrl,
    p_idempotency_key: idempotencyKey,
  });
  if (prepared.error || !prepared.data) return databaseError(prepared.error?.message ?? "SERVICE_UNAVAILABLE");

  const context = prepared.data as {
    organizationId?: string;
    operatingEntityId?: string;
    entityDisplayName?: string;
    countryCode?: string;
    providerAccountId?: string | null;
    replayResponse?: { providerConnectionId: string; url: string; expiresAt: string } | null;
  };
  if (context.replayResponse) return NextResponse.json(context.replayResponse, { status: 201 });
  if (!context.organizationId || !context.operatingEntityId || !context.entityDisplayName || !context.countryCode) {
    return errorResponse("SERVICE_UNAVAILABLE", "The authorized operating entity could not be prepared.", 503);
  }

  try {
    const account = await getOrCreateStandardAccount({
      organizationId: context.organizationId,
      operatingEntityId: context.operatingEntityId,
      entityDisplayName: context.entityDisplayName,
      countryCode: context.countryCode,
      existingProviderAccountId: context.providerAccountId,
    });
    const link = await createStandardAccountOnboardingLink({
      providerAccountId: account.providerAccountId,
      returnUrl: parsed.data.returnUrl,
      refreshUrl: parsed.data.refreshUrl,
      idempotencyKey,
    });
    const completed = await createAdminClient().rpc("complete_stripe_onboarding_link", {
      p_actor_user_id: auth.user.id,
      p_actor_aal: assurance.data.currentLevel,
      p_organization_id: context.organizationId,
      p_operating_entity_id: context.operatingEntityId,
      p_provider_account_id: account.providerAccountId,
      p_capabilities: account.capabilities,
      p_requirements: account.requirements,
      p_charges_enabled: account.chargesEnabled,
      p_payouts_enabled: account.payoutsEnabled,
      p_link_url: link.url,
      p_link_expires_at: link.expiresAt,
      p_return_url: parsed.data.returnUrl,
      p_refresh_url: parsed.data.refreshUrl,
      p_idempotency_key: idempotencyKey,
    });
    if (completed.error || !completed.data) return databaseError(completed.error?.message ?? "SERVICE_UNAVAILABLE");
    return NextResponse.json(completed.data, { status: 201 });
  } catch (error) {
    const message = error instanceof StripeConnectConfigurationError
      ? "Stripe is not configured for this environment."
      : "Stripe onboarding is temporarily unavailable.";
    return errorResponse("SERVICE_UNAVAILABLE", message, 503);
  }
}
