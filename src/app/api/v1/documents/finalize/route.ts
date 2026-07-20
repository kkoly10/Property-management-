import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { finalizeDocumentSchema } from "@/lib/validation/documents";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const parsed = finalizeDocumentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("The upload receipt is invalid.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to finalize documents.", 401);

  const inspected = await supabase.rpc("inspect_document_upload_grant", { p_grant_id: parsed.data.grantId });
  if (inspected.error || !inspected.data) return errorResponse("The upload grant expired or is unavailable.", 422);
  const grant = inspected.data as {
    storageBucket: string;
    storagePath: string;
    requestedSizeBytes: number;
  };

  const downloaded = await supabase.storage.from(grant.storageBucket).download(grant.storagePath);
  if (downloaded.error || !downloaded.data) return errorResponse("The uploaded file could not be verified.", 422);
  if (downloaded.data.size !== grant.requestedSizeBytes) return errorResponse("The uploaded file size changed during transfer.", 422);

  const digest = await crypto.subtle.digest("SHA-256", await downloaded.data.arrayBuffer());
  const verifiedSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (verifiedSha256 !== parsed.data.sha256Hex.toLowerCase()) return errorResponse("The uploaded file checksum does not match.", 422);

  const idempotencyKey = request.headers.get("idempotency-key") ?? crypto.randomUUID();
  const finalized = await createAdminClient().rpc("finalize_document", {
    p_actor_user_id: auth.user.id,
    p_grant_id: parsed.data.grantId,
    p_sha256_hex: verifiedSha256,
    p_idempotency_key: idempotencyKey,
  });
  if (finalized.error || !finalized.data) return errorResponse("The document could not be finalized.", 422);

  return NextResponse.json(finalized.data, { status: 201 });
}
