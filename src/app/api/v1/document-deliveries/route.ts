import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deliverDocumentSchema } from "@/lib/validation/documents";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const parsed = deliverDocumentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the delivery details.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to deliver a document.", 401);

  const delivery = parsed.data;
  const { data, error } = await supabase.rpc("deliver_document", {
    p_organization_id: delivery.organizationId,
    p_document_version_id: delivery.documentVersionId,
    p_recipient_relationship_type: delivery.recipientRelationshipType,
    p_recipient_relationship_id: delivery.recipientRelationshipId,
    p_delivery_channel: delivery.deliveryChannel,
    p_idempotency_key: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
  });

  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("PROPERTY_SCOPE_DENIED") || code.includes("DOCUMENTS_SCOPE_DENIED")) return errorResponse("You do not have document access for this property.", 403);
    if (code.includes("DOCUMENT_VERSION_NOT_FOUND") || code.includes("DOCUMENT_NOT_FOUND")) return errorResponse("That document was not found.", 404);
    if (code.includes("DELIVERY_RECIPIENT_NOT_FOUND")) return errorResponse("That recipient has no active portal access.", 404);
    if (code.includes("DOCUMENT_NOT_DELIVERABLE")) return errorResponse("This document version has not finished malware scanning.", 422);
    if (code.includes("UNSUPPORTED_DELIVERY_CHANNEL")) return errorResponse("Only in-portal delivery is available right now.", 422);
    if (code.includes("INVALID_DELIVERY_RECIPIENT")) return errorResponse("Choose a recipient to deliver to.", 422);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original delivery.", 409);
    if (code.includes("COMMAND_IN_PROGRESS")) return errorResponse("This delivery is already being recorded. Try again in a moment.", 409);
    return errorResponse("The document could not be delivered.", 422);
  }

  return NextResponse.json(data, { status: 201 });
}
