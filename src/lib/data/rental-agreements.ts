import "server-only";

import { z } from "zod";
import { getActiveOrganizationId } from "@/lib/organization/context";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type AgreementSurface = "operator" | "participant";

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const summarySchema = z.object({
  agreementId: z.uuid(),
  sourceVersionId: z.uuid(),
  sourceSha256: digest,
  title: z.string(),
  propertyLabel: z.string(),
  unitLabel: z.string(),
  issuedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  status: z.enum(["open", "executed", "declined", "void", "expired"]),
  requiredCount: z.number().int().positive(),
  signedCount: z.number().int().nonnegative(),
  myCapacity: z.enum(["landlord", "lessee"]).nullable(),
  iSigned: z.boolean(),
  applicationLinked: z.boolean().optional(),
  tenancyStatus: z.enum(["scheduled", "active", "notice_given", "move_out_in_progress", "closed"]).nullish(),
});

export type AgreementSummary = z.infer<typeof summarySchema>;

export const agreementArtifactsSchema = z.object({
  source: z.object({
    bucket: z.literal("private-documents"),
    path: z.string().regex(/^organizations\/[0-9a-f-]+\/(property|unit)\/[0-9a-f-]+\/[0-9a-f-]+\/[A-Za-z0-9._-]+$/),
    filename: z.string().regex(/^[A-Za-z0-9._-]{1,255}$/),
    versionId: z.uuid(),
    sha256: digest,
  }).nullable(),
  evidenceText: z.string().nullable(),
  evidenceSha256: digest.nullable(),
});

export const issuedAgreementSchema = z.object({
  agreementId: z.uuid(), status: z.enum(["open", "executed", "declined", "void"]), replayed: z.boolean(),
});
export const signedAgreementReceiptSchema = z.object({
  agreementId: z.uuid(), sourceVersionId: z.uuid(), actorId: z.uuid(),
  capacity: z.enum(["landlord", "lessee"]), signedAt: z.iso.datetime({ offset: true }),
  status: z.enum(["open", "executed", "declined", "void"]), replayed: z.boolean(),
});

export async function getAgreementSession(surface: AgreementSurface) {
  if (!getPublicSupabaseConfig()) return { mode: "setup" } as const;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { mode: "signedOut" } as const;
  const organizationId = surface === "operator" ? await getActiveOrganizationId() : null;
  if (surface === "operator" && !organizationId) return { mode: "noWorkspace" } as const;
  return { mode: "ready", supabase, organizationId, user: data.user } as const;
}

export async function listRentalAgreements(surface: AgreementSurface) {
  const session = await getAgreementSession(surface);
  if (session.mode !== "ready") return session;
  const { data, error } = await session.supabase.rpc("list_rental_agreements", { p_organization_id: session.organizationId });
  const agreements = z.array(summarySchema).safeParse(data);
  if (error || !agreements.success) return { mode: "error" } as const;
  return { mode: "ready", agreements: agreements.data, organizationId: session.organizationId } as const;
}

export async function getRentalAgreement(surface: AgreementSurface, agreementId: string) {
  const session = await getAgreementSession(surface);
  if (session.mode !== "ready") return session;
  if (!z.uuid().safeParse(agreementId).success) return { mode: "missing" } as const;
  const { data, error } = await session.supabase.rpc("get_rental_agreement", {
    p_agreement_id: agreementId, p_organization_id: session.organizationId,
  });
  const agreement = summarySchema.safeParse(data);
  if (error?.code === "42501" || error?.code === "P0002") return { mode: "missing" } as const;
  if (error || !agreement.success) return { mode: "error" } as const;
  return { mode: "ready", agreement: agreement.data, organizationId: session.organizationId } as const;
}

const filingSchema = z.object({
  agreementId: z.uuid(),
  propertyId: z.uuid(),
  unitId: z.uuid(),
  documentId: z.uuid().nullable(),
  tenancyId: z.uuid().nullable(),
  applicationId: z.uuid().nullish(),
  applicationSetupId: z.uuid().nullish(),
});

export async function getAgreementFiling(organizationId: string, agreementId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_rental_agreement_filing", {
    p_organization_id: organizationId, p_agreement_id: agreementId,
  });
  const filing = filingSchema.safeParse(data);
  return !error && filing.success ? filing.data : null;
}

