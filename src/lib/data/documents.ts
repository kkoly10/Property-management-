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

export type RecipientDocumentDelivery = {
  deliveryId: string;
  organizationId: string;
  documentId: string | null;
  title: string;
  documentType: string;
  versionNumber: number | null;
  sha256Hex: string | null;
  deliveredAt: string | null;
  status: string;
  acknowledgements: Array<{ type: string; acknowledgedAt: string }>;
};

export type RecipientDocumentDeliveriesState = {
  mode: "setup" | "ready" | "error";
  items: RecipientDocumentDelivery[];
  requestId?: string;
};

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function getRecipientDocumentDeliveries(): Promise<RecipientDocumentDeliveriesState> {
  if (!getPublicSupabaseConfig()) {
    return {
      mode: "setup",
      items: [{
        deliveryId: "preview-delivery", organizationId: "20000000-0000-4000-8000-000000000002",
        documentId: "preview-document", title: "Signed lease — Unit 101", documentType: "signed_lease",
        versionNumber: 1, sha256Hex: "a".repeat(64), deliveredAt: new Date().toISOString(), status: "delivered",
        acknowledgements: [],
      }],
    };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("document_deliveries")
      // document_versions has two FKs to documents (a single-column document_id FK and a
      // composite organization_id+document_id FK), so the embed must name the FK explicitly
      // or PostgREST returns PGRST201 ("more than one relationship was found").
      .select("id,organization_id,delivered_at,status,document_version_id,document_versions(version_number,sha256_hex,document_id,documents!document_versions_document_id_fkey(id,title,document_type)),document_acknowledgements(acknowledgement_type,acknowledged_at)")
      .order("delivered_at", { ascending: false });
    if (error) throw error;

    const items: RecipientDocumentDelivery[] = (data ?? []).map((delivery) => {
      const version = firstOf(delivery.document_versions as never);
      const document = version ? firstOf((version as { documents?: unknown }).documents as never) : null;
      const acknowledgements = (Array.isArray(delivery.document_acknowledgements) ? delivery.document_acknowledgements : [])
        .map((ack: { acknowledgement_type: string; acknowledged_at: string }) => ({ type: ack.acknowledgement_type, acknowledgedAt: ack.acknowledged_at }));
      return {
        deliveryId: delivery.id as string,
        organizationId: delivery.organization_id as string,
        documentId: (document as { id?: string } | null)?.id ?? null,
        title: (document as { title?: string } | null)?.title ?? "Delivered document",
        documentType: (document as { document_type?: string } | null)?.document_type ?? "document",
        versionNumber: (version as { version_number?: number } | null)?.version_number ?? null,
        sha256Hex: (version as { sha256_hex?: string } | null)?.sha256_hex ?? null,
        deliveredAt: (delivery.delivered_at as string | null) ?? null,
        status: delivery.status as string,
        acknowledgements,
      };
    });
    return { mode: "ready", items };
  } catch {
    return { mode: "error", items: [], requestId: crypto.randomUUID() };
  }
}

/**
 * The document centre for ONE organization.
 *
 * This previously computed `organizationId` from `organizations.order(created_at).limit(1)` while
 * listing `properties` and `documents` completely unscoped — so an operator in two organizations saw a
 * merged document list attached to an upload form bound to only one of them. The organization is now
 * supplied by the caller and every query is filtered by it.
 */
export async function getDocumentCenterState(organizationId: string | null): Promise<DocumentCenterState> {
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

  // No context, no data. Guessing an organization here is the defect this parameter removes.
  if (!organizationId) return { mode: "error", organizationId: null, properties: [], documents: [] };

  try {
    const supabase = await createClient();
    const [{ data: properties, error: propertyError }, { data: documents, error: documentError }] = await Promise.all([
      supabase.from("properties").select("id,name").eq("organization_id", organizationId).order("name"),
      supabase.from("documents").select("id,title,document_type,property_id,source,status,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    ]);
    if (propertyError || documentError) throw propertyError ?? documentError;

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
      organizationId,
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
