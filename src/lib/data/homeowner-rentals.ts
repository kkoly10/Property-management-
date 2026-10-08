import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationContext, type OperatorOrganization } from "@/lib/organization/context";
export type RentalProperty = {
  id: string; name: string; address_line1: string; locality: string | null;
  subdivision_code: string | null; postal_code: string | null;
  country_code: string; time_zone: string; accounting_book_id: string;
};
export type RentalBook = { id: string; name: string; functional_currency_code: string };
export type RentalUnit = { id: string; property_id: string; unit_code: string; unit_type: string | null; bedrooms: number | null; bathrooms: number | null; rental_details: Record<string, unknown> };
export type RentalWorkspace = {
  mode: "setup" | "ready" | "error" | "unavailable";
  organization: OperatorOrganization | null; actorId: string | null;
  properties: RentalProperty[]; books: RentalBook[]; units: RentalUnit[]; occupiedUnitIds: string[];
};
export async function getRentalWorkspace(): Promise<RentalWorkspace> {
  const context = await getOrganizationContext();
  const empty = { organization: context.active, actorId: null, properties: [], books: [], units: [], occupiedUnitIds: [] };
  if (context.state === "setup") return { ...empty, mode: "setup" };
  if (context.state !== "active" || context.active.customerPath !== "self_managing") return { ...empty, mode: "unavailable" };
  try {
    const supabase = await createClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return { ...empty, mode: "unavailable" };
    const org = context.active.organizationId;
    const results = await Promise.all([
      supabase.from("properties").select("id,name,address_line1,locality,subdivision_code,postal_code,country_code,time_zone,accounting_book_id").eq("organization_id", org).is("archived_at", null).neq("status", "archived").order("name"),
      supabase.from("accounting_books").select("id,name,functional_currency_code").eq("organization_id", org).eq("status", "open").order("name"),
      supabase.from("units").select("id,property_id,unit_code,unit_type,bedrooms,bathrooms,rental_details").eq("organization_id", org).is("archived_at", null).eq("operational_status", "active").order("unit_code"),
      supabase.from("tenancies").select("unit_id").eq("organization_id", org).in("status", ["active", "scheduled", "notice_given", "move_out_in_progress"]),
    ]);
    if (results.some((result) => result.error)) return { ...empty, mode: "error" };
    const properties = results[0].data as RentalProperty[];
    const propertyIds = new Set(properties.map((property) => property.id));
    return { mode: "ready", organization: context.active, actorId: auth.user.id,
      properties, books: results[1].data as RentalBook[],
      units: (results[2].data as RentalUnit[]).filter((unit) => propertyIds.has(unit.property_id)),
      occupiedUnitIds: (results[3].data ?? []).map((row) => String(row.unit_id)),
    };
  } catch { return { ...empty, mode: "error" }; }
}
