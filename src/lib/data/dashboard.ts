import "server-only";

import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type DashboardState = {
  mode: "setup" | "ready";
  organizationName: string;
  entityCount: number | null;
  bookCount: number | null;
  bookCurrencies: string[];
};

export async function getDashboardState(): Promise<DashboardState> {
  if (!getPublicSupabaseConfig()) {
    return { mode: "setup", organizationName: "Crecy workspace", entityCount: null, bookCount: null, bookCurrencies: [] };
  }

  const supabase = await createClient();
  const [{ data: organizations }, { count: entityCount }, { data: books, count: bookCount }] = await Promise.all([
    supabase.from("organizations").select("display_name").limit(1),
    supabase.from("operating_entities").select("id", { count: "exact", head: true }),
    supabase.from("accounting_books").select("functional_currency_code", { count: "exact" }),
  ]);

  return {
    mode: "ready",
    organizationName: organizations?.[0]?.display_name ?? "Crecy workspace",
    entityCount: entityCount ?? 0,
    bookCount: bookCount ?? 0,
    bookCurrencies: [...new Set((books ?? []).map((book) => book.functional_currency_code))],
  };
}
