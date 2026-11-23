import { after } from "next/server";
import { applicationAccessToken } from "@/lib/rental-application-access";
import { evidenceError, evidenceReply, readExactEvidence, rentalEvidenceEnabled } from "@/lib/rental-evidence/http";
import { runRentalEvidenceScan } from "@/lib/rental-evidence/worker";
import { RENTAL_EVIDENCE_SCAN_BUDGET_MS } from "@/lib/runtime/budget";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { applicantEvidenceCommandSchema, evidencePacketSchema, evidenceReferenceSchema, evidenceUploadGrantSchema,
  inspectEvidenceUploadSchema } from "@/lib/validation/rental-evidence";

export const runtime = "nodejs";
export const maxDuration = 60;

function expediteEvidenceScan(fileId: string, deadline: number) {
  try {
    after(async () => {
      try {
        await runRentalEvidenceScan(createAdminClient(), { fileId, deadline });
      } catch {
        // The scheduled drain recovers any unclaimed or abandoned work.
        console.warn("The expedited evidence scan deferred to the scheduled worker");
      }
    });
  } catch {
    // An unsupported callback leaves the durable scan claim available to the scheduled worker.
  }
}

export async function GET(request: Request) {
  if (!rentalEvidenceEnabled()) return evidenceReply({ error: "Private evidence is unavailable." }, 404);
  const reference = evidenceReferenceSchema.safeParse(new URL(request.url).searchParams.get("ref"));
  if (!reference.success) return evidenceReply({ error: "Private evidence is unavailable." }, 404);
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return evidenceReply({ code: "SIGN_IN_REQUIRED", error: "Sign in to continue." }, 401);
    const result = await supabase.rpc("get_my_rental_application_evidence", { p_reference: reference.data });
    const packet = evidencePacketSchema.safeParse(result.data);
    return result.error || !packet.success ? evidenceError(result.error) : evidenceReply(packet.data);
  } catch {
    return evidenceError();
  }
}

export async function POST(request: Request) {
  const scanDeadline = Date.now() + RENTAL_EVIDENCE_SCAN_BUDGET_MS;
  if (!rentalEvidenceEnabled()) return evidenceReply({ error: "Private evidence is unavailable." }, 404);
  if (request.headers.get("origin") !== new URL(request.url).origin) return evidenceReply({ error: "Private evidence is unavailable." }, 403);
  const parsed = applicantEvidenceCommandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return evidenceReply({ error: "Check the evidence details and try again." }, 400);
  const action = parsed.data;
  const scope = { p_reference: action.reference };
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return evidenceReply({ code: "SIGN_IN_REQUIRED", error: "Sign in to continue." }, 401);

    if (action.action === "start") {
      const result = await supabase.rpc("start_rental_application_evidence_upload", { ...scope,
        p_version: action.version, p_file_id: action.fileId, p_document_type: action.documentType,
        p_content_type: action.contentType, p_size_bytes: action.sizeBytes, p_sha256: action.sha256 });
      const grant = evidenceUploadGrantSchema.safeParse(result.data);
      return result.error || !grant.success ? evidenceError(result.error) : evidenceReply(grant.data);
    }
    if (action.action === "finalize") {
      const inspected = await supabase.rpc("inspect_rental_application_evidence_upload", { ...scope, p_file_id: action.fileId });
      const target = inspectEvidenceUploadSchema.safeParse(inspected.data);
      if (inspected.error || !target.success || target.data.id !== action.fileId) return evidenceError(inspected.error);
      if (target.data.status !== "awaiting_upload") {
        if (target.data.status === "quarantined") expediteEvidenceScan(target.data.id, scanDeadline);
        return evidenceReply({ id: target.data.id, status: target.data.status });
      }
      const signal = AbortSignal.timeout(8_000);
      const verified = await readExactEvidence(target.data, signal);
      if (signal.aborted) return evidenceReply({ error: "The upload check timed out. Try verifying the upload again." }, 503);
      if (!verified) return evidenceReply({ error: "The uploaded file could not be verified. Remove it and try another file." }, 422);
      const response = await createAdminClient().rpc("finish_rental_application_evidence_upload", {
        p_actor_id: auth.user.id, p_file_id: action.fileId, p_size_bytes: verified.bytes.length, p_sha256: verified.digest,
      });
      if (response.error || response.data?.id !== action.fileId) return evidenceError(response.error);
      if (response.data.status === "quarantined") expediteEvidenceScan(action.fileId, scanDeadline);
      return evidenceReply(response.data);
    }
    const response = await (async () => {
      switch (action.action) {
        case "bind": {
          const token = await applicationAccessToken(action.reference);
          return supabase.rpc("bind_rental_application_evidence", { ...scope, p_access_token: token });
        }
        case "save": return supabase.rpc("save_rental_application_evidence_draft", { ...scope,
          p_version: action.version, p_score: action.score, p_score_source: action.scoreSource, p_score_observed_on: action.scoreObservedOn,
          p_alternative_document_types: action.alternativeDocumentTypes,
          p_notice_version: action.noticeVersion, p_notice_sha256: action.noticeSha256 });
        case "remove": return supabase.rpc("remove_rental_application_evidence_upload", { ...scope, p_version: action.version, p_file_id: action.fileId });
        case "submit": return supabase.rpc("submit_rental_application_evidence", { ...scope, p_version: action.version,
          p_acknowledge_requirements_change: action.acknowledgeRequirementsChange,
          p_current_requirements_version: action.currentRequirementsVersion });
      }
    })();
    const packet = evidencePacketSchema.safeParse(response.data);
    return response.error || !packet.success ? evidenceError(response.error) : evidenceReply(packet.data);
  } catch {
    return evidenceError();
  }
}
