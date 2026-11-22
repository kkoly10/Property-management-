import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { isPlausibleTokenHash } from "@/lib/auth/invitation-link";
import { requireServerSupabaseCredential } from "@/lib/supabase/admin";
import { requirePublicSupabaseConfig } from "@/lib/supabase/config";

export const PASSWORD_RECOVERY_COOKIES = ["__Host-crecy-recovery", "crecy-recovery-local"] as const;
export const PASSWORD_RECOVERY_TTL_SECONDS = 600;

export function passwordRecoveryCookieOptions(name: (typeof PASSWORD_RECOVERY_COOKIES)[number]) {
  return { httpOnly: true, sameSite: "lax" as const, path: "/", secure: name === PASSWORD_RECOVERY_COOKIES[0] };
}

function recoveryProof(tokenHash: string): string {
  const configured = process.env.CRECY_PASSWORD_RECOVERY_SECRET?.trim();
  const secret = configured && !configured.startsWith("replace_")
    ? configured
    : requireServerSupabaseCredential(requirePublicSupabaseConfig().url);
  return createHmac("sha256", secret)
    .update("crecy/password-recovery/v1\0")
    .update(tokenHash)
    .digest("base64url");
}

export function passwordRecoveryUrl(origin: string, tokenHash: string): URL {
  const url = new URL("/auth/confirm", origin);
  url.searchParams.set("type", "recovery");
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("recovery_proof", recoveryProof(tokenHash));
  return url;
}

export function isPasswordRecoveryProof(tokenHash: unknown, proof: unknown): boolean {
  if (!isPlausibleTokenHash(tokenHash) || typeof proof !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(proof)) return false;
  try {
    // Supabase accepts magic links and recovery links from the same token store.
    // The proof binds this link to the recovery request Crecy issued.
    return timingSafeEqual(Buffer.from(proof), Buffer.from(recoveryProof(tokenHash)));
  } catch {
    return false;
  }
}

export function readPasswordRecovery(
  cookies: { get(name: string): { value: string } | undefined },
) {
  for (const name of PASSWORD_RECOVERY_COOKIES) {
    const value = cookies.get(name)?.value;
    if (!value) continue;
    const [flowId, tokenHash, proof, extra] = value.split(".");
    if (extra !== undefined || !/^[a-f0-9-]{36}$/.test(flowId) || !isPasswordRecoveryProof(tokenHash, proof)) continue;
    return { name, flowId, tokenHash };
  }
  return null;
}
