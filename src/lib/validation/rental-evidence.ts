import { z } from "zod";

export const rentalEvidenceBucket = "private-rental-evidence";
export const rentalEvidenceMaxBytes = 8 * 1024 * 1024;
export const evidenceTypes = ["identity", "income_evidence", "credit_evidence"] as const;
export const evidenceLabels = { identity: "Identity document", income_evidence: "Proof of income", credit_evidence: "Credit report" };
export const evidenceFileTypes = ["application/pdf", "image/jpeg", "image/png"] as const;
export const evidenceScoreSources = ["credit_bureau", "bank_or_credit_app", "other"] as const;
export const evidenceScoreSourceLabels = { credit_bureau: "Credit bureau", bank_or_credit_app: "Bank or credit app", other: "Other source" };
export const evidenceReferenceSchema = z.string().regex(/^APP-[0-9A-F]{12}$/);
const documentTypes = z.array(z.enum(evidenceTypes)).max(3);
const version = z.number().int().positive();
const digest = z.string().regex(/^[a-f0-9]{64}$/);

export const evidencePacketSchema = z.object({
  status: z.enum(["draft", "submitted", "changes_requested", "selected", "declined", "closed"]), version,
  bound: z.boolean(), requirements: z.object({ requirementsVersion: z.uuid(), criteriaText: z.string(),
    requiredDocumentTypes: documentTypes, acceptedAlternatives: z.string().nullable() }),
  currentRequirementsVersion: z.uuid().nullable(),
  noticeVersion: z.string(), noticeText: z.string(), noticeSha256: digest, consented: z.boolean().nullable(),
  allowedDocumentTypes: documentTypes, allowScore: z.boolean(), score: z.number().int().nullable(),
  scoreSource: z.enum(evidenceScoreSources).nullable(), scoreObservedOn: z.iso.date().nullable(),
  alternativeDocumentTypes: documentTypes, requestedDocumentTypes: documentTypes,
  files: z.array(z.object({ id: z.uuid(), documentType: z.enum(evidenceTypes),
    status: z.enum(["awaiting_upload", "quarantined", "scanning", "clean", "rejected"]), sizeBytes: z.number().int().positive() })),
});
export type EvidencePacket = z.infer<typeof evidencePacketSchema>;
export type EvidenceType = typeof evidenceTypes[number];
export type EvidenceScoreSource = typeof evidenceScoreSources[number];

export const evidenceUploadGrantSchema = z.object({ id: z.uuid(), objectKey: z.string().min(1), expiresAt: z.string() });
export const evidenceObjectSchema = z.object({ objectKey: z.string().min(1), contentType: z.enum(evidenceFileTypes),
  sizeBytes: z.number().int().positive().max(rentalEvidenceMaxBytes), sha256: digest });
export const inspectEvidenceUploadSchema = evidenceObjectSchema.extend({ id: z.uuid(), status: z.string() });

const reference = evidenceReferenceSchema;
export const applicantEvidenceCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("bind"), reference }).strict(),
  z.object({ action: z.literal("save"), reference, version, score: z.number().int().min(1).max(999).nullable(),
    scoreSource: z.enum(evidenceScoreSources).nullable(), scoreObservedOn: z.iso.date().nullable(),
    alternativeDocumentTypes: documentTypes, noticeVersion: z.string().max(80), noticeSha256: digest }).strict(),
  z.object({ action: z.literal("start"), reference, version, fileId: z.uuid(), documentType: z.enum(evidenceTypes),
    contentType: z.enum(evidenceFileTypes), sizeBytes: z.number().int().positive().max(rentalEvidenceMaxBytes), sha256: digest }).strict(),
  z.object({ action: z.literal("finalize"), reference, fileId: z.uuid() }).strict(),
  z.object({ action: z.literal("remove"), reference, version, fileId: z.uuid() }).strict(),
  z.object({ action: z.literal("submit"), reference, version, acknowledgeRequirementsChange: z.boolean(),
    currentRequirementsVersion: z.uuid().nullable() }).strict(),
]);
export const evidenceReviewScopeSchema = z.object({ organizationId: z.uuid(), applicationId: z.uuid(), unitId: z.uuid() });
export const evidenceReviewCommandSchema = evidenceReviewScopeSchema.extend({ version,
  action: z.enum(["request_changes", "select", "decline"]), documentTypes }).strict();
