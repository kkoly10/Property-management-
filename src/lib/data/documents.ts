import "server-only";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type DocumentCenterItem = {
  id: string;
  title: string;
  documentType: string;
  propertyName: string | null;
  source: string;
  status: string;
  createdAt: string;
  versionNumber: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadStatus: string;
};

export type DocumentCenterState = {
  mode: "setup" | "ready" | "error";
  organizationId: string | null;
  properties: Array<{ id: string; name: string }>;
  documents: DocumentCenterItem[];
  requestId?: string;
};

export async function getDocumentCenterState(): Promise<DocumentCenterState> {
  if (!getPublicSupabaseConfig()) {
    return {
      mode: "setup",
      organizationId: "20000000-0000-4000-8000-000000000002",
      properties: [{ id: "30000000-0000-4000-8000-000000000003", name: "Maple Court" }],
      documents: [{
        id: "preview-document", title: "Maple Court signed lease", documentType: "signed_lease",
        propertyName: "Maple Court", source: "operator_supplied", status: "active",
        createdAt: new Date().toISOString(), versionNumber: 1, originalFilename: "maple-court-lease.pdf",
        mimeType: "application/pdf", sizeBytes: 482_310, uploadStatus: "quarantined",
      }],
    };
  }

  try {
    const supabase = await createClient();
    const [{ data: organizations, error: organizationError }, { data: properties, error: propertyError }, { data: documents, error: documentError }] = await Promise.all([
      supabase.from("organizations").select("id").order("created_at").limit(1),
      supabase.from("properties").select("id,name").order("name"),
      supabase.from("documents").select("id,title,document_type,property_id,source,status,created_at").order("created_at", { ascending: false }),
    ]);
    if (organizationError || propertyError || documentError) throw organizationError ?? propertyError ?? documentError;

    const documentIds = (documents ?? []).map((document) => document.id);
    const versionResult = documentIds.length
      ? await supabase.from("document_versions").select("document_id,version_number,original_filename,mime_type,size_bytes,upload_status").in("document_id", documentIds).order("version_number", { ascending: false })
      : { data: [], error: null };
    if (versionResult.error) throw versionResult.error;

    const propertyNames = new Map((properties ?? []).map((property) => [property.id, property.name]));
    const latestVersions = new Map<string, NonNullable<typeof versionResult.data>[number]>();
    for (const version of versionResult.data ?? []) if (!latestVersions.has(version.document_id)) latestVersions.set(version.document_id, version);

    return {
      mode: "ready",
      organizationId: organizations?.[0]?.id ?? null,
      properties: properties ?? [],
      documents: (documents ?? []).flatMap((document) => {
        const version = latestVersions.get(document.id);
        if (!version) return [];
        return [{
          id: document.id, title: document.title, documentType: document.document_type,
          propertyName: document.property_id ? propertyNames.get(document.property_id) ?? "Property" : null,
          source: document.source, status: document.status, createdAt: document.created_at,
          versionNumber: version.version_number, originalFilename: version.original_filename,
          mimeType: version.mime_type, sizeBytes: version.size_bytes, uploadStatus: version.upload_status,
        }];
      }),
    };
  } catch {
    return { mode: "error", organizationId: null, properties: [], documents: [], requestId: crypto.randomUUID() };
  }
}
