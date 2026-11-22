import { NextResponse } from "next/server";
import { resolveEsignConsent } from "@/lib/data/signatures";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { signDocumentSchema } from "@/lib/validation/documents";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  const { deliveryId } = await params;
  const parsed = signDocumentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the signing details.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to sign this document.", 401);

  const input = parsed.data;
  const consent = resolveEsignConsent();
  if (!consent) return errorResponse("The published signing disclosure is unavailable.", 503);
  if (input.esignConsentVersion !== consent.version) {
    return errorResponse("The signing disclosure changed. Reload and review it again.", 409);
  }

  const result = await recordSignature(deliveryId, auth.user.id, input, consent.version, request.headers.get("idempotency-key"));
  if (!result) return errorResponse("Signing is temporarily unavailable. Retry to check the signing result.", 503);
  const { data, error } = result;

  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("DOCUMENT_DELIVERY_FORBIDDEN")) return errorResponse("This document was delivered to a different recipient.", 403);
    if (code.includes("DOCUMENT_DELIVERY_NOT_FOUND") || code.includes("DOCUMENT_VERSION_NOT_FOUND")) return errorResponse("That document was not found.", 404);
    if (code.includes("DOCUMENT_ALREADY_SIGNED")) return errorResponse("You have already signed this document.", 409);
    if (code.includes("DOCUMENT_REVIEW_CHANGED")) return errorResponse("The reviewed document changed. Reload and review it again.", 409);
    if (code.includes("ESIGN_CONSENT_VERSION_CHANGED")) return errorResponse("The signing disclosure changed. Reload and review it again.", 409);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original signing.", 409);
    if (code.includes("COMMAND_IN_PROGRESS")) return errorResponse("This signature is already being recorded. Try again in a moment.", 409);
    if (code.includes("DOCUMENT_NOT_SIGNABLE")) return errorResponse("This document is not available to sign yet.", 422);
    if (code.includes("ESIGN_CONSENT_REQUIRED")) return errorResponse("You must consent to sign electronically.", 422);
    if (code.includes("SIGNING_INTENT_REQUIRED")) return errorResponse("Confirm your intent to sign.", 422);
    if (code.includes("SIGNER_NAME_REQUIRED")) return errorResponse("Enter your full legal name.", 422);
    if (code.includes("ESIGN_CONSENT_VERSION_REQUIRED")) return errorResponse("The consent disclosure version is missing.", 422);
    if (code.includes("INVALID_IDEMPOTENCY_KEY")) return errorResponse("Check the signing details.", 422);
    return errorResponse("Your signature could not be recorded.", 422);
  }

  return NextResponse.json(data, { status: 201, headers: { "cache-control": "no-store" } });
}

async function recordSignature(
  deliveryId: string,
  actorId: string,
  input: ReturnType<typeof signDocumentSchema.parse>,
  version: string,
  idempotencyKey: string | null,
) {
  try {
    return await createAdminClient().rpc("sign_reviewed_document", {
      p_actor_user_id: actorId,
      p_organization_id: input.organizationId,
      p_document_delivery_id: deliveryId,
      p_reviewed_version_id: input.reviewedVersionId,
      p_reviewed_sha256: input.reviewedSha256,
      p_signer_name: input.signerName,
      p_esign_consent_version: version,
      p_idempotency_key: idempotencyKey ?? crypto.randomUUID(),
    });
  } catch {
    return null;
  }
}
