import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requirePublicSupabaseConfig } from "@/lib/supabase/config";

export function createAdminClient() {
  const { url } = requirePublicSupabaseConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey || secretKey.includes("replace_me")) throw new Error("SUPABASE_SECRET_KEY is not configured.");

  return createSupabaseClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
