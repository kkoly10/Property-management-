import { NextResponse } from "next/server";

export const invitationErrorResponse = (code: string, message: string, status: number) =>
  NextResponse.json({ code, error: message }, { status });

export function invitationDatabaseError(message: string) {
  if (message.includes("AUTHENTICATION_REQUIRED")) return invitationErrorResponse("AUTHENTICATION_REQUIRED", "Sign in to manage invitations.", 401);
  if (message.includes("PROPERTY_SCOPE_DENIED")) return invitationErrorResponse("PROPERTY_SCOPE_DENIED", "You do not manage a property for this resident or owner.", 403);
  if (message.includes("RELATIONSHIP_NOT_FOUND")) return invitationErrorResponse("RELATIONSHIP_NOT_FOUND", "That resident or owner record was not found.", 404);
  if (message.includes("EMAIL_RELATIONSHIP_MISMATCH")) return invitationErrorResponse("EMAIL_RELATIONSHIP_MISMATCH", "The email does not match the resident or owner record. Update the record first.", 422);
  if (message.includes("INVITED_USER_EMAIL_MISMATCH")) return invitationErrorResponse("INVITED_USER_EMAIL_MISMATCH", "The invited account does not own this email address.", 422);
  if (message.includes("RELATIONSHIP_ALREADY_ACTIVE")) return invitationErrorResponse("RELATIONSHIP_ALREADY_ACTIVE", "This resident or owner already has an active portal account.", 409);
  if (message.includes("REDIRECT_SURFACE_MISMATCH")) return invitationErrorResponse("REDIRECT_SURFACE_MISMATCH", "The portal must match the relationship type.", 422);
  if (message.includes("INVITATION_RECIPIENT_MISMATCH")) return invitationErrorResponse("INVITATION_RECIPIENT_MISMATCH", "Sign in with the email address that received this invitation.", 403);
  if (message.includes("INVITATION_EXPIRED") || message.includes("INVITATION_NOT_PENDING")) return invitationErrorResponse("INVITATION_UNAVAILABLE", "This invitation has expired or is no longer active. Ask your property team to resend it.", 410);
  if (message.includes("INVITATION_NOT_FOUND")) return invitationErrorResponse("INVITATION_NOT_FOUND", "This invitation could not be found.", 404);
  if (message.includes("RELATIONSHIP_NOT_INVITED")) return invitationErrorResponse("RELATIONSHIP_NOT_INVITED", "This invitation is no longer pending.", 410);
  if (message.includes("INVALID_LOCALE") || message.includes("INVALID_REDIRECT_SURFACE") || message.includes("INVALID_RELATIONSHIP_TYPE") || message.includes("INVALID_EMAIL") || message.includes("INVALID_INVITATION_TOKEN")) return invitationErrorResponse("INVALID_REQUEST", "Check the invitation details.", 400);
  if (message.includes("IDEMPOTENCY_CONFLICT")) return invitationErrorResponse("IDEMPOTENCY_CONFLICT", "This retry no longer matches the original invitation.", 409);
  return invitationErrorResponse("INVITATION_FAILED", "The invitation could not be completed.", 422);
}
