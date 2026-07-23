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
