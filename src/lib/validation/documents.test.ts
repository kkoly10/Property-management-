import { describe, expect, it } from "vitest";
import { createUploadGrantSchema, finalizeDocumentSchema, maximumDocumentSizeBytes } from "./documents";

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

  it("requires a canonical SHA-256 checksum", () => {
    expect(finalizeDocumentSchema.safeParse({ grantId: validUpload.organizationId, sha256Hex: "a".repeat(64) }).success).toBe(true);
    expect(finalizeDocumentSchema.safeParse({ grantId: validUpload.organizationId, sha256Hex: "not-a-checksum" }).success).toBe(false);
  });
});
