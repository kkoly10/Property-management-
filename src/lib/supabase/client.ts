"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requirePublicSupabaseConfig } from "@/lib/supabase/config";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (!browserClient) {
    const { url, publishableKey } = requirePublicSupabaseConfig();
    browserClient = createBrowserClient(url, publishableKey);
  }

  return browserClient;
}
