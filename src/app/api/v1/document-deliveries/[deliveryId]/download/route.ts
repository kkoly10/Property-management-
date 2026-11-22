import { NextResponse } from "next/server";
import { isDocumentDeliveryAvailable } from "@/lib/documents/signing";
import { createClient } from "@/lib/supabase/server";

const responseHeaders = { "cache-control": "private, no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  const { deliveryId } = await params;
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ error: "Sign in to download this delivery." }, { status: 401, headers: responseHeaders });
  }

  const { data, error } = await supabase
    .from("document_deliveries")
    .select("document_version_id,status,expires_at,document_versions(storage_bucket,storage_path,original_filename,upload_status),document_signatures(id)")
    .eq("id", deliveryId)
    .eq("recipient_user_id", auth.user.id)
    .maybeSingle();
  const pinned = Array.isArray(data?.document_versions) ? data.document_versions[0] : data?.document_versions;
  const signed = Array.isArray(data?.document_signatures) ? data.document_signatures.length > 0 : Boolean(data?.document_signatures);
  if (error || !data || !pinned || pinned.upload_status !== "clean" || (!signed && !isDocumentDeliveryAvailable(data.status, data.expires_at))) {
    return NextResponse.json({ error: "The delivered document is unavailable." }, { status: 404, headers: responseHeaders });
  }

  const expectedVersion = new URL(request.url).searchParams.get("version");
  if (expectedVersion && expectedVersion !== data.document_version_id) {
    return NextResponse.json({ error: "The reviewed version changed. Open the signing page again." }, { status: 409, headers: responseHeaders });
  }

  const { data: link, error: linkError } = await supabase.storage
    .from(pinned.storage_bucket)
    .createSignedUrl(pinned.storage_path, 60, { download: pinned.original_filename });
  if (linkError || !link) {
    return NextResponse.json({ error: "The private download could not be prepared." }, { status: 502, headers: responseHeaders });
  }
  return NextResponse.redirect(link.signedUrl, { status: 303, headers: responseHeaders });
}
