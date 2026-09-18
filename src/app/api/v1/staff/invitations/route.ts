import { createHash, createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateInvitationAuthToken } from "@/lib/auth/invitation-link";
import { staffDatabaseError, staffErrorResponse } from "@/lib/api/staff";
import { inviteStaffSchema } from "@/lib/validation/staff";

export async function POST(request: Request) {
  const parsed = inviteStaffSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return staffErrorResponse("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Check the invitation.", 400);
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return staffErrorResponse("INVALID_IDEMPOTENCY_KEY", "Use an idempotency key between 8 and 200 characters.", 400);
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return staffErrorResponse("AUTHENTICATION_REQUIRED", "Sign in to invite staff.", 401);
  }
  const input = parsed.data;
  const { data: preflight, error: preflightError } = await supabase.rpc("get_staff_management_workspace", {
    p_organization_id: input.organizationId,
  });
  const workspace = preflight as {
    organization?: { organizationId?: string } | null;
    staffSeatCount?: number;
    staffSeatLimit?: number | null;
  } | null;
  if (preflightError || workspace?.organization?.organizationId !== input.organizationId) {
    return staffErrorResponse("FORBIDDEN", "You cannot manage staff for this organization.", 403);
  }
  if (workspace.staffSeatLimit !== null && Number(workspace.staffSeatCount) >= Number(workspace.staffSeatLimit)) {
    return staffErrorResponse("PLAN_LIMIT_EXCEEDED", "This plan has no available staff seats.", 422);
  }

  const tokenSecret = process.env.STAFF_INVITATION_TOKEN_SECRET ?? process.env.SUPABASE_SECRET_KEY;
  if (!tokenSecret || tokenSecret.includes("replace_me")) {
    return staffErrorResponse("INVITATION_SECRET_UNAVAILABLE", "Staff invitations require a server-side token secret.", 503);
  }
  const rawToken = createHmac("sha256", tokenSecret)
    .update(`${input.organizationId}|${input.email}|${idempotencyKey}`)
    .digest("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const tokenPrefix = tokenHash.slice(0, 10);
  const activationPath = `/settings/team/accept?token=${encodeURIComponent(rawToken)}`;
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return staffErrorResponse("AUTH_ADMIN_UNAVAILABLE", "Staff invitations require the server-side Supabase secret key.", 503);
  }
  const { data: existingId, error: resolutionError } = await admin.rpc("resolve_auth_user_by_email", {
    p_email: input.email,
  });
  if (resolutionError) {
    return staffErrorResponse("IDENTITY_RESOLUTION_FAILED", "The invited account could not be resolved.", 503);
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
      return staffErrorResponse("AUTH_INVITATION_FAILED", "Supabase could not prepare the invited account.", 422);
    }
    invitedUserId = created.user.id;
    createdAuthUser = true;
  }

  // The ONE email's credential, minted here and sent by nobody but the Crecy worker.
  //
  // `generateLink` sends no mail, which is why it replaced `signInWithOtp` — that call made Supabase
  // send a second, competing invitation email and left this route marking the Crecy job "sent" for a
  // message no transport had ever accepted.
  //
  // What comes back is the TOKEN HASH, not the action link. The action link is an implicit-flow
  // redirect that delivers the session in a URL fragment, which no server route can read; see
  // `invitation-link.ts`. The worker builds Crecy's own `/auth/confirm` URL around this hash.
  const authToken = await generateInvitationAuthToken(admin, { email: input.email });
  if (!authToken.ok) {
    if (createdAuthUser) await admin.auth.admin.deleteUser(invitedUserId).catch(() => undefined);
    return staffErrorResponse(
      "INVITATION_LINK_UNAVAILABLE",
      "The invitation could not be prepared because Supabase Auth did not return an activation link. Retry this request.",
      503,
    );
  }

  const { data, error } = await supabase.rpc("invite_staff_member", {
    p_organization_id: input.organizationId,
    p_invited_user_id: invitedUserId,
    p_email: input.email,
    p_role_code: input.roleCode,
    p_property_ids: input.propertyIds,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_mfa_required: input.mfaRequired,
    p_locale: input.locale,
    p_token_hash: tokenHash,
    p_token_prefix: tokenPrefix,
    p_audit_reason: input.auditReason,
    p_activation_token: rawToken,
    // Not the credential — a flag saying one is coming, so the queued job is held back until the
    // service-role attach below lands. This command runs as the OPERATOR, and nothing an operator
    // can call is allowed to decide what an invitation email contains.
    p_defer_for_auth_token: true,
    p_idempotency_key: idempotencyKey,
  });
  if (error || !data) {
    if (createdAuthUser) await admin.auth.admin.deleteUser(invitedUserId).catch(() => undefined);
    return staffDatabaseError(error?.message ?? "");
  }
  const result = data as Record<string, unknown>;

  // The credential goes onto the queued job through a `service_role`-only command, which also releases
  // the job the command deferred.
  //
  // This result is CHECKED. An earlier version ignored both the error and `attached: false` and let the
  // job send anyway after its hold expired — which mailed an invitation whose own copy promises a
  // one-click sign-in the link could not perform, and then let the worker mark it `sent`. The worker
  // now refuses such a job outright; this is the other half, so the caller is told the invitation is
  // not ready for delivery rather than being handed a cheerful "queued".
  const attach = await admin.rpc("attach_invitation_auth_token", {
    p_organization_id: input.organizationId,
    p_invitation_kind: "staff",
    p_invitation_id: String(result.invitationId),
    // The address the credential was minted FOR. The command binds on it, so a hash can never be
    // attached to a job addressed to somebody else.
    p_recipient_address: input.email,
    p_auth_token_hash: authToken.tokenHash,
  });
  const attached = (attach.data as { attached?: unknown } | null)?.attached === true;
  if (attach.error || !attached) {
    return staffErrorResponse(
      "INVITATION_CREDENTIAL_NOT_ATTACHED",
      "The invitation was recorded but its activation credential could not be attached, so its email will not be sent. Send the invitation again.",
      503,
    );
  }

  // `queued` is the truth and the only thing this route may claim. The invitation email is now queued
  // for the Crecy notification worker; only `complete_notification_job`, which runs after a transport
  // has accepted the message, can move it to `sent`. The previous response said
  // `activationEmailSent: true` because an unrelated Supabase call had returned success, which told
  // the operator a message had arrived when nothing had been sent at all.
  //
  // The auth action link is deliberately NOT returned. It is a credential that signs the recipient in,
  // and the browser has no use for it; the copyable fallback stays the invitation activation path,
  // which is useless without the recipient's own authentication.
  return Response.json({
    ...result,
    activationUrl: new URL(activationPath, request.url).toString(),
    deliveryState: "queued",
  }, { status: 201 });
}
