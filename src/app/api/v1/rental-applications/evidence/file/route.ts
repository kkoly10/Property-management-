import { z } from "zod";
import { evidenceError, evidenceReply, rentalEvidenceEnabled, serveEvidenceFile } from "@/lib/rental-evidence/http";
import { createClient } from "@/lib/supabase/server";
import { evidenceReferenceSchema } from "@/lib/validation/rental-evidence";

export async function GET(request: Request) {
  if (!rentalEvidenceEnabled()) return evidenceReply({ error: "Private evidence is unavailable." }, 404);
  const query = new URL(request.url).searchParams;
  const reference = evidenceReferenceSchema.safeParse(query.get("ref"));
  const fileId = z.uuid().safeParse(query.get("fileId"));
  if (!reference.success || !fileId.success) return evidenceReply({ error: "Private evidence is unavailable." }, 404);
  try {
    const supabase = await createClient();
    const result = await supabase.rpc("authorize_rental_evidence_file", { p_reference: reference.data,
      p_organization_id: null, p_application_id: null, p_unit_id: null, p_file_id: fileId.data });
    return result.error ? evidenceError(result.error) : await serveEvidenceFile(result.data);
  } catch {
    return evidenceError();
  }
}
