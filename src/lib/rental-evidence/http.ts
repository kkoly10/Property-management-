import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { evidenceObjectSchema, rentalEvidenceBucket } from "@/lib/validation/rental-evidence";

export function rentalEvidenceEnabled() {
  return process.env.CRECY_RENTAL_EVIDENCE_ENABLED === "1";
}

const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
export function evidenceReply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}
export function evidenceError(error?: { message?: string; code?: string } | null) {
  const code = error?.message;
  if (code === "EVIDENCE_RECENT_MFA_REQUIRED") return evidenceReply({ code, error: "Verify with your authenticator to continue." }, 403);
  if (code === "EVIDENCE_APPLICATION_CLAIM_REQUIRED") return evidenceReply({ code, error: "Recover access to the application and try again." }, 403);
  if (code === "EVIDENCE_CREDIT_DECISION_REQUIRES_APPROVED_NOTICE_WORKFLOW") {
    return evidenceReply({ error: "A decision involving credit evidence requires your approved notice process." }, 409);
  }
  if (code === "EVIDENCE_FILES_NOT_READY") return evidenceReply({ error: "Wait for the scan or remove and replace unavailable files." }, 409);
  if (code === "EVIDENCE_REQUIREMENTS_ACKNOWLEDGMENT_REQUIRED") {
    return evidenceReply({ error: "The published requirements changed again. Refresh the packet and review the update." }, 409);
  }
  if (code === "EVIDENCE_REQUIREMENTS_INCOMPLETE" || code === "EVIDENCE_REVIEW_CHECKLIST_INCOMPLETE") {
    return evidenceReply({ error: "Complete the required document checklist before continuing." }, 409);
  }
  if (error?.code === "40001") return evidenceReply({ error: "The application changed. Refresh the current packet and try again." }, 409);
  if (error?.code === "42501" || error?.code === "P0002") return evidenceReply({ error: "Private evidence is unavailable." }, 404);
  if (error?.code?.startsWith("22") || error?.code?.startsWith("23")) return evidenceReply({ error: "Check the evidence details and try again." }, 400);
  return evidenceReply({ error: "Private evidence is temporarily unavailable." }, 503);
}

const worklistSchema = z.array(z.object({ applicationId: z.uuid(), reviewer: z.boolean(),
  status: z.enum(["draft", "submitted", "changes_requested", "selected", "declined", "closed"]) }));

export async function rentalEvidenceWorklist(organizationId: string | null, unitId: string) {
  if (!rentalEvidenceEnabled() || !organizationId) return new Map<string, z.infer<typeof worklistSchema>[number]>();
  try {
    const supabase = await createClient();
    const result = await supabase.rpc("get_rental_application_evidence_worklist", { p_organization_id: organizationId, p_unit_id: unitId });
    const list = worklistSchema.safeParse(result.data);
    return new Map(!result.error && list.success ? list.data.map((item) => [item.applicationId, item]) : []);
  } catch { return new Map<string, z.infer<typeof worklistSchema>[number]>(); }
}

export function observedEvidenceMime(bytes: Buffer) {
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  return bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? "image/jpeg" : null;
}

export async function readExactEvidence(input: unknown) {
  const parsed = evidenceObjectSchema.safeParse(input);
  if (!parsed.success) return null;
  const target = parsed.data;
  const { data, error } = await createAdminClient().storage.from(rentalEvidenceBucket).download(target.objectKey);
  if (error || !data || data.size !== target.sizeBytes) return null;
  const bytes = Buffer.from(await data.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== target.sha256 || observedEvidenceMime(bytes) !== target.contentType) return null;
  return { bytes, digest, contentType: target.contentType };
}

export async function serveEvidenceFile(target: unknown) {
  const verified = await readExactEvidence(target);
  if (!verified) return evidenceReply({ error: "This document could not be verified." }, 404);
  const suffix = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" }[verified.contentType];
  return new Response(new Uint8Array(verified.bytes), { headers: { ...headers,
    "Content-Type": verified.contentType,
    "Content-Disposition": `attachment; filename="application-document.${suffix}"`,
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Referrer-Policy": "no-referrer",
  } });
}
