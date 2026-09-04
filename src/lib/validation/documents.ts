import { z } from "zod";

export const documentMimeTypes = [
  "application/pdf",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "application/zip",
] as const;

export const maximumDocumentSizeBytes = 25 * 1024 * 1024;

export const createUploadGrantSchema = z.object({
  organizationId: z.uuid(),
  parent: z.discriminatedUnion("type", [
    z.object({ type: z.literal("organization"), id: z.uuid() }),
    z.object({ type: z.literal("property"), id: z.uuid() }),
    z.object({ type: z.literal("unit"), id: z.uuid() }),
    z.object({ type: z.literal("tenancy"), id: z.uuid() }),
    z.object({ type: z.literal("work_order"), id: z.uuid() }),
  ]),
  documentType: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.enum(documentMimeTypes),
  sizeBytes: z.number().int().positive().max(maximumDocumentSizeBytes),
}).superRefine((value, context) => {
  if (value.parent.type === "tenancy") {
    if (value.documentType !== "maintenance_evidence") context.addIssue({ code: "custom", path: ["documentType"], message: "Tenancy uploads must be maintenance evidence." });
    if (value.mimeType !== "image/png" && value.mimeType !== "image/jpeg") context.addIssue({ code: "custom", path: ["mimeType"], message: "Maintenance evidence must be a PNG or JPEG image." });
  }
  if (value.parent.type === "work_order" && value.documentType !== "work_order_evidence") {
    context.addIssue({ code: "custom", path: ["documentType"], message: "Work order uploads must be work order evidence." });
  }
});
export const finalizeDocumentSchema = z.object({
  grantId: z.uuid(),
  sha256Hex: z.string().regex(/^[0-9a-f]{64}$/i),
});

export const documentDeliveryChannels = ["portal", "email", "secure_link"] as const;
export const documentRecipientRelationshipTypes = ["resident_person", "owner_entity"] as const;
export const documentAcknowledgementTypes = ["viewed", "received", "accepted", "declined", "signed_external"] as const;

export const deliverDocumentSchema = z.object({
  organizationId: z.uuid(),
  documentVersionId: z.uuid(),
  recipientRelationshipType: z.enum(documentRecipientRelationshipTypes),
  recipientRelationshipId: z.uuid(),
  deliveryChannel: z.enum(documentDeliveryChannels).default("portal"),
  /** Hours a secure link stays redeemable. Ignored by the portal and email channels. */
  secureLinkTtlHours: z.number().int().min(1).max(720).default(72),
});
export type DeliverDocumentInput = z.infer<typeof deliverDocumentSchema>;

export const acknowledgeDocumentDeliverySchema = z.object({
  organizationId: z.uuid(),
  acknowledgementType: z.enum(documentAcknowledgementTypes),
  evidenceHash: z.string().trim().min(8).max(200),
  legalDocumentVersion: z.string().trim().min(1).max(200).optional(),
});
export type AcknowledgeDocumentDeliveryInput = z.infer<typeof acknowledgeDocumentDeliverySchema>;

/**
 * A court-defensible electronic signature (ESIGN/UETA). Consent and intent are `literal(true)` because a
 * signature without either is not enforceable for a consumer — the edge refuses it before the command
 * has to. The client supplies its identity, the affirmation it showed, and the ESIGN disclosure version;
 * the signer's IP, user agent, and the document's authoritative content hash are captured server-side,
 * never from the body.
 */
export const signDocumentSchema = z.object({
  organizationId: z.uuid(),
  signerName: z.string().trim().min(2).max(160),
  esignConsentAgreed: z.literal(true),
  esignConsentVersion: z.string().trim().min(1).max(200),
  intentAffirmed: z.literal(true),
  intentStatement: z.string().trim().min(1).max(2000),
});
export type SignDocumentInput = z.infer<typeof signDocumentSchema>;
