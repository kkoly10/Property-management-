import "server-only";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { importSourceMimeTypes } from "@/lib/imports/source-mime";

export type ImportTotals = { rows: number; valid: number; warnings: number; errors: number; creates: number; updates: number; skips: number };
export type ImportError = { row: number; field?: string; code: string; message: string };
export type ImportJobListItem = {
  id: string; importType: string; status: string; sourceDocumentId: string; sourceTitle: string;
  createdAt: string; committedAt: string | null; totals: ImportTotals;
};
export type ImportSourceDocument = { id: string; title: string; filename: string };
export type ImportCenterState = {
  mode: "setup" | "ready" | "error"; organizationId: string | null;
  jobs: ImportJobListItem[]; sourceDocuments: ImportSourceDocument[]; requestId?: string;
};
export type ImportJobDetail = {
  id: string; organizationId: string; importType: string; status: string; sourceDocumentId: string;
  sourceTitle: string; sourceHeaders: string[]; mapping: { columns?: Record<string, string>; options?: { dedupeMode: "strict" | "review"; dateLocale: string } };
  summary: { totals?: ImportTotals; errors?: ImportError[]; validationHash?: string; commitResponse?: { committed: Record<string, number>; reportDocumentId: string } };
  validationHash: string | null; errorMessage: string | null; createdAt: string; committedAt: string | null;
  rows: Array<{ row: number; source: Record<string, string>; errors: ImportError[]; action: string | null }>;
};

const emptyTotals: ImportTotals = { rows: 0, valid: 0, warnings: 0, errors: 0, creates: 0, updates: 0, skips: 0 };

export async function getImportCenterState(): Promise<ImportCenterState> {
  if (!getPublicSupabaseConfig()) return {
    mode: "setup", organizationId: "20000000-0000-4000-8000-000000000002",
    sourceDocuments: [{ id: "91000000-0000-4000-8000-000000000001", title: "Portfolio template — July", filename: "portfolio-july.csv" }],
    jobs: [{ id: "preview-import", importType: "portfolio", status: "mapping", sourceDocumentId: "preview-source", sourceTitle: "Portfolio template — July", createdAt: new Date().toISOString(), committedAt: null, totals: { rows: 100, valid: 98, warnings: 0, errors: 2, creates: 126, updates: 0, skips: 0 } }],
  };
  try {
    const supabase = await createClient();
    // Resolve the acting organization FIRST, then scope everything to it. An operator may belong to
    // several organizations — that is the property-manager model — and RLS lets them read documents
    // from all of them. Listing unscoped sources offered a document from one organization while the
    // form posted a different organizationId, which the API then refused as not available. Scoping
    // here keeps the page's offer and its action talking about the same tenant.
    const { data: organizations, error: organizationError } = await supabase
      .from("organizations").select("id").order("created_at").limit(1);
    if (organizationError) throw organizationError;
    const organizationId = organizations?.[0]?.id ?? null;
    if (!organizationId) return { mode: "ready", organizationId: null, jobs: [], sourceDocuments: [] };

    const [{ data: jobs, error: jobError }, { data: documents, error: documentError }] = await Promise.all([
      supabase.from("import_jobs").select("id,import_type,status,source_document_id,summary,created_at,committed_at")
        .eq("organization_id", organizationId).order("created_at", { ascending: false }),
      supabase.from("documents").select("id,title,property_id")
        .eq("organization_id", organizationId).is("property_id", null).order("created_at", { ascending: false }),
    ]);
    if (jobError || documentError) throw jobError ?? documentError;
    const documentIds = (documents ?? []).map((document) => document.id);
    const versions = documentIds.length
      ? await supabase.from("document_versions").select("document_id,original_filename,upload_status,mime_type,version_number").in("document_id", documentIds).eq("upload_status", "clean").in("mime_type", [...importSourceMimeTypes]).order("version_number", { ascending: false })
      : { data: [], error: null };
    if (versions.error) throw versions.error;
    const cleanVersionByDocument = new Map<string, NonNullable<typeof versions.data>[number]>();
    for (const version of versions.data ?? []) if (!cleanVersionByDocument.has(version.document_id)) cleanVersionByDocument.set(version.document_id, version);
    const titles = new Map((documents ?? []).map((document) => [document.id, document.title]));
    return {
      mode: "ready", organizationId,
      sourceDocuments: (documents ?? []).flatMap((document) => {
        const version = cleanVersionByDocument.get(document.id);
        return version ? [{ id: document.id, title: document.title, filename: version.original_filename }] : [];
      }),
      jobs: (jobs ?? []).map((job) => ({
        id: job.id, importType: job.import_type, status: job.status, sourceDocumentId: job.source_document_id,
        sourceTitle: titles.get(job.source_document_id) ?? "Portfolio source", createdAt: job.created_at,
        committedAt: job.committed_at, totals: (job.summary as { totals?: ImportTotals } | null)?.totals ?? emptyTotals,
      })),
    };
  } catch {
    return { mode: "error", organizationId: null, jobs: [], sourceDocuments: [], requestId: crypto.randomUUID() };
  }
}

export async function getImportJobDetail(importJobId: string): Promise<{ mode: "setup" | "ready" | "error"; job: ImportJobDetail | null; requestId?: string }> {
  if (!getPublicSupabaseConfig()) return {
    mode: "setup",
    job: {
      id: importJobId, organizationId: "20000000-0000-4000-8000-000000000002", importType: "portfolio", status: "mapping",
      sourceDocumentId: "preview-source", sourceTitle: "Portfolio template — July",
      sourceHeaders: ["Property Name","Property Type","Address","City","State","Postal","Country","Time Zone","Unit","Unit Type","Beds","Baths","Sq Ft"],
      mapping: {}, summary: { totals: { rows: 3, valid: 0, warnings: 0, errors: 0, creates: 0, updates: 0, skips: 0 } },
      validationHash: null, errorMessage: null, createdAt: new Date().toISOString(), committedAt: null,
      rows: [
        { row: 1, source: { "Property Name":"Maple Court", Unit:"101", Address:"100 Maple Street" }, errors: [], action: null },
        { row: 2, source: { "Property Name":"Maple Court", Unit:"102", Address:"100 Maple Street" }, errors: [], action: null },
        { row: 3, source: { "Property Name":"Oak House", Unit:"", Address:"42 Oak Avenue" }, errors: [], action: null },
      ],
    },
  };
  try {
    const supabase = await createClient();
    const detail = await supabase.rpc("get_import_job_detail", { p_import_job_id: importJobId });
    if (detail.error || !detail.data) return { mode: "ready", job: null };
    const raw = detail.data as Omit<ImportJobDetail, "sourceTitle" | "sourceHeaders">;
    const { data: source } = await supabase.from("documents").select("title").eq("id", raw.sourceDocumentId).maybeSingle();
    return {
      mode: "ready",
      job: { ...raw, sourceTitle: source?.title ?? "Portfolio source", sourceHeaders: (raw.summary as { sourceHeaders?: string[] }).sourceHeaders ?? [] },
    };
  } catch {
    return { mode: "error", job: null, requestId: crypto.randomUUID() };
  }
}
