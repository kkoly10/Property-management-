import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getRentalWorkspace } from "@/lib/data/homeowner-rentals";

export type RentalInquiryItem = {
  id: string;
  publicReference: string;
  listingId: string;
  unitId: string;
  firstName: string;
  lastName: string;
  email: string;
  question: string;
  status: "open" | "closed";
  verifiedAt: string;
  createdAt: string;
  version: number;
};

export type RentalInquiryWorkspace = {
  mode: "setup" | "ready" | "error" | "unavailable" | "not_found";
  organizationId: string | null;
  unitId: string;
  unitName: string;
  items: RentalInquiryItem[];
};

const PREVIEW_UNIT = "80000000-0000-4000-8000-000000000008";

function previewItem(): RentalInquiryItem {
  return {
    id: "98000000-0000-4000-8000-000000000098",
    publicReference: "INQ-DEMO12345678",
    listingId: "99000000-0000-4000-8000-000000000099",
    unitId: PREVIEW_UNIT,
    firstName: "Jamie",
    lastName: "Renter",
    email: "jamie.renter@example.com",
    question: "Is the driveway parking space available every day, and is water included in the monthly rent?",
    status: "open",
    verifiedAt: "2026-09-26T08:00:00Z",
    createdAt: "2026-09-26T07:55:00Z",
    version: 2,
  };
}

export async function getRentalInquiryWorkspace(unitId: string): Promise<RentalInquiryWorkspace> {
  const rental = await getRentalWorkspace();
  const base = {
    organizationId: rental.organization?.organizationId ?? null,
    unitId,
    unitName: "Rental",
    items: [] as RentalInquiryItem[],
  };
  if (rental.mode === "setup") {
    return { ...base, mode: "setup", unitName: "Sample basement apartment", items: unitId === PREVIEW_UNIT ? [previewItem()] : [] };
  }
  if (rental.mode === "unavailable") return { ...base, mode: "unavailable" };
  if (rental.mode === "error") return { ...base, mode: "error" };
  const unit = rental.units.find((item) => item.id === unitId);
  if (!unit || !rental.organization) return { ...base, mode: "not_found" };

  try {
    const supabase = await createClient();
    const organizationId = rental.organization.organizationId;
    const { data, error } = await supabase.from("rental_inquiries")
      .select("id,public_reference,listing_id,unit_id,first_name,last_name,email,question,status,verified_at,created_at,version")
      .eq("organization_id", organizationId)
      .eq("unit_id", unitId)
      .in("status", ["open", "closed"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return { ...base, organizationId, unitName: unit.unit_code, mode: "error" };

    return {
      mode: "ready",
      organizationId,
      unitId,
      unitName: unit.unit_code,
      items: (data ?? []).map((row) => ({
        id: String(row.id),
        publicReference: String(row.public_reference),
        listingId: String(row.listing_id),
        unitId: String(row.unit_id),
        firstName: String(row.first_name),
        lastName: String(row.last_name),
        email: String(row.email),
        question: String(row.question),
        status: row.status === "closed" ? "closed" : "open",
        verifiedAt: String(row.verified_at),
        createdAt: String(row.created_at),
        version: Number(row.version),
      })),
    };
  } catch {
    return { ...base, organizationId: rental.organization.organizationId, unitName: unit.unit_code, mode: "error" };
  }
}
