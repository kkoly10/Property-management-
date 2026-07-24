import { staffDatabaseError, staffErrorResponse } from "@/lib/api/staff";
import { createClient } from "@/lib/supabase/server";
import { replaceStaffPropertyScopesSchema } from "@/lib/validation/staff";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  const parsed = replaceStaffPropertyScopesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return staffErrorResponse("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Check the property access.", 400);
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return staffErrorResponse("INVALID_IDEMPOTENCY_KEY", "Use a valid idempotency key.", 400);
  }
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return staffErrorResponse("AUTHENTICATION_REQUIRED", "Sign in to change property access.", 401);
  const { membershipId } = await params;
  const { data, error } = await supabase.rpc("replace_staff_property_scopes", {
    p_membership_id: membershipId,
    p_property_ids: parsed.data.propertyIds,
    p_expected_version: parsed.data.expectedVersion,
    p_audit_reason: parsed.data.auditReason,
    p_idempotency_key: idempotencyKey,
  });
  if (error || !data) return staffDatabaseError(error?.message ?? "");
  return Response.json(data);
}
