import { createHash, createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateInvitationAuthToken } from "@/lib/auth/invitation-link";
import { invitationDatabaseError, invitationErrorResponse } from "@/lib/api/invitations";
import { inviteRelationshipSchema } from "@/lib/validation/invitations";

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

  // The ONE email's credential. See `invitation-link.ts` for why this is a `magiclink` and not an
  // `invite`, and why it is the TOKEN HASH rather than the action link — the action link is an
  // implicit-flow redirect whose session arrives in a URL fragment no server route can read. It
  // replaces a `signInWithOtp()` call that made Supabase send a second, competing email, after which
  // this route marked the Crecy job "sent" for a message no transport had accepted.
  const authToken = await generateInvitationAuthToken(admin, { email: input.email });
  if (!authToken.ok) {
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
    // Not the credential — a flag saying one is coming, so the queued job is held back until the
    // service-role attach below lands. This command runs as the OPERATOR, and nothing an operator can
    // call is allowed to decide what an invitation email contains.
    p_defer_for_auth_token: true,
    p_idempotency_key: idempotencyKey,
  });
  if (error || !data) {
    if (createdAuthUser) await admin.auth.admin.deleteUser(invitedUserId).catch(() => undefined);
    return invitationDatabaseError(error?.message ?? "");
  }
  const result = data as Record<string, unknown>;

  // The credential goes onto the queued job through a `service_role`-only command, which also releases
  // the job the command deferred. A failure here is not worth failing the invitation: the job becomes
  // available on its own two minutes later and sends the bare acceptance link.
  await admin.rpc("attach_invitation_auth_token", {
    p_organization_id: input.organizationId,
    p_invitation_kind: "relationship",
    p_invitation_id: String(result.invitationId),
    p_auth_token_hash: authToken.tokenHash,
  });

  // `queued` is the truth: the invitation email is queued for the Crecy notification worker, and only
  // `complete_notification_job` — which runs after a transport accepted the message — can write `sent`.
  // The auth action link is never returned; it is a credential that signs the recipient in.
  return Response.json({
    ...result,
    activationUrl: new URL(activationPath, request.url).toString(),
    deliveryState: "queued",
  }, { status: 201 });
}
