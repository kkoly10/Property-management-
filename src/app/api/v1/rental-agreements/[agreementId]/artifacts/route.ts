import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { NextResponse } from "next/server";
import { z } from "zod";
import { agreementArtifactsSchema, getAgreementSession } from "@/lib/data/rental-agreements";
import { createAdminClient } from "@/lib/supabase/admin";

const querySchema = z.object({
  kind: z.enum(["source", "evidence", "bundle"]),
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

  if (parsed.data.kind !== "source") {
    const { evidenceText, evidenceSha256 } = artifact.data;
    if (!evidenceText || !evidenceSha256) return failure(404, "Signature evidence is unavailable.");
    if (createHash("sha256").update(evidenceText, "utf8").digest("hex") !== evidenceSha256) {
      return failure(502, "Signature evidence could not be verified.");
    }
    if (parsed.data.kind === "evidence") return new Response(evidenceText, {
      headers: {
        ...privateHeaders,
        "content-type": "application/json; charset=utf-8",
        "content-disposition": 'attachment; filename="rental-agreement-signatures.json"',
        "x-content-type-options": "nosniff",
        "x-evidence-sha256": evidenceSha256,
      },
    });
    const source = artifact.data.source;
    if (!source) return failure(404, "The agreement PDF is unavailable.");
    try {
      const { data: document, error } = await createAdminClient().storage.from(source.bucket).download(source.path);
      if (error || !document || document.size === 0 || document.size > 25 * 1024 * 1024) {
        return failure(502, "The signed package could not be prepared.");
      }
      const pdf = new Uint8Array(await document.arrayBuffer());
      if (createHash("sha256").update(pdf).digest("hex") !== source.sha256) {
        return failure(502, "The signed agreement PDF could not be verified.");
      }
      const bundle = zipSync({
        "rental-agreement.pdf": pdf,
        "signature-record.json": strToU8(evidenceText),
        "SHA256SUMS.txt": strToU8(`${source.sha256}  rental-agreement.pdf\n${evidenceSha256}  signature-record.json\n`),
      }, { level: 0 });
      let offset = 0;
      const contents = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset === bundle.length) { controller.close(); return; }
          const end = Math.min(offset + 65_536, bundle.length);
          controller.enqueue(bundle.subarray(offset, end));
          offset = end;
        },
      });
      return new Response(contents, {
        headers: {
          ...privateHeaders,
          "content-type": "application/zip",
          "content-disposition": 'attachment; filename="signed-rental-agreement.zip"',
          "x-content-type-options": "nosniff",
        },
      });
    } catch {
      return failure(502, "The signed package could not be prepared.");
    }
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
