import { z } from "zod";
import { evidenceError, evidenceReply, rentalEvidenceEnabled, serveEvidenceFile } from "@/lib/rental-evidence/http";
import { getOrganizationContext } from "@/lib/organization/context";
import { createClient } from "@/lib/supabase/server";
import { evidenceReviewScopeSchema } from "@/lib/validation/rental-evidence";

const unavailable = () => evidenceReply({ error: "Private evidence is unavailable." }, 404);

export async function GET(request: Request) {
  if (!rentalEvidenceEnabled()) return unavailable();
  const scope = evidenceReviewScopeSchema.extend({ fileId: z.uuid() }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!scope.success) return unavailable();
  const context = await getOrganizationContext();
  if (context.active?.organizationId !== scope.data.organizationId) return unavailable();
  try {
    const supabase = await createClient();
    const result = await supabase.rpc("authorize_rental_evidence_file", { p_reference: null,
      p_organization_id: scope.data.organizationId, p_application_id: scope.data.applicationId,
      p_unit_id: scope.data.unitId, p_file_id: scope.data.fileId });
    return result.error ? evidenceError(result.error) : await serveEvidenceFile(result.data);
  } catch {
    return evidenceError();
  }
}
