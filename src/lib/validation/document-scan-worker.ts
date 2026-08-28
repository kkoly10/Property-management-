import { z } from "zod";

/** One cron-able scan worker run: sweep abandoned claims, then drain the scan queue. */
export const dispatchDocumentScansSchema = z.object({
  limit: z.number().int().min(1).max(100).default(10),
  workerRunId: z.string().min(8).max(200),
  stallMinutes: z.number().int().min(1).max(1440).default(30),
});

export type DispatchDocumentScansInput = z.infer<typeof dispatchDocumentScansSchema>;

/** The claimed-job DTO returned by public.claim_document_scan_jobs. */
export const claimedDocumentScanJobSchema = z.object({
  documentScanJobId: z.uuid(),
  organizationId: z.uuid(),
  documentVersionId: z.uuid(),
  storageBucket: z.string().min(1),
  storagePath: z.string().min(1),
  expectedSha256Hex: z.string().regex(/^[0-9a-f]{64}$/),
  attempt: z.number().int().min(1),
  maxAttempts: z.number().int().min(1),
});

export type ClaimedDocumentScanJob = z.infer<typeof claimedDocumentScanJobSchema>;
