import { NextResponse } from "next/server";
import { CsvImportError, parseCsv } from "@/lib/imports/csv";
import { parseXlsx, XlsxImportError } from "@/lib/imports/xlsx";
import { createClient } from "@/lib/supabase/server";
import { createImportJobSchema } from "@/lib/validation/imports";

const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const parsed = createImportJobSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Choose a valid portfolio source document.", 400);
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to create an import.", 401);

  const { data: sourceDocument, error: documentError } = await supabase
    .from("documents").select("id,organization_id,property_id").eq("id", parsed.data.sourceDocumentId).maybeSingle();
  if (documentError || !sourceDocument || sourceDocument.organization_id !== parsed.data.organizationId || sourceDocument.property_id) {
    return errorResponse("The source document is not available to this organization.", 403);
  }
  const { data: sourceVersion, error: versionError } = await supabase
    .from("document_versions")
    .select("id,storage_bucket,storage_path,mime_type,upload_status")
    .eq("document_id", sourceDocument.id)
    .eq("upload_status", "clean")
    .in("mime_type", ["text/csv", "application/vnd.ms-excel", XLSX_MIME_TYPE])
    .order("version_number", { ascending: false }).limit(1).maybeSingle();
  if (versionError || !sourceVersion) return errorResponse("The source file must pass malware scanning before import.", 422);

  const downloaded = await supabase.storage.from(sourceVersion.storage_bucket).download(sourceVersion.storage_path);
  if (downloaded.error || !downloaded.data) return errorResponse("The immutable source file could not be read.", 422);
  // The stored mime type decides the parser: an .xlsx is a ZIP of XML and cannot be read as text.
  let table: { headers: string[]; rows: Array<Record<string, string>> };
  try {
    table =
      sourceVersion.mime_type === XLSX_MIME_TYPE
        ? parseXlsx(await downloaded.data.arrayBuffer())
        : parseCsv(await downloaded.data.text());
  } catch (error) {
    if (error instanceof CsvImportError || error instanceof XlsxImportError) return errorResponse(error.message, 422);
    return errorResponse("The source file could not be parsed.", 422);
  }

  const created = await supabase.rpc("create_import_job", {
    p_organization_id: parsed.data.organizationId,
    p_import_type: parsed.data.importType,
    p_source_document_id: sourceDocument.id,
    p_source_document_version_id: sourceVersion.id,
    p_source_headers: table.headers,
    p_source_rows: table.rows,
    p_idempotency_key: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
  });
  if (created.error || !created.data) {
    const denied = created.error?.message.includes("DENIED");
    const plan = created.error?.message.includes("PLAN_LIMIT");
    return errorResponse(plan ? "Bulk import is not included in this plan." : denied ? "Organization-wide property access is required." : "The import job could not be created.", plan ? 402 : denied ? 403 : 422);
  }
  return NextResponse.json(created.data, { status: 201 });
}
