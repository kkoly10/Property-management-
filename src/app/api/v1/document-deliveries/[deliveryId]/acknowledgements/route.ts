import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { acknowledgeDocumentDeliverySchema } from "@/lib/validation/documents";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  const { deliveryId } = await params;
  const parsed = acknowledgeDocumentDeliverySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the acknowledgement details.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to acknowledge this document.", 401);

  const acknowledgement = parsed.data;
  const { data, error } = await supabase.rpc("acknowledge_document_delivery", {
    p_organization_id: acknowledgement.organizationId,
    p_document_delivery_id: deliveryId,
    p_acknowledgement_type: acknowledgement.acknowledgementType,
    p_evidence_hash: acknowledgement.evidenceHash,
    p_legal_document_version: acknowledgement.legalDocumentVersion ?? null,
    p_idempotency_key: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
  });

  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("DOCUMENT_DELIVERY_FORBIDDEN")) return errorResponse("This document was delivered to a different recipient.", 403);
    if (code.includes("DOCUMENT_DELIVERY_NOT_FOUND")) return errorResponse("That delivery was not found.", 404);
    if (code.includes("DOCUMENT_DELIVERY_ALREADY_ACKNOWLEDGED")) return errorResponse("You have already recorded that acknowledgement.", 409);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original acknowledgement.", 409);
    if (code.includes("COMMAND_IN_PROGRESS")) return errorResponse("This acknowledgement is already being recorded. Try again in a moment.", 409);
    if (code.includes("INVALID_ACKNOWLEDGEMENT_TYPE") || code.includes("INVALID_EVIDENCE_HASH")) return errorResponse("Check the acknowledgement details.", 422);
    return errorResponse("The acknowledgement could not be recorded.", 422);
  }

  return NextResponse.json(data, { status: 201 });
}
