import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requirePublicSupabaseConfig } from "@/lib/supabase/config";

/**
 * The server-side credentials that bypass RLS, in preference order.
 *
 * Two names, because two things provision them and both are legitimate:
 *
 *   * `SUPABASE_SECRET_KEY` — the modern `sb_secret_…` key, what this repository documents and what a
 *     self-hosted or manually configured deployment sets.
 *   * `SUPABASE_SERVICE_ROLE_KEY` — the legacy JWT, created automatically by the Supabase↔Vercel
 *     integration. A Vercel deployment linked to Supabase already has it, correct and current.
 *
 * Preferring the modern name means a deployment that sets it properly is unaffected, while one that
 * only has what the integration provisioned still works instead of failing on a variable nobody knew
 * they had to fill in.
 *
 * Legacy JWT keys are on Supabase's deprecation path. When they are retired this fallback stops
 * resolving and the error below names both variables, which is the point: it fails loudly and says
 * exactly what to set.
 */
const ADMIN_CREDENTIALS = ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;

/**
 * A configured value, or undefined.
 *
 * "Set" is not the same as "usable", and conflating them is what made this worth fixing: production
 * carried a `SUPABASE_SECRET_KEY` holding the `replace_me` placeholder from .env.example, so a
 * first-DEFINED lookup would select the placeholder and throw while a real credential sat unused in
 * the next variable. Selection is therefore by usability, not by presence.
 */
function usableCredential(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value || value.includes("replace_me")) return undefined;
  return value;
}

export function createAdminClient() {
  const { url } = requirePublicSupabaseConfig();
  const secretKey = ADMIN_CREDENTIALS.map(usableCredential).find(Boolean);

  if (!secretKey) {
    throw new Error(
      `No server Supabase credential is configured. Set ${ADMIN_CREDENTIALS.join(" or ")} `
      + "to a real value (a placeholder containing \"replace_me\" is treated as unset).",
    );
  }

  return createSupabaseClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
