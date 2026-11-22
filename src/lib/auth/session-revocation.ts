import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const sessionClaims = z.object({
  session_id: z.uuid(),
  role: z.literal("authenticated"),
  is_anonymous: z.literal(false).optional(),
  email: z.string().optional(),
  aal: z.string().optional(),
  amr: z.array(z.union([z.string(), z.object({ method: z.string(), timestamp: z.number().int() })])).optional(),
});

const confirmation = z.object({
  sessionId: z.uuid(),
  confirmation: z.literal("revoke"),
});

const maxVerificationAgeSeconds = 5 * 60;
const clockSkewSeconds = 30;

async function readVerifiedSession() {
  try {
    const supabase = await createClient();
    // The cookie only supplies a candidate token. Authorize using verified JWT claims.
    const session = await supabase.auth.getSession();
    if (session.error && session.error.name !== "AuthSessionMissingError") return { state: "unavailable" } as const;
    const token = session.data.session?.access_token;
    if (!token) return { state: "signed_out" } as const;

    const verified = await supabase.auth.getClaims(token);
    const claims = sessionClaims.safeParse(verified.data?.claims);
    if (verified.error || !claims.success) return { state: "unavailable" } as const;

    const now = Math.floor(Date.now() / 1000);
    const verifiedRecently = claims.data.aal === "aal2" && claims.data.amr?.some((method) =>
      typeof method !== "string" && method.method === "totp"
      && method.timestamp >= now - maxVerificationAgeSeconds
      && method.timestamp <= now + clockSkewSeconds,
    ) === true;
    return { state: "ready", supabase, token, claims: claims.data, verifiedRecently } as const;
  } catch {
    return { state: "unavailable" } as const;
  }
}

export async function getSessionSettings() {
  const session = await readVerifiedSession();
  if (session.state !== "ready") return session;
  return {
    state: "ready",
    sessionId: session.claims.session_id,
    email: session.claims.email,
    verifiedRecently: session.verifiedRecently,
  } as const;
}

export async function revokeOtherSessions(form: FormData) {
  const input = confirmation.safeParse({
    sessionId: form.get("sessionId"),
    confirmation: form.get("confirmation"),
  });
  if (!input.success) return "confirmation_required";
  const session = await readVerifiedSession();
  if (session.state !== "ready") return session.state;
  if (input.data.sessionId !== session.claims.session_id) return "session_changed";
  if (!session.verifiedRecently) return "verification_required";

  try {
    // This invokes the user-authenticated logout endpoint with the exact verified token.
    // The pinned SDK's auth.signOut wrapper treats some rejected responses as success.
    const result = await session.supabase.auth.admin.signOut(session.token, "others");
    return result.error ? "unavailable" : "revoked";
  } catch {
    return "unavailable";
  }
}
