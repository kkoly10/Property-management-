import { createHash, createHmac } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { originForAudience } from "@/lib/runtime/host";
import { requirePublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
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
  // Staff activate in Crecy OS by definition, so the operator origin is correct here — but it is
  // stated explicitly rather than inherited from the request host.
  // Falls back to the request origin when no app origin is configured: originForAudience
  // returns "" there, and new URL(path, "") throws — which would turn an unconfigured preview
  // or a bare local checkout into a 500 on every invitation.
  const callbackUrl = new URL("/auth/callback", originForAudience("operator") || request.url);
  callbackUrl.searchParams.set("next", activationPath);

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
    p_idempotency_key: idempotencyKey,
  });
  if (error || !data) {
    if (createdAuthUser) await admin.auth.admin.deleteUser(invitedUserId).catch(() => undefined);
    return staffDatabaseError(error?.message ?? "");
  }
  const result = data as Record<string, unknown>;
  const invitationId = String(result.invitationId);
  const { data: deliveryStatus } = await admin.rpc("get_staff_invitation_delivery_status", {
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
      return staffErrorResponse("INVITATION_DELIVERY_FAILED", "The staff invitation exists, but its activation email could not be sent. Retry this request.", 502);
    }
    await admin.rpc("mark_staff_invitation_email_sent", { p_invitation_id: invitationId });
    activationEmailSent = true;
  }

  return Response.json({
    ...result,
    activationUrl: new URL(activationPath, request.url).toString(),
    activationEmailSent,
  }, { status: 201 });
}
