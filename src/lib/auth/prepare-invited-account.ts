import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateInvitationAuthToken, type InvitationAuthToken } from "./invitation-link";

/** The caller has already authorized delivery to the exact address. */
export async function prepareInvitedAccountToken(admin: SupabaseClient, email: string): Promise<InvitationAuthToken> {
  const unavailable = { ok: false, code: "AUTH_LINK_UNAVAILABLE" } as const;
  const resolved = await admin.rpc("resolve_auth_user_by_email", { p_email: email });
  if (resolved.error) return unavailable;
  if (typeof resolved.data !== "string") {
    const created = await admin.auth.admin.createUser({ email, email_confirm: false });
    if (created.error || !created.data.user) {
      // A second authorized request may have created the identity first.
      const conflict = await admin.rpc("resolve_auth_user_by_email", { p_email: email });
      if (conflict.error || typeof conflict.data !== "string") return unavailable;
    }
  }
  return generateInvitationAuthToken(admin, { email });
}
