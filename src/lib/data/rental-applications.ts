import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getRentalWorkspace } from "@/lib/data/homeowner-rentals";

export type RentalApplicationItem = {
  id: string; publicReference: string;
  firstName: string; lastName: string; email: string;
  desiredMoveInOn: string; leaseTermText: string; applicantNote: string;
  listingTitle: string; rentAmountMinor: number; currencyCode: string;
  status: "submitted" | "lease_preparation" | "withdrawn" | "closed" | "converted";
  createdAt: string; version: number;
};
export type RentalApplicationWorkspace = {
  mode: "setup" | "ready" | "error" | "unavailable" | "not_found";
  organizationId: string | null; unitId: string; unitName: string;
  items: RentalApplicationItem[];
};

export async function getRentalApplicationWorkspace(unitId: string): Promise<RentalApplicationWorkspace> {
  const rental = await getRentalWorkspace();
  const base = {
    organizationId: rental.organization?.organizationId ?? null,
    unitId, unitName: "Rental", items: [] as RentalApplicationItem[],
  };
  if (rental.mode === "setup") return { ...base, mode: "setup" };
  if (rental.mode === "unavailable") return { ...base, mode: "unavailable" };
  if (rental.mode === "error") return { ...base, mode: "error" };
  const unit = rental.units.find((item) => item.id === unitId);
  if (!unit || !rental.organization) return { ...base, mode: "not_found" };
  const organizationId = rental.organization.organizationId;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("rental_applications")
      .select("id,public_reference,first_name,last_name,email,desired_move_in_on,lease_term_text,applicant_note,listing_title_snapshot,listing_rent_amount_minor,currency_code,status,created_at,version")
      .eq("organization_id", organizationId)
      .eq("unit_id", unitId)
      .in("status", ["submitted", "lease_preparation", "withdrawn", "closed", "converted"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return { ...base, mode: "error" };
    return {
      ...base, mode: "ready", organizationId, unitName: unit.unit_code,
      items: (data ?? []).map((row) => ({
        id: String(row.id), publicReference: String(row.public_reference),
        firstName: String(row.first_name), lastName: String(row.last_name), email: String(row.email),
        desiredMoveInOn: String(row.desired_move_in_on), leaseTermText: String(row.lease_term_text),
        applicantNote: String(row.applicant_note),
        listingTitle: String(row.listing_title_snapshot),
        rentAmountMinor: Number(row.listing_rent_amount_minor),
        currencyCode: String(row.currency_code),
        status: (row.status === "lease_preparation" || row.status === "withdrawn"
          || row.status === "closed" || row.status === "converted")
          ? row.status : "submitted",
        createdAt: String(row.created_at), version: Number(row.version),
      })),
    };
  } catch {
    return { ...base, mode: "error" };
  }
}
