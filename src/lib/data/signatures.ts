import "server-only";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { buildConsentBinding, findLegalDocument } from "@/lib/legal/registry";

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export type EsignConsentSummary = { version: string; title: string; route: string; effectiveDate: string; body: string };

/**
 * The exact ESIGN disclosure a signer must be shown and consent to, resolved from the versioned legal
 * registry so the version string recorded on the signature pins the precise bytes that were presented.
 */
function resolveEsignConsent(): EsignConsentSummary | null {
  const doc = findLegalDocument("esign_consent", { locale: "en-US" });
  if (!doc) return null;
  const binding = buildConsentBinding([doc]);
  return { version: binding.version, title: doc.title, route: doc.route, effectiveDate: doc.effectiveDate, body: doc.body };
}

export type SignableDelivery = {
  deliveryId: string;
  organizationId: string;
  documentId: string | null;
  title: string;
  documentType: string;
  versionNumber: number | null;
  sha256Hex: string | null;
  /** True only when the version is scanned-clean, the delivery reached the recipient, and it is unsigned. */
  signable: boolean;
  alreadySignedId: string | null;
  esignConsent: EsignConsentSummary | null;
};

export type SignableDeliveryState = { mode: "setup" | "ready" | "error" | "missing"; delivery: SignableDelivery | null; requestId?: string };

export async function getSignableDelivery(deliveryId: string): Promise<SignableDeliveryState> {
  const esignConsent = resolveEsignConsent();
  if (!getPublicSupabaseConfig()) {
    return {
      mode: "setup",
      delivery: {
        deliveryId, organizationId: "20000000-0000-4000-8000-000000000002",
        documentId: "preview-document", title: "Residential Lease — Unit 101", documentType: "signed_lease",
        versionNumber: 1, sha256Hex: "a".repeat(64), signable: true, alreadySignedId: null, esignConsent,
      },
    };
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("document_deliveries")
      .select("id,organization_id,status,document_version_id,document_versions(version_number,sha256_hex,upload_status,document_id,documents!document_versions_document_id_fkey(id,title,document_type)),document_signatures(id)")
      .eq("id", deliveryId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { mode: "missing", delivery: null };
    const version = firstOf(data.document_versions as never) as { version_number?: number; sha256_hex?: string; upload_status?: string; documents?: unknown } | null;
    const document = version ? firstOf(version.documents as never) as { id?: string; title?: string; document_type?: string } | null : null;
    const signature = firstOf(data.document_signatures as never) as { id?: string } | null;
    return {
      mode: "ready",
      delivery: {
        deliveryId: data.id as string,
        organizationId: data.organization_id as string,
        documentId: document?.id ?? null,
        title: document?.title ?? "Delivered document",
        documentType: document?.document_type ?? "document",
        versionNumber: version?.version_number ?? null,
        sha256Hex: version?.sha256_hex ?? null,
        signable: version?.upload_status === "clean" && !signature?.id,
        alreadySignedId: signature?.id ?? null,
        esignConsent,
      },
    };
  } catch {
    return { mode: "error", delivery: null, requestId: crypto.randomUUID() };
  }
}

export type SignatureCertificate = {
  signatureId: string;
  organizationId: string;
  documentTitle: string;
  documentType: string;
  versionNumber: number | null;
  documentSha256: string;
  signerName: string;
  signerEmail: string | null;
  intentStatement: string;
  esignConsentVersion: string;
  ipAddress: string | null;
  userAgent: string | null;
  authAssuranceLevel: string | null;
  deliveredAt: string | null;
  firstViewedAt: string | null;
  signedAt: string;
  verificationCode: string;
  signatureSeal: string;
};

export type SignatureCertificateState = { mode: "setup" | "ready" | "error" | "missing"; certificate: SignatureCertificate | null; requestId?: string };

function previewCertificate(): SignatureCertificate {
  return {
    signatureId: "preview-signature", organizationId: "20000000-0000-4000-8000-000000000002",
    documentTitle: "Residential Lease — Unit 101", documentType: "signed_lease", versionNumber: 1,
    documentSha256: "a".repeat(64), signerName: "Jordan Q. Rivera", signerEmail: "jordan@example.com",
    intentStatement: "I have read and agree to this document, and I intend my electronic signature to bind me to it.",
    esignConsentVersion: "esign_consent@1.0.0#0123456789abcdef",
    ipAddress: "203.0.113.7", userAgent: "Mozilla/5.0 (Macintosh) Safari/17", authAssuranceLevel: "aal1",
    deliveredAt: new Date(Date.now() - 86_400_000).toISOString(), firstViewedAt: new Date(Date.now() - 3_600_000).toISOString(),
    signedAt: new Date().toISOString(), verificationCode: "A1B2C3D4E5F6", signatureSeal: "f".repeat(64),
  };
}

export async function getSignatureCertificate(deliveryId: string): Promise<SignatureCertificateState> {
  if (!getPublicSupabaseConfig()) return { mode: "setup", certificate: previewCertificate() };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("document_signatures")
      .select("id,organization_id,signer_name,signer_email,document_sha256,intent_statement,esign_consent_version,ip_address,user_agent,auth_assurance_level,delivered_at,first_viewed_at,signed_at,verification_code,signature_seal,document_versions(version_number,documents!document_versions_document_id_fkey(title,document_type))")
      .eq("document_delivery_id", deliveryId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { mode: "missing", certificate: null };
    const version = firstOf(data.document_versions as never) as { version_number?: number; documents?: unknown } | null;
    const document = version ? firstOf(version.documents as never) as { title?: string; document_type?: string } | null : null;
    return {
      mode: "ready",
      certificate: {
        signatureId: data.id as string,
        organizationId: data.organization_id as string,
        documentTitle: document?.title ?? "Signed document",
        documentType: document?.document_type ?? "document",
        versionNumber: version?.version_number ?? null,
        documentSha256: data.document_sha256 as string,
        signerName: data.signer_name as string,
        signerEmail: (data.signer_email as string | null) ?? null,
        intentStatement: data.intent_statement as string,
        esignConsentVersion: data.esign_consent_version as string,
        ipAddress: (data.ip_address as string | null) ?? null,
        userAgent: (data.user_agent as string | null) ?? null,
        authAssuranceLevel: (data.auth_assurance_level as string | null) ?? null,
        deliveredAt: (data.delivered_at as string | null) ?? null,
        firstViewedAt: (data.first_viewed_at as string | null) ?? null,
        signedAt: data.signed_at as string,
        verificationCode: data.verification_code as string,
        signatureSeal: data.signature_seal as string,
      },
    };
  } catch {
    return { mode: "error", certificate: null, requestId: crypto.randomUUID() };
  }
}
