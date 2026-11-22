import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { maximumDocumentSizeBytes } from "@/lib/validation/documents";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  publicId: z.uuid(),
  index: z.string().regex(/^(?:[0-9]|1[0-9])$/).transform(Number),
});
const listingSchema = z.object({ publicId: z.uuid(), photos: z.array(z.unknown()).max(20) });
const photoSchema = z.object({
  documentVersionId: z.uuid(),
  storageBucket: z.literal("private-documents"),
  storagePath: z.string(),
  mimeType: z.enum(["image/jpeg", "image/png"]),
});
const storagePath = /^organizations\/[0-9a-f-]{36}\/unit\/[0-9a-f-]{36}\/([0-9a-f-]{36})\/(?!(?:\.|\.\.)$)[A-Za-z0-9._-]{1,255}$/;
const signatures = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};
const privateHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function unavailable() {
  return new Response(null, { status: 404, headers: privateHeaders });
}

export async function GET(_request: Request, { params }: { params: Promise<{ publicId: string; index: string }> }) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return unavailable();
  const publicId = parsed.data.publicId.toLowerCase();

  try {
    const admin = createAdminClient();
    // This projection returns only published listings and the currently approved clean versions.
    const listing = await admin.rpc("get_public_rental_listing", { p_public_id: publicId });
    const available = listingSchema.safeParse(listing.data);
    if (listing.error || !available.success || available.data.publicId !== publicId) return unavailable();

    const parsedPhoto = photoSchema.safeParse(available.data.photos[parsed.data.index]);
    if (!parsedPhoto.success) return unavailable();
    const photo = parsedPhoto.data;
    if (storagePath.exec(photo.storagePath)?.[1] !== photo.documentVersionId) return unavailable();
    const result = await admin.storage.from(photo.storageBucket).download(photo.storagePath);
    if (result.error || !result.data?.size || result.data.size > maximumDocumentSizeBytes) return unavailable();

    const signature = signatures[photo.mimeType];
    const prefix = new Uint8Array(await result.data.slice(0, signature.length).arrayBuffer());
    if (!signature.every((byte, index) => prefix[index] === byte)) return unavailable();
    return new Response(result.data, {
      headers: { ...privateHeaders, "Content-Type": photo.mimeType, "Content-Length": String(result.data.size) },
    });
  } catch {
    return unavailable();
  }
}
