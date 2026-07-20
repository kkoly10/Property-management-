import { z } from "zod";

export const documentMimeTypes = [
  "application/pdf",
  "text/csv",
  "application/vnd.ms-excel",
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
  ]),
  documentType: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.enum(documentMimeTypes),
  sizeBytes: z.number().int().positive().max(maximumDocumentSizeBytes),
});
export const finalizeDocumentSchema = z.object({
  grantId: z.uuid(),
  sha256Hex: z.string().regex(/^[0-9a-f]{64}$/i),
});
