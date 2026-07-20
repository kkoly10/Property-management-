import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createUploadGrantSchema } from "@/lib/validation/documents";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
export async function POST(request: Request) {
  const parsed = createUploadGrantSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Check the document details and file type.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to upload documents.", 401);

  const idempotencyKey = request.headers.get("idempotency-key") ?? crypto.randomUUID();
  const { data, error } = await supabase.rpc("create_document_upload_grant", {
    p_organization_id: parsed.data.organizationId,
    p_parent_resource_type: parsed.data.parent.type,
    p_parent_resource_id: parsed.data.parent.id,
    p_document_type: parsed.data.documentType,
    p_title: parsed.data.title,
    p_original_filename: parsed.data.originalFilename,
    p_mime_type: parsed.data.mimeType,
    p_size_bytes: parsed.data.sizeBytes,
    p_idempotency_key: idempotencyKey,
  });
  if (error || !data) {
    const denied = error?.message.includes("DENIED");
    return errorResponse(denied ? "You do not have document access for that location." : "The upload could not be prepared.", denied ? 403 : 422);
  }

  const grant = data as { grantId: string; expiresAt: string; storagePath: string; storageBucket: string };
  const signed = await supabase.storage.from(grant.storageBucket).createSignedUploadUrl(grant.storagePath);
  if (signed.error || !signed.data) return errorResponse("The private upload URL could not be created.", 502);

  return NextResponse.json({
    uploadUrl: signed.data.signedUrl,
    grantId: grant.grantId,
    expiresAt: grant.expiresAt,
    storagePath: grant.storagePath,
  }, { status: 201 });
}
