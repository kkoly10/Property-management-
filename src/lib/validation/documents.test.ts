import { describe, expect, it } from "vitest";
import { acknowledgeDocumentDeliverySchema, createUploadGrantSchema, deliverDocumentSchema, finalizeDocumentSchema, maximumDocumentSizeBytes } from "./documents";

const validUpload = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  parent: { type: "organization" as const, id: "10000000-0000-4000-8000-000000000001" },
  documentType: "portfolio_import",
  title: "Portfolio source",
  originalFilename: "portfolio.csv",
  mimeType: "text/csv" as const,
  sizeBytes: 1024,
};

describe("document request validation", () => {
  it("accepts a scoped supported upload", () => {
    expect(createUploadGrantSchema.parse(validUpload)).toMatchObject({ mimeType: "text/csv" });
  });

  it("rejects unsupported content and oversized files", () => {
    expect(createUploadGrantSchema.safeParse({ ...validUpload, mimeType: "text/html" }).success).toBe(false);
    expect(createUploadGrantSchema.safeParse({ ...validUpload, sizeBytes: maximumDocumentSizeBytes + 1 }).success).toBe(false);
  });

  it("limits resident tenancy uploads to maintenance images", () => {
    const tenancyUpload = { ...validUpload, parent: { type: "tenancy" as const, id: validUpload.organizationId }, documentType: "maintenance_evidence", originalFilename: "leak.jpg", mimeType: "image/jpeg" as const };
    expect(createUploadGrantSchema.safeParse(tenancyUpload).success).toBe(true);
    expect(createUploadGrantSchema.safeParse({ ...tenancyUpload, documentType: "signed_lease" }).success).toBe(false);
    expect(createUploadGrantSchema.safeParse({ ...tenancyUpload, mimeType: "application/pdf" }).success).toBe(false);
  });

  it("requires a canonical SHA-256 checksum", () => {
    expect(finalizeDocumentSchema.safeParse({ grantId: validUpload.organizationId, sha256Hex: "a".repeat(64) }).success).toBe(true);
    expect(finalizeDocumentSchema.safeParse({ grantId: validUpload.organizationId, sha256Hex: "not-a-checksum" }).success).toBe(false);
  });
});

const orgId = "10000000-0000-4000-8000-000000000001";
const versionId = "20000000-0000-4000-8000-000000000002";
const relationshipId = "30000000-0000-4000-8000-000000000003";

describe("document delivery validation", () => {
  it("defaults the delivery channel to portal and requires a relationship recipient", () => {
    const parsed = deliverDocumentSchema.parse({ organizationId: orgId, documentVersionId: versionId, recipientRelationshipType: "resident_person", recipientRelationshipId: relationshipId });
    expect(parsed.deliveryChannel).toBe("portal");
    expect(parsed.secureLinkTtlHours).toBe(72);
  });

  it("accepts the off-portal channels the notification worker can now drain", () => {
    const base = { organizationId: orgId, documentVersionId: versionId, recipientRelationshipType: "resident_person" as const, recipientRelationshipId: relationshipId };
    expect(deliverDocumentSchema.safeParse({ ...base, deliveryChannel: "email" }).success).toBe(true);
    expect(deliverDocumentSchema.safeParse({ ...base, deliveryChannel: "secure_link", secureLinkTtlHours: 24 }).success).toBe(true);
  });

  it("rejects unsupported channels, recipient types, non-uuid ids, and out-of-range link expiries", () => {
    const base = { organizationId: orgId, documentVersionId: versionId, recipientRelationshipType: "resident_person" as const, recipientRelationshipId: relationshipId };
    expect(deliverDocumentSchema.safeParse({ ...base, deliveryChannel: "carrier_pigeon" }).success).toBe(false);
    expect(deliverDocumentSchema.safeParse({ ...base, recipientRelationshipType: "vendor_contact" }).success).toBe(false);
    expect(deliverDocumentSchema.safeParse({ ...base, recipientRelationshipId: "not-a-uuid" }).success).toBe(false);
    expect(deliverDocumentSchema.safeParse({ ...base, deliveryChannel: "secure_link", secureLinkTtlHours: 0 }).success).toBe(false);
    expect(deliverDocumentSchema.safeParse({ ...base, deliveryChannel: "secure_link", secureLinkTtlHours: 1000 }).success).toBe(false);
  });
});

describe("document acknowledgement validation", () => {
  it("accepts a typed acknowledgement with an evidence hash", () => {
    expect(acknowledgeDocumentDeliverySchema.safeParse({ organizationId: orgId, acknowledgementType: "received", evidenceHash: "a".repeat(64), legalDocumentVersion: "lease-v3" }).success).toBe(true);
  });

  it("rejects unknown types and short evidence hashes", () => {
    expect(acknowledgeDocumentDeliverySchema.safeParse({ organizationId: orgId, acknowledgementType: "signed", evidenceHash: "a".repeat(64) }).success).toBe(false);
    expect(acknowledgeDocumentDeliverySchema.safeParse({ organizationId: orgId, acknowledgementType: "received", evidenceHash: "short" }).success).toBe(false);
  });
});
