import { evidenceError, evidenceReply, rentalEvidenceEnabled } from "@/lib/rental-evidence/http";
import { getOrganizationContext } from "@/lib/organization/context";
import { createClient } from "@/lib/supabase/server";
import { evidencePacketSchema, evidenceReviewCommandSchema, evidenceReviewScopeSchema } from "@/lib/validation/rental-evidence";

const unavailable = () => evidenceReply({ error: "Private evidence is unavailable." }, 404);

export async function GET(request: Request) {
  if (!rentalEvidenceEnabled()) return unavailable();
  const scope = evidenceReviewScopeSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!scope.success) return unavailable();
  const context = await getOrganizationContext();
  if (context.active?.organizationId !== scope.data.organizationId) return unavailable();
  try {
    const supabase = await createClient();
    const result = await supabase.rpc("get_rental_application_evidence_review", { p_organization_id: scope.data.organizationId,
      p_application_id: scope.data.applicationId, p_unit_id: scope.data.unitId });
    if (result.error) return evidenceError(result.error);
    if (result.data?.status === "declined" || result.data?.status === "changes_requested") {
      return evidenceReply({ status: result.data.status });
    }
    const packet = evidencePacketSchema.safeParse(result.data);
    return packet.success ? evidenceReply(packet.data) : evidenceError();
  } catch {
    return evidenceError();
  }
}

export async function POST(request: Request) {
  if (!rentalEvidenceEnabled()) return unavailable();
  if (request.headers.get("origin") !== new URL(request.url).origin) return unavailable();
  const parsed = evidenceReviewCommandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return evidenceReply({ error: "Check the review details and try again." }, 400);
  const command = parsed.data;
  const context = await getOrganizationContext();
  if (context.active?.organizationId !== command.organizationId) return unavailable();
  try {
    const supabase = await createClient();
    const result = await supabase.rpc("review_rental_application_evidence", { p_organization_id: command.organizationId,
      p_application_id: command.applicationId, p_unit_id: command.unitId,
      p_version: command.version, p_action: command.action, p_document_types: command.documentTypes });
    return result.error || typeof result.data?.status !== "string" ? evidenceError(result.error) : evidenceReply(result.data);
  } catch {
    return evidenceError();
  }
}
