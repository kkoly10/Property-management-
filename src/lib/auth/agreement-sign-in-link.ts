import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { isPlausibleTokenHash } from "@/lib/auth/invitation-link";
import { requireServerSupabaseCredential } from "@/lib/supabase/admin";
import { requirePublicSupabaseConfig } from "@/lib/supabase/config";

const credentialSchema = z.strictObject({
  agreementId: z.uuid(),
  invitationHash: z.string().regex(/^[0-9a-f]{64}$/),
  tokenHash: z.string().refine(isPlausibleTokenHash),
  expiresAt: z.number().int().positive(),
});

function sign(payload: string) {
  const secret = requireServerSupabaseCredential(requirePublicSupabaseConfig().url);
  return createHmac("sha256", secret).update("crecy/rental-agreement-sign-in/v1\0").update(payload).digest("base64url");
}

export function createAgreementSignInLink(origin: string, input: Omit<z.infer<typeof credentialSchema>, "expiresAt">): URL {
  const credential = credentialSchema.parse({ ...input, expiresAt: Date.now() + 10 * 60_000 });
  const payload = Buffer.from(JSON.stringify(credential)).toString("base64url");
  const url = new URL(`/documents/agreements/${credential.agreementId}/claim`, origin);
  url.hash = `sign_in=${payload}.${sign(payload)}`;
  return url;
}

export function readAgreementSignInLink(agreementId: string, credential: string) {
  const parts = /^([A-Za-z0-9_-]{1,1024})\.([A-Za-z0-9_-]{43})$/.exec(credential);
  if (!parts) return null;
  const [, payload, proof] = parts;
  try {
    if (!timingSafeEqual(Buffer.from(proof), Buffer.from(sign(payload)))) return null;
    const result = credentialSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    return result.success && result.data.agreementId === agreementId && result.data.expiresAt > Date.now() ? result.data : null;
  } catch {
    return null;
  }
}
