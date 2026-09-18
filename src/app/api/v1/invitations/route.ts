import { createHash, createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateInvitationAuthLink } from "@/lib/auth/invitation-link";
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

  // The ONE email's credential. See `generateInvitationAuthLink` for why this is a `magiclink` and not
  // an `invite`, and why it runs before the command: the link is persisted onto the queued notification
  // job so the Crecy worker sends the single branded invitation. It replaces a `signInWithOtp()` call
  // that made Supabase send a second, competing email — after which this route marked the Crecy job
  // "sent" for a message no transport had accepted.
  const authLink = await generateInvitationAuthLink(admin, {
    email: input.email,
    redirectTo: callbackUrl.toString(),
  });
  if (!authLink.ok) {
    if (createdAuthUser) await admin.auth.admin.deleteUser(invitedUserId).catch(() => undefined);
    return invitationErrorResponse(
      "INVITATION_LINK_UNAVAILABLE",
      "The invitation could not be prepared because Supabase Auth did not return an activation link. Retry this request.",
      503,
    );
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
    p_auth_action_url: authLink.actionUrl,
    p_idempotency_key: idempotencyKey,
  });
  if (error || !data) {
    if (createdAuthUser) await admin.auth.admin.deleteUser(invitedUserId).catch(() => undefined);
    return invitationDatabaseError(error?.message ?? "");
  }
  const result = data as Record<string, unknown>;

  // `queued` is the truth: the invitation email is queued for the Crecy notification worker, and only
  // `complete_notification_job` — which runs after a transport accepted the message — can write `sent`.
  // The auth action link is never returned; it is a credential that signs the recipient in.
  return Response.json({
    ...result,
    activationUrl: new URL(activationPath, request.url).toString(),
    deliveryState: "queued",
  }, { status: 201 });
}
