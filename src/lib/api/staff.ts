import { NextResponse } from "next/server";

export const staffErrorResponse = (code: string, message: string, status: number) =>
  NextResponse.json({ code, error: message }, { status });

export function staffDatabaseError(message: string) {
  if (message.includes("AUTHENTICATION_REQUIRED")) return staffErrorResponse("AUTHENTICATION_REQUIRED", "Sign in to manage staff access.", 401);
  if (message.includes("ORGANIZATION_SCOPE_DENIED") || message.includes("OWNER_ROLE_REQUIRED")) return staffErrorResponse("FORBIDDEN", "You cannot manage staff for this organization.", 403);
  if (message.includes("MFA_STEP_UP_REQUIRED")) return staffErrorResponse("MFA_REQUIRED", "Verify with MFA before changing sensitive access.", 403);
  if (message.includes("PLAN_LIMIT_EXCEEDED")) return staffErrorResponse("PLAN_LIMIT_EXCEEDED", "This plan has no available staff seats.", 422);
  if (message.includes("MEMBERSHIP_ALREADY_EXISTS")) return staffErrorResponse("MEMBERSHIP_ALREADY_EXISTS", "That person already has current access or a pending invitation.", 409);
  if (message.includes("MEMBERSHIP_VERSION_CONFLICT")) return staffErrorResponse("VERSION_CONFLICT", "This staff record changed. Refresh and try again.", 409);
  if (message.includes("PROPERTY_SCOPE_REQUIRED")) return staffErrorResponse("PROPERTY_SCOPE_REQUIRED", "Choose at least one property for this role.", 422);
  if (message.includes("PROPERTY_SCOPE_DENIED")) return staffErrorResponse("PROPERTY_SCOPE_DENIED", "One or more properties are outside this organization.", 403);
  if (message.includes("CANNOT_CHANGE_SELF") || message.includes("CANNOT_REVOKE_SELF") || message.includes("SOLE_OWNER_REQUIRED")) return staffErrorResponse("PROTECTED_MEMBERSHIP", "This protected membership cannot be changed that way.", 422);
  if (message.includes("AUDIT_REASON_REQUIRED")) return staffErrorResponse("AUDIT_REASON_REQUIRED", "Add a reason for this sensitive access change.", 422);
  if (message.includes("INVITATION_RECIPIENT_MISMATCH")) return staffErrorResponse("INVITATION_RECIPIENT_MISMATCH", "Sign in with the email address that received this invitation.", 403);
  if (message.includes("INVITATION_EXPIRED") || message.includes("INVITATION_NOT_PENDING")) return staffErrorResponse("INVITATION_UNAVAILABLE", "This invitation has expired or is no longer active.", 410);
  if (message.includes("IDEMPOTENCY_CONFLICT")) return staffErrorResponse("IDEMPOTENCY_CONFLICT", "This retry no longer matches the original request.", 409);
  return staffErrorResponse("STAFF_ACCESS_FAILED", "The staff access change could not be completed.", 422);
}
