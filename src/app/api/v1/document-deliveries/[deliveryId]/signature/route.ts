import { NextResponse } from "next/server";
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
  // Captured server-side, never from the request body: a signer must not be able to author their own
  // evidence. x-forwarded-for is set by the Vercel edge and is the observed client address; the command
  // parses the first entry of the list and never fails on a malformed header.
  const ipAddress = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip");
  const userAgent = request.headers.get("user-agent");

  const { data, error } = await supabase.rpc("sign_document", {
    p_organization_id: input.organizationId,
    p_document_delivery_id: deliveryId,
    p_signer_name: input.signerName,
    p_esign_consent_agreed: input.esignConsentAgreed,
    p_esign_consent_version: input.esignConsentVersion,
    p_intent_affirmed: input.intentAffirmed,
    p_intent_statement: input.intentStatement,
    p_ip_address: ipAddress,
    p_user_agent: userAgent,
    p_idempotency_key: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
  });

  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("DOCUMENT_DELIVERY_FORBIDDEN")) return errorResponse("This document was delivered to a different recipient.", 403);
    if (code.includes("DOCUMENT_DELIVERY_NOT_FOUND") || code.includes("DOCUMENT_VERSION_NOT_FOUND")) return errorResponse("That document was not found.", 404);
    if (code.includes("DOCUMENT_ALREADY_SIGNED")) return errorResponse("You have already signed this document.", 409);
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
