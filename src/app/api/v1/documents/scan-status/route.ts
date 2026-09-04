import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

/**
 * The scan state of specific documents, by id.
 *
 * This exists so the operator can watch completion evidence move through the asynchronous scan
 * lifecycle — quarantined → scanning → clean|rejected — instead of uploading and immediately failing
 * completion because the bytes have not been scanned yet. It reads, it never mutates: the authoritative
 * clean-evidence rule stays in transition_work_order, which refuses evidence that is not clean.
 *
 * Authorization is RLS, not a hand-rolled check. document_versions carries document_versions_parent_read
 * (select to authenticated), so this select returns a row only for a document the caller may already
 * see — an id belonging to another organization simply yields nothing, which the UI reads as "unknown".
 * The ids come from the caller's own upload responses, so this is a status poll, not a directory.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  // A bounded, sane request. Evidence per work order is capped at 10 by the completion command, so a
  // caller asking about hundreds of ids at once is not a real completion screen.
  if (ids.length === 0) return NextResponse.json({ versions: [] });
  if (ids.length > 50) return errorResponse("Too many documents requested at once.", 400);
  if (!ids.every((id) => /^[0-9a-f-]{36}$/i.test(id))) return errorResponse("A document id is malformed.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to view document status.", 401);

  const { data, error } = await supabase
    .from("document_versions")
    .select("document_id,version_number,original_filename,upload_status")
    .in("document_id", ids)
    .order("version_number", { ascending: false });
  if (error) return errorResponse("Document status is unavailable.", 502);

  // Highest version per document wins — evidence is single-version today, but the ordering makes that an
  // observation rather than an assumption the next multi-version document would quietly break.
  const latest = new Map<string, { documentId: string; filename: string | null; uploadStatus: string }>();
  for (const row of data ?? []) {
    const documentId = String(row.document_id);
    if (!latest.has(documentId)) {
      latest.set(documentId, {
        documentId,
        filename: row.original_filename === null || row.original_filename === undefined ? null : String(row.original_filename),
        uploadStatus: String(row.upload_status),
      });
    }
  }
  return NextResponse.json({ versions: [...latest.values()] });
}
