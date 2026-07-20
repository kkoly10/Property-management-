import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await context.params;
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Sign in to download documents." }, { status: 401 });

  const { data: version, error } = await supabase
    .from("document_versions")
    .select("storage_bucket,storage_path,original_filename,upload_status")
    .eq("document_id", documentId)
    .eq("upload_status", "clean")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !version) return NextResponse.json({ error: "No scanned version is available." }, { status: 404 });

  const signed = await supabase.storage.from(version.storage_bucket).createSignedUrl(version.storage_path, 60, { download: version.original_filename });
  if (signed.error || !signed.data) return NextResponse.json({ error: "The private download could not be prepared." }, { status: 502 });
  return NextResponse.redirect(signed.data.signedUrl, 303);
}
