import "server-only";

import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type DashboardState = {
  mode: "setup" | "ready";
  organizationName: string;
  entityCount: number | null;
  bookCount: number | null;
  propertyCount: number | null;
  activeUnitCount: number | null;
  bookCurrencies: string[];
};

export async function getDashboardState(): Promise<DashboardState> {
  if (!getPublicSupabaseConfig()) {
    return { mode: "setup", organizationName: "Crecy workspace", entityCount: null, bookCount: null, propertyCount: null, activeUnitCount: null, bookCurrencies: [] };
  }

  const supabase = await createClient();
  const [{ data: organizations }, { count: entityCount }, { data: books, count: bookCount }, { count: propertyCount }, { count: activeUnitCount }] = await Promise.all([
    supabase.from("organizations").select("display_name").limit(1),
    supabase.from("operating_entities").select("id", { count: "exact", head: true }),
    supabase.from("accounting_books").select("functional_currency_code", { count: "exact" }),
    supabase.from("properties").select("id", { count: "exact", head: true }),
    supabase.from("units").select("id", { count: "exact", head: true }).neq("operational_status", "retired"),
  ]);

  return {
    mode: "ready",
    organizationName: organizations?.[0]?.display_name ?? "Crecy workspace",
    entityCount: entityCount ?? 0,
    bookCount: bookCount ?? 0,
    propertyCount: propertyCount ?? 0,
    activeUnitCount: activeUnitCount ?? 0,
    bookCurrencies: [...new Set((books ?? []).map((book) => book.functional_currency_code))],
  };
}
