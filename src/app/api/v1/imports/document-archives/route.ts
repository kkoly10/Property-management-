import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { documentArchiveMimeTypes } from "@/lib/imports/source-mime";
import { DocumentArchiveError, readDocumentArchive, validateManifestRow, normalizeArchivePath } from "@/lib/imports/document-archive";
import { resolveManifestTargets } from "@/lib/imports/document-archive-targets";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  organizationId: z.uuid(),
  sourceDocumentId: z.uuid(),
  /** "validate" previews without writing anything; "commit" ingests each described file. */
  mode: z.enum(["validate", "commit"]).default("validate"),
});

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

/**
 * Ingests a ZIP of documents described by a manifest.
 *
 * Commit drives the EXISTING single-file ingestion pipeline once per manifest row — an upload grant
 * (which re-checks permission, mime, and size in the database), the upload, then finalize_document —
 * rather than introducing a second way to create a document. Versions therefore land 'quarantined'
 * exactly like a hand-uploaded file, so nothing skips the malware-scan gate.
 *
 * Unlike the row-oriented import legs this commit is NOT one transaction: each file is its own grant
 * and finalize. That is deliberate for blob ingestion — a partial run is reported per row and
 * re-running completes the remainder, which is far better than losing an entire archive to one bad
 * file. Nothing financial is written here.
 */
export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Choose a valid document archive.", 400);
  const { organizationId, sourceDocumentId, mode } = parsed.data;

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to import documents.", 401);

  const { data: sourceDocument, error: documentError } = await supabase
    .from("documents").select("id,organization_id,property_id").eq("id", sourceDocumentId).maybeSingle();
  if (documentError || !sourceDocument || sourceDocument.organization_id !== organizationId) {
    return errorResponse("The source archive is not available to this organization.", 403);
  }
  const { data: sourceVersion, error: versionError } = await supabase
    .from("document_versions")
    .select("id,storage_bucket,storage_path,mime_type,upload_status")
    .eq("document_id", sourceDocument.id)
    .eq("upload_status", "clean")
    .in("mime_type", [...documentArchiveMimeTypes])
    .order("version_number", { ascending: false }).limit(1).maybeSingle();
  if (versionError || !sourceVersion) return errorResponse("The archive must pass malware scanning before import.", 422);

  const downloaded = await supabase.storage.from(sourceVersion.storage_bucket).download(sourceVersion.storage_path);
  if (downloaded.error || !downloaded.data) return errorResponse("The immutable source archive could not be read.", 422);

  let archive: ReturnType<typeof readDocumentArchive>;
  try {
    archive = readDocumentArchive(await downloaded.data.arrayBuffer());
  } catch (error) {
    return errorResponse(error instanceof DocumentArchiveError ? error.message : "The archive could not be read.", 422);
  }

  const structuralIssues = archive.manifest.flatMap((row) => validateManifestRow(row, archive.files));
  let targets;
  try {
    targets = await resolveManifestTargets(supabase, organizationId, archive.manifest);
  } catch {
    return errorResponse("The manifest targets could not be resolved.", 422);
  }

  // Only rows with no structural problem are target-resolved, so one bad path cannot mask a bad target.
  const structuralRows = new Set(structuralIssues.map((issue) => issue.row));
  const issues = [...structuralIssues, ...targets.issues.filter((issue) => !structuralRows.has(issue.row))];
  const blocked = new Set(issues.map((issue) => issue.row));
  const ready = archive.manifest.filter((row) => !blocked.has(row.rowNumber) && targets.resolved.has(row.rowNumber));

  if (mode === "validate") {
    return NextResponse.json({
      mode: "validate",
      totals: { rows: archive.manifest.length, valid: ready.length, errors: issues.length, filesInArchive: archive.files.size },
      preview: ready.slice(0, 50).map((row) => ({
        row: row.rowNumber, file: row.filePath, title: row.title, documentType: row.documentType,
        targetType: row.targetType, parentType: targets.resolved.get(row.rowNumber)!.parentType,
      })),
      errors: issues.slice(0, 200),
    });
  }

  if (issues.length > 0) {
    return NextResponse.json({ error: "Fix every manifest error before importing.", errors: issues.slice(0, 200) }, { status: 422 });
  }

  const imported: Array<{ row: number; documentId: string; file: string }> = [];
  const failures: Array<{ row: number; file: string; code: string; message: string }> = [];

  for (const row of ready) {
    const target = targets.resolved.get(row.rowNumber)!;
    const file = archive.files.get(normalizeArchivePath(row.filePath)!.toLowerCase())!;
    // Deterministic per (archive version, manifest ROW, file): re-running the same archive reuses the
    // same keys, so an interrupted import resumes instead of duplicating what already landed. The row
    // number is part of the scope on purpose — a manifest may legitimately point two rows at one file
    // (a lease covering two units), and without it those rows would collide on one grant key and the
    // second would fail as an idempotency conflict instead of producing its own document.
    const scope = `${sourceVersion.id}:${row.rowNumber}:${file.path.toLowerCase()}`;
    const digest = createHash("sha256").update(scope).digest("hex").slice(0, 24);

    const grant = await supabase.rpc("create_document_upload_grant", {
      p_organization_id: organizationId,
      p_parent_resource_type: target.parentType,
      p_parent_resource_id: target.parentId,
      p_document_type: row.documentType,
      p_title: row.title,
      p_original_filename: file.path.split("/").pop() ?? "document",
      p_mime_type: file.mimeType,
      p_size_bytes: file.sizeBytes,
      p_idempotency_key: `archive-grant-${digest}`,
    });
    const issued = grant.data as { grantId?: string; storagePath?: string; storageBucket?: string } | null;
    if (grant.error || !issued?.grantId || !issued.storagePath || !issued.storageBucket) {
      const code = grant.error?.message ?? "GRANT_FAILED";
      failures.push({ row: row.rowNumber, file: row.filePath, code: "GRANT_FAILED", message: code.includes("SCOPE_DENIED") ? "You do not have document access for this target." : "An upload grant could not be issued for this file." });
      continue;
    }

    // Upload into the bucket the GRANT names, not the one the source archive happens to live in. The
    // storage policy authorizes an upload by matching (bucket, path) against the grant, and
    // finalize_document records the grant's bucket — so borrowing the source's bucket only works
    // while the two coincide, and would otherwise be denied or record a version pointing at nothing.
    const uploaded = await supabase.storage
      .from(issued.storageBucket)
      .upload(issued.storagePath, file.bytes, { contentType: file.mimeType, upsert: true });
    if (uploaded.error) {
      failures.push({ row: row.rowNumber, file: row.filePath, code: "UPLOAD_FAILED", message: "That file could not be stored." });
      continue;
    }

    const finalized = await supabase.rpc("finalize_document", {
      p_actor_user_id: auth.user.id,
      p_grant_id: issued.grantId,
      p_sha256_hex: createHash("sha256").update(file.bytes).digest("hex"),
      p_idempotency_key: `archive-finalize-${digest}`,
    });
    const record = finalized.data as { documentId?: string } | null;
    if (finalized.error || !record?.documentId) {
      failures.push({ row: row.rowNumber, file: row.filePath, code: "FINALIZE_FAILED", message: "That file was stored but could not be recorded." });
      continue;
    }
    imported.push({ row: row.rowNumber, documentId: record.documentId, file: row.filePath });
  }

  return NextResponse.json(
    {
      mode: "commit",
      totals: { rows: archive.manifest.length, imported: imported.length, failed: failures.length },
      imported,
      failures,
    },
    { status: failures.length > 0 ? 207 : 201 },
  );
}
