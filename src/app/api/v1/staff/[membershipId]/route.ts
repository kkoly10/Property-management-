import { staffDatabaseError, staffErrorResponse } from "@/lib/api/staff";
import { createClient } from "@/lib/supabase/server";
import { updateStaffMembershipSchema } from "@/lib/validation/staff";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  const parsed = updateStaffMembershipSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return staffErrorResponse("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Check the staff record.", 400);
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return staffErrorResponse("INVALID_IDEMPOTENCY_KEY", "Use a valid idempotency key.", 400);
  }
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return staffErrorResponse("AUTHENTICATION_REQUIRED", "Sign in to manage staff.", 401);
  const { membershipId } = await params;
  const input = parsed.data;
  const { data, error } = await supabase.rpc("update_staff_membership", {
    p_membership_id: membershipId,
    p_role_code: input.roleCode,
    p_status: input.status,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_mfa_required: input.mfaRequired,
    p_expected_version: input.expectedVersion,
    p_audit_reason: input.auditReason,
    p_idempotency_key: idempotencyKey,
  });
  if (error || !data) return staffDatabaseError(error?.message ?? "");
  return Response.json(data);
}
