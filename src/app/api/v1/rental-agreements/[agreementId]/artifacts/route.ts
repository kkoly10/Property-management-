import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { agreementArtifactsSchema, getAgreementSession } from "@/lib/data/rental-agreements";
import { createAdminClient } from "@/lib/supabase/admin";

const querySchema = z.object({
  kind: z.enum(["source", "evidence"]),
  surface: z.enum(["operator", "participant"]),
});
const privateHeaders = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };

function failure(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: privateHeaders });
}

export async function GET(request: Request, context: { params: Promise<{ agreementId: string }> }) {
  const { agreementId } = await context.params;
  const query = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({ kind: query.get("kind"), surface: query.get("surface") });
  if (!parsed.success || !z.uuid().safeParse(agreementId).success) return failure(404, "Agreement artifact unavailable.");
  const session = await getAgreementSession(parsed.data.surface);
  if (session.mode === "setup") return failure(503, "Agreement storage is unavailable.");
  if (session.mode === "signedOut") return failure(401, "Sign in to download this agreement.");
  if (session.mode !== "ready") return failure(404, "Agreement artifact unavailable.");

  const { data, error } = await session.supabase.rpc("get_rental_agreement_artifacts", {
    p_agreement_id: agreementId,
    p_organization_id: session.organizationId,
  });
  if (error?.code === "42501" || error?.code === "P0002") return failure(404, "Agreement artifact unavailable.");
  const artifact = agreementArtifactsSchema.safeParse(data);
  if (error || !artifact.success) return failure(502, "Agreement storage is unavailable.");

  if (parsed.data.kind === "evidence") {
    const { evidenceText, evidenceSha256 } = artifact.data;
    if (!evidenceText || !evidenceSha256) return failure(404, "Signature evidence is unavailable.");
    if (createHash("sha256").update(evidenceText, "utf8").digest("hex") !== evidenceSha256) {
      return failure(502, "Signature evidence could not be verified.");
    }
    return new Response(evidenceText, {
      headers: {
        ...privateHeaders,
        "content-type": "application/json; charset=utf-8",
        "content-disposition": 'attachment; filename="rental-agreement-signatures.json"',
        "x-content-type-options": "nosniff",
        "x-evidence-sha256": evidenceSha256,
      },
    });
  }

  const source = artifact.data.source;
  if (!source) return failure(404, "The agreement PDF is unavailable.");
  try {
    const signed = await createAdminClient().storage.from(source.bucket).createSignedUrl(source.path, 60, { download: source.filename });
    if (signed.error || !signed.data) return failure(502, "The private agreement could not be prepared.");
    return NextResponse.redirect(signed.data.signedUrl, { status: 303, headers: privateHeaders });
  } catch {
    return failure(502, "The private agreement could not be prepared.");
  }
}