const invitationDeliverySchema = z.object({
  agreementId: z.uuid(),
  state: z.enum(["queued", "accepted", "delivered", "delayed", "failed"]).nullable(),
  reissue: z.object({ unitId: z.uuid(), applicationId: z.uuid() }).nullable(),
  resendEligible: z.boolean().optional(),
});

export async function getAgreementInvitationDelivery(organizationId: string, agreementId: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_rental_agreement_invitation_delivery", {
      p_organization_id: organizationId, p_agreement_id: agreementId,
    });
    const result = invitationDeliverySchema.safeParse(data);
    return !error && result.success && result.data.agreementId === agreementId ? result.data : null;
  } catch {
    return null;
  }
}

const applicationSigningSetupSchema = z.object({
  applicationId: z.uuid(),
  applicationVersion: z.number().int().positive(),
  setupId: z.uuid(),
  setupRevision: z.number().int().positive(),
  unitId: z.uuid(),
  name: z.string(),
  email: z.string(),
  agreementId: z.uuid().nullable(),
  terms: z.object({
    startDate: z.string(), endDate: z.string(), rentAmount: z.string(), rentFrequency: z.string(),
    firstChargeDueDate: z.string(), openingBalance: z.string(), currency: z.enum(["USD", "CAD", "MXN"]),
  }),
});
export type ApplicationSigningSetup = z.infer<typeof applicationSigningSetupSchema>;

export async function getRentalApplicationSigningSetup(applicationId: string, unitId: string) {
  const session = await getAgreementSession("operator");
  if (session.mode !== "ready" || !session.organizationId) return { mode: "unavailable" } as const;
  const { data, error } = await session.supabase.rpc("get_rental_application_signing_setup", {
    p_organization_id: session.organizationId, p_application_id: applicationId,
  });
  if (error?.code === "42501" || error?.code === "P0002") return { mode: "missing" } as const;
  const setup = applicationSigningSetupSchema.safeParse(data);
  if (error || !setup.success) return { mode: "error" } as const;
  if (setup.data.unitId !== unitId) return { mode: "missing" } as const;
  return { mode: "ready", setup: setup.data, organizationId: session.organizationId } as const;
}

export async function getAgreementIssueOptions(organizationId: string) {
  const supabase = await createClient();
  const [propertyResult, unitResult, documentResult, versionResult, assurance] = await Promise.all([
    supabase.from("properties").select("id,name").eq("organization_id", organizationId).neq("status", "archived").order("name"),
    supabase.from("units").select("id,property_id,unit_code").eq("organization_id", organizationId).eq("operational_status", "active").order("unit_code"),
    supabase.from("documents").select("id,property_id,unit_id,title").eq("organization_id", organizationId)
      .eq("document_type", "rental_agreement_source").eq("status", "active").is("tenancy_id", null).order("title"),
    supabase.from("document_versions").select("id,document_id,version_number,original_filename,storage_bucket,upload_status,mime_type").eq("organization_id", organizationId)
      .order("version_number", { ascending: false }),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (propertyResult.error || unitResult.error || documentResult.error || versionResult.error) return null;

  const properties = new Map(propertyResult.data.map((property) => [property.id, property.name]));
  const sources = new Map(documentResult.data.map((document) => [document.id, document]));
  const units = unitResult.data.flatMap((unit) => {
    const property = properties.get(unit.property_id);
    return property ? [{ id: unit.id as string, code: unit.unit_code as string, propertyId: unit.property_id as string, property: property as string }] : [];
  });
  const seen = new Set<string>();
  const documents = versionResult.data.flatMap((version) => {
    const source = sources.get(version.document_id);
    if (!source?.property_id) return [];
    if (seen.has(source.id)) return [];
    seen.add(source.id);
    if (version.storage_bucket !== "private-documents" || version.upload_status !== "clean" || version.mime_type !== "application/pdf") return [];
    return [{
      id: version.id as string,
      propertyId: source.property_id as string,
      unitId: source.unit_id as string | null,
      title: source.title as string,
      version: version.version_number as number,
      filename: version.original_filename as string,
    }];
  });
  return { units, documents, mfaVerified: !assurance.error && assurance.data.currentLevel === "aal2" };
}
