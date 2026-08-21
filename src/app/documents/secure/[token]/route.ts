import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { hashSecureLinkToken } from "@/lib/notifications/secure-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public redemption of a secure document link.
 *
 * Unauthenticated by necessity — the recipient may have no portal account; the token IS the
 * credential. Every rejection returns the same 404 with the same wording so the token space cannot be
 * probed for which links exist, and nothing here is cacheable.
 */
const notRedeemable = () =>
  NextResponse.json(
    { error: "This link is not valid. It may have expired or already been replaced." },
    { status: 404, headers: { "cache-control": "no-store" } },
  );

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const rawToken = decodeURIComponent(token ?? "").trim();
  if (!rawToken || rawToken.length < 16 || rawToken.length > 512) return notRedeemable();
  if (!getPublicSupabaseConfig()) return notRedeemable();

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Secure links require the server-side Supabase secret key." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const { data, error } = await admin.rpc("redeem_document_secure_link", {
    p_token_hash: hashSecureLinkToken(rawToken),
  });
  if (error || !data) return notRedeemable();

  const delivery = data as { storageBucket?: string; storagePath?: string; fileName?: string };
  if (!delivery.storageBucket || !delivery.storagePath) return notRedeemable();

  const signed = await admin.storage
    .from(delivery.storageBucket)
    .createSignedUrl(delivery.storagePath, 300, { download: delivery.fileName ?? undefined });
  if (signed.error || !signed.data) {
    return NextResponse.json(
      { error: "The document could not be prepared for download." },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.redirect(signed.data.signedUrl, 303);
}
