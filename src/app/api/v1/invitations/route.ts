import { createHash, createHmac } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { invitationDatabaseError, invitationErrorResponse } from "@/lib/api/invitations";
import { audienceForSurface, inviteRelationshipSchema } from "@/lib/validation/invitations";
import { originForAudience } from "@/lib/runtime/host";

export async function POST(request: Request) {
  const parsed = inviteRelationshipSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return invitationErrorResponse("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Check the invitation.", 400);
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return invitationErrorResponse("INVALID_IDEMPOTENCY_KEY", "Use an idempotency key between 8 and 200 characters.", 400);
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return invitationErrorResponse("AUTHENTICATION_REQUIRED", "Sign in to invite a resident or owner.", 401);
  }
  const input = parsed.data;

  const tokenSecret = process.env.RELATIONSHIP_INVITATION_TOKEN_SECRET ?? process.env.SUPABASE_SECRET_KEY;
  if (!tokenSecret || tokenSecret.includes("replace_me")) {
    return invitationErrorResponse("INVITATION_SECRET_UNAVAILABLE", "Invitations require a server-side token secret.", 503);
  }
  const rawToken = createHmac("sha256", tokenSecret)
    .update(`${input.organizationId}|${input.relationshipType}|${input.relationshipId}|${input.email}|${idempotencyKey}`)
    .digest("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const tokenPrefix = tokenHash.slice(0, 10);
  const activationPath = `/invitations/accept?token=${encodeURIComponent(rawToken)}`;
  // The recipient activates on their own portal origin, derived from the relationship, never from
  // the inviting operator's host. originForAudience collapses to the app origin in local development,
  // so this does not break the dev loop or Playwright.
  // Falls back to the request origin when no app origin is configured: originForAudience
  // returns "" there, and new URL(path, "") throws — which would turn an unconfigured preview
  // or a bare local checkout into a 500 on every invitation.
  const callbackUrl = new URL("/auth/callback", originForAudience(audienceForSurface[input.redirectSurface]) || request.url);
  callbackUrl.searchParams.set("next", activationPath);

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return invitationErrorResponse("AUTH_ADMIN_UNAVAILABLE", "Invitations require the server-side Supabase secret key.", 503);
  }
  const { data: existingId, error: resolutionError } = await admin.rpc("resolve_auth_user_by_email", {
    p_email: input.email,
  });
  if (resolutionError) {
    return invitationErrorResponse("IDENTITY_RESOLUTION_FAILED", "The invited account could not be resolved.", 503);
  }

  let invitedUserId = typeof existingId === "string" ? existingId : null;
  let createdAuthUser = false;
  if (!invitedUserId) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: input.email,
      email_confirm: false,
      user_metadata: { locale: input.locale },
    });
    if (createError || !created.user) {
      return invitationErrorResponse("AUTH_INVITATION_FAILED", "Supabase could not prepare the invited account.", 422);
    }
    invitedUserId = created.user.id;
    createdAuthUser = true;
  }

  const { data, error } = await supabase.rpc("invite_relationship_user", {
    p_organization_id: input.organizationId,
    p_invited_user_id: invitedUserId,
    p_relationship_type: input.relationshipType,
    p_relationship_id: input.relationshipId,
    p_email: input.email,
    p_locale: input.locale,
    p_redirect_surface: input.redirectSurface,
    p_token_hash: tokenHash,
    p_token_prefix: tokenPrefix,
    p_activation_token: rawToken,
    p_idempotency_key: idempotencyKey,
  });
  if (error || !data) {
    if (createdAuthUser) await admin.auth.admin.deleteUser(invitedUserId).catch(() => undefined);
    return invitationDatabaseError(error?.message ?? "");
  }
  const result = data as Record<string, unknown>;
  const invitationId = String(result.invitationId);
  const { data: deliveryStatus } = await admin.rpc("get_relationship_invitation_delivery_status", {
    p_invitation_id: invitationId,
  });
  let activationEmailSent = deliveryStatus === "sent";
  if (!activationEmailSent) {
    const { url, publishableKey } = requirePublicSupabaseConfig();
    const deliveryClient = createSupabaseClient(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { error: deliveryError } = await deliveryClient.auth.signInWithOtp({
      email: input.email,
      options: { shouldCreateUser: false, emailRedirectTo: callbackUrl.toString() },
    });
    if (deliveryError) {
      return invitationErrorResponse("INVITATION_DELIVERY_FAILED", "The invitation exists, but its activation email could not be sent. Retry this request.", 502);
    }
    await admin.rpc("mark_relationship_invitation_email_sent", { p_invitation_id: invitationId });
    activationEmailSent = true;
  }

  return Response.json({
    ...result,
    activationUrl: new URL(activationPath, request.url).toString(),
    activationEmailSent,
  }, { status: 201 });
}
