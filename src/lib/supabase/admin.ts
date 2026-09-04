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

/**
 * True when the Supabase↔Vercel integration is bound to the SAME project the app is configured for.
 *
 * This guard is not hypothetical. On this deployment the integration was linked to a different,
 * PAUSED Supabase project, so SUPABASE_SERVICE_ROLE_KEY was a perfectly valid key for the wrong
 * database. Pairing it with the correct project URL produced authenticated-looking requests that
 * failed inside every RPC — a 422 "jobs could not be claimed" instead of a legible configuration
 * error. A credential for another project is not a fallback; it is a worse failure than none.
 */
function integrationMatchesConfiguredProject(configuredUrl: string): boolean {
  const integrationUrl = process.env.SUPABASE_URL?.trim();
  if (!integrationUrl) return false;
  try {
    return new URL(integrationUrl).host === new URL(configuredUrl).host;
  } catch {
    return false;
  }
}

export function createAdminClient() {
  const { url } = requirePublicSupabaseConfig();
  const names = integrationMatchesConfiguredProject(url)
    ? ADMIN_CREDENTIALS
    : ADMIN_CREDENTIALS.filter((name) => name !== "SUPABASE_SERVICE_ROLE_KEY");
  const secretKey = names.map(usableCredential).find(Boolean);

  if (!secretKey) {
    throw new Error(
      `No server Supabase credential is configured for ${new URL(url).host}. Set SUPABASE_SECRET_KEY `
      + "to that project's secret key. (A placeholder containing \"replace_me\" counts as unset, and "
      + "SUPABASE_SERVICE_ROLE_KEY is ignored unless SUPABASE_URL names the same project.)",
    );
  }

  return createSupabaseClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
